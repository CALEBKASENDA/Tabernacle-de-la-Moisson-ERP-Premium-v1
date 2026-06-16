import type { TenantContext } from '../tenantContext';
import type { AppDatabase } from '../database/appDatabase';
import {
  type ExchangeRate,
  computeFinancialOperation,
  buildAuditEntry,
  formatMoneyMicro,
  parseMoneyMicro,
  convertCdfToUsd,
} from '@tabernacle/erp-premium-domain';
import { AuditRepository } from '../repositories/auditRepository';

export class FinanceRecalculationService {
  constructor(
    private readonly db: AppDatabase,
    private readonly auditRepo: AuditRepository
  ) {}

  async recalcFinancialOperationsForUsdCdfRate(params: {
    ctx: TenantContext;
    effectiveDate: string;
    usdExchangeRate: ExchangeRate;
    exchangeRateId: string;
    changedAtIso?: string;
  }): Promise<number> {
    const { ctx, effectiveDate, usdExchangeRate, exchangeRateId } = params;
    const changedAt = params.changedAtIso ?? new Date().toISOString();

    const financialRows = this.db.all<{
      operation_id: string;
      piece_type: string;
      receipts_cdf: string;
      expenses_cdf: string;
      expenses_usd: string;
      receipts_usd: string;
      receipts_usd_converted: string;
      expenses_usd_converted: string;
      exchange_rate_usd_id: string | null;
      usd_rate_quote_per_1_usd: string | null;
    }>(
      `SELECT operation_id, piece_type, receipts_cdf, receipts_usd, expenses_cdf, expenses_usd,
              receipts_usd_converted, expenses_usd_converted,
              exchange_rate_usd_id, usd_rate_quote_per_1_usd
       FROM financial_operation
       WHERE church_id=@church_id AND op_date=@op_date
         AND deleted_at IS NULL AND archived_at IS NULL`,
      { church_id: ctx.churchId, op_date: effectiveDate }
    );

    const cashRows = this.db.all<{
      cash_transaction_id: string;
      receipts_cdf: string;
      expenses_cdf: string;
      receipts_usd_converted: string;
      expenses_usd_converted: string;
      exchange_rate_usd_id: string | null;
      usd_rate_quote_per_1_usd: string | null;
    }>(
      `SELECT cash_transaction_id, receipts_cdf, expenses_cdf,
              receipts_usd_converted, expenses_usd_converted,
              exchange_rate_usd_id, usd_rate_quote_per_1_usd
       FROM cash_transaction
       WHERE church_id=@church_id AND op_date=@op_date AND deleted_at IS NULL`,
      { church_id: ctx.churchId, op_date: effectiveDate }
    );

    const bankRows = this.db.all<{
      bank_transaction_id: string;
      receipts_cdf: string;
      expenses_cdf: string;
      receipts_usd_converted: string;
      expenses_usd_converted: string;
      exchange_rate_usd_id: string | null;
      usd_rate_quote_per_1_usd: string | null;
    }>(
      `SELECT bank_transaction_id, receipts_cdf, expenses_cdf,
              receipts_usd_converted, expenses_usd_converted,
              exchange_rate_usd_id, usd_rate_quote_per_1_usd
       FROM bank_transaction
       WHERE church_id=@church_id AND tx_date=@op_date AND deleted_at IS NULL`,
      { church_id: ctx.churchId, op_date: effectiveDate }
    );

    const envelopeRows = this.db.all<{
      envelope_id: string;
      amount_cdf: string;
      amount_usd_converted: string;
      exchange_rate_usd_id: string | null;
      usd_rate_quote_per_1_usd: string | null;
    }>(
      `SELECT envelope_id, amount_cdf, amount_usd_converted,
              exchange_rate_usd_id, usd_rate_quote_per_1_usd
       FROM envelope
       WHERE church_id=@church_id AND envelope_date=@op_date AND deleted_at IS NULL`,
      { church_id: ctx.churchId, op_date: effectiveDate }
    );

    const countingLineRows = this.db.all<{
      counting_line_id: string;
      amount_cdf: string;
      amount_usd_converted: string;
      exchange_rate_usd_id: string | null;
      usd_rate_quote_per_1_usd: string | null;
    }>(
      `SELECT cl.counting_line_id, cl.amount_cdf, cl.amount_usd_converted,
              cl.exchange_rate_usd_id, cl.usd_rate_quote_per_1_usd
       FROM counting_line cl
       INNER JOIN counting_session cs
               ON cs.counting_session_id = cl.counting_session_id
       WHERE cl.church_id=@church_id AND cs.counting_date=@op_date`,
      { church_id: ctx.churchId, op_date: effectiveDate }
    );

    const pledgePaymentRows = this.db.all<{
      payment_id: string;
      amount_cdf: string;
      amount_usd_converted: string;
      exchange_rate_usd_id: string | null;
      usd_rate_quote_per_1_usd: string | null;
    }>(
      `SELECT payment_id, amount_cdf, amount_usd_converted,
              exchange_rate_usd_id, usd_rate_quote_per_1_usd
       FROM faith_pledge_payment
       WHERE church_id=@church_id AND payment_date=@op_date`,
      { church_id: ctx.churchId, op_date: effectiveDate }
    );

    const total =
      financialRows.length + cashRows.length + bankRows.length + envelopeRows.length + countingLineRows.length + pledgePaymentRows.length;
    if (total === 0) return 0;

    const rateValCdf = formatMoneyMicro({
      currency: 'CDF',
      amountMicro: usdExchangeRate.rateQuotePer1BaseMicro,
    });

    this.db.withTransaction(() => {
      for (const row of financialRows) {
        const old = {
          receipts_usd_converted: row.receipts_usd_converted,
          expenses_usd_converted: row.expenses_usd_converted,
          exchange_rate_usd_id: row.exchange_rate_usd_id,
          usd_rate_quote_per_1_usd: row.usd_rate_quote_per_1_usd,
        };

        const computed = computeFinancialOperation({
          pieceType: row.piece_type as 'REC',
          opDate: effectiveDate,
          receiptsCdfMicro: parseMoneyMicro('CDF', String(row.receipts_cdf)).amountMicro,
          receiptsUsdMicro: parseMoneyMicro('USD', String(row.receipts_usd ?? '0')).amountMicro,
          expensesCdfMicro: parseMoneyMicro('CDF', String(row.expenses_cdf)).amountMicro,
          expensesUsdMicro: parseMoneyMicro('USD', String(row.expenses_usd)).amountMicro,
          exchangeRate: usdExchangeRate,
        });

        this.db.run(
          `UPDATE financial_operation
           SET receipts_usd_converted=@rec_usd, expenses_usd_converted=@exp_usd,
               exchange_rate_usd_id=@rate_id, usd_rate_quote_per_1_usd=@rate_val,
               rate_base_currency='USD', rate_quote_currency='CDF',
               updated_by_user_id=@user, updated_at=@now
           WHERE church_id=@church_id AND operation_id=@op_id`,
          {
            rec_usd: formatMoneyMicro({ currency: 'USD', amountMicro: computed.receiptsUsdConvertedMicro }),
            exp_usd: formatMoneyMicro({ currency: 'USD', amountMicro: computed.expensesUsdConvertedMicro }),
            rate_id: exchangeRateId,
            rate_val: rateValCdf,
            user: ctx.userId,
            now: changedAt,
            church_id: ctx.churchId,
            op_id: row.operation_id,
          }
        );

        this.auditRepo.append(
          buildAuditEntry({
            churchId: ctx.churchId,
            sessionId: ctx.sessionId,
            workstationId: ctx.workstationId,
            actorUserId: ctx.userId,
            entityType: 'financial_operation',
            entityId: row.operation_id,
            action: 'RECALC',
            oldValue: old,
            newValue: {
              receipts_usd_converted: formatMoneyMicro({
                currency: 'USD',
                amountMicro: computed.receiptsUsdConvertedMicro,
              }),
              expenses_usd_converted: formatMoneyMicro({
                currency: 'USD',
                amountMicro: computed.expensesUsdConvertedMicro,
              }),
            },
            metadata: { effectiveDate, reason: 'TAUX_CHANGE' },
            changedAt,
          })
        );
      }

      for (const row of cashRows) {
        const old = {
          receipts_usd_converted: row.receipts_usd_converted,
          expenses_usd_converted: row.expenses_usd_converted,
          exchange_rate_usd_id: row.exchange_rate_usd_id,
          usd_rate_quote_per_1_usd: row.usd_rate_quote_per_1_usd,
        };

        const receiptsUsd = convertCdfToUsd({
          cdfMicro: parseMoneyMicro('CDF', String(row.receipts_cdf)).amountMicro,
          rate: usdExchangeRate,
        });
        const expensesUsd = convertCdfToUsd({
          cdfMicro: parseMoneyMicro('CDF', String(row.expenses_cdf)).amountMicro,
          rate: usdExchangeRate,
        });

        this.db.run(
          `UPDATE cash_transaction
           SET receipts_usd_converted=@rec_usd, expenses_usd_converted=@exp_usd,
               exchange_rate_usd_id=@rate_id, usd_rate_quote_per_1_usd=@rate_val
           WHERE church_id=@church_id AND cash_transaction_id=@id`,
          {
            rec_usd: formatMoneyMicro({ currency: 'USD', amountMicro: receiptsUsd }),
            exp_usd: formatMoneyMicro({ currency: 'USD', amountMicro: expensesUsd }),
            rate_id: exchangeRateId,
            rate_val: rateValCdf,
            church_id: ctx.churchId,
            id: row.cash_transaction_id,
          }
        );

        this.auditRepo.append(
          buildAuditEntry({
            churchId: ctx.churchId,
            sessionId: ctx.sessionId,
            workstationId: ctx.workstationId,
            actorUserId: ctx.userId,
            entityType: 'cash_transaction',
            entityId: row.cash_transaction_id,
            action: 'RECALC',
            oldValue: old,
            newValue: {
              receipts_usd_converted: formatMoneyMicro({ currency: 'USD', amountMicro: receiptsUsd }),
              expenses_usd_converted: formatMoneyMicro({ currency: 'USD', amountMicro: expensesUsd }),
            },
            metadata: { effectiveDate, reason: 'TAUX_CHANGE' },
            changedAt,
          })
        );
      }

      for (const row of bankRows) {
        const old = {
          receipts_usd_converted: row.receipts_usd_converted,
          expenses_usd_converted: row.expenses_usd_converted,
          exchange_rate_usd_id: row.exchange_rate_usd_id,
          usd_rate_quote_per_1_usd: row.usd_rate_quote_per_1_usd,
        };

        const receiptsUsd = convertCdfToUsd({
          cdfMicro: parseMoneyMicro('CDF', String(row.receipts_cdf)).amountMicro,
          rate: usdExchangeRate,
        });
        const expensesUsd = convertCdfToUsd({
          cdfMicro: parseMoneyMicro('CDF', String(row.expenses_cdf)).amountMicro,
          rate: usdExchangeRate,
        });

        this.db.run(
          `UPDATE bank_transaction
           SET receipts_usd_converted=@rec_usd, expenses_usd_converted=@exp_usd,
               exchange_rate_usd_id=@rate_id, usd_rate_quote_per_1_usd=@rate_val
           WHERE church_id=@church_id AND bank_transaction_id=@id`,
          {
            rec_usd: formatMoneyMicro({ currency: 'USD', amountMicro: receiptsUsd }),
            exp_usd: formatMoneyMicro({ currency: 'USD', amountMicro: expensesUsd }),
            rate_id: exchangeRateId,
            rate_val: rateValCdf,
            church_id: ctx.churchId,
            id: row.bank_transaction_id,
          }
        );

        this.auditRepo.append(
          buildAuditEntry({
            churchId: ctx.churchId,
            sessionId: ctx.sessionId,
            workstationId: ctx.workstationId,
            actorUserId: ctx.userId,
            entityType: 'bank_transaction',
            entityId: row.bank_transaction_id,
            action: 'RECALC',
            oldValue: old,
            newValue: {
              receipts_usd_converted: formatMoneyMicro({ currency: 'USD', amountMicro: receiptsUsd }),
              expenses_usd_converted: formatMoneyMicro({ currency: 'USD', amountMicro: expensesUsd }),
            },
            metadata: { effectiveDate, reason: 'TAUX_CHANGE' },
            changedAt,
          })
        );
      }

      for (const row of envelopeRows) {
        const old = {
          amount_usd_converted: row.amount_usd_converted,
          exchange_rate_usd_id: row.exchange_rate_usd_id,
          usd_rate_quote_per_1_usd: row.usd_rate_quote_per_1_usd,
        };

        const amountUsd = convertCdfToUsd({
          cdfMicro: parseMoneyMicro('CDF', String(row.amount_cdf)).amountMicro,
          rate: usdExchangeRate,
        });

        this.db.run(
          `UPDATE envelope
           SET amount_usd_converted=@usd,
               exchange_rate_usd_id=@rate_id, usd_rate_quote_per_1_usd=@rate_val,
               updated_at=@now, updated_by_user_id=@user
           WHERE church_id=@church_id AND envelope_id=@id`,
          {
            usd: formatMoneyMicro({ currency: 'USD', amountMicro: amountUsd }),
            rate_id: exchangeRateId,
            rate_val: rateValCdf,
            now: changedAt,
            user: ctx.userId,
            church_id: ctx.churchId,
            id: row.envelope_id,
          }
        );

        this.auditRepo.append(
          buildAuditEntry({
            churchId: ctx.churchId,
            sessionId: ctx.sessionId,
            workstationId: ctx.workstationId,
            actorUserId: ctx.userId,
            entityType: 'envelope',
            entityId: row.envelope_id,
            action: 'RECALC',
            oldValue: old,
            newValue: {
              amount_usd_converted: formatMoneyMicro({ currency: 'USD', amountMicro: amountUsd }),
            },
            metadata: { effectiveDate, reason: 'TAUX_CHANGE' },
            changedAt,
          })
        );
      }

      for (const row of countingLineRows) {
        const old = {
          amount_usd_converted: row.amount_usd_converted,
          exchange_rate_usd_id: row.exchange_rate_usd_id,
          usd_rate_quote_per_1_usd: row.usd_rate_quote_per_1_usd,
        };

        const amountUsd = convertCdfToUsd({
          cdfMicro: parseMoneyMicro('CDF', String(row.amount_cdf)).amountMicro,
          rate: usdExchangeRate,
        });

        this.db.run(
          `UPDATE counting_line
           SET amount_usd_converted=@usd,
               exchange_rate_usd_id=@rate_id, usd_rate_quote_per_1_usd=@rate_val
           WHERE church_id=@church_id AND counting_line_id=@id`,
          {
            usd: formatMoneyMicro({ currency: 'USD', amountMicro: amountUsd }),
            rate_id: exchangeRateId,
            rate_val: rateValCdf,
            church_id: ctx.churchId,
            id: row.counting_line_id,
          }
        );

        this.auditRepo.append(
          buildAuditEntry({
            churchId: ctx.churchId,
            sessionId: ctx.sessionId,
            workstationId: ctx.workstationId,
            actorUserId: ctx.userId,
            entityType: 'counting_line',
            entityId: row.counting_line_id,
            action: 'RECALC',
            oldValue: old,
            newValue: {
              amount_usd_converted: formatMoneyMicro({ currency: 'USD', amountMicro: amountUsd }),
            },
            metadata: { effectiveDate, reason: 'TAUX_CHANGE' },
            changedAt,
          })
        );
      }

      for (const row of pledgePaymentRows) {
        const old = {
          amount_usd_converted: row.amount_usd_converted,
          exchange_rate_usd_id: row.exchange_rate_usd_id,
          usd_rate_quote_per_1_usd: row.usd_rate_quote_per_1_usd,
        };

        const amountUsd = convertCdfToUsd({
          cdfMicro: parseMoneyMicro('CDF', String(row.amount_cdf)).amountMicro,
          rate: usdExchangeRate,
        });

        this.db.run(
          `UPDATE faith_pledge_payment
           SET amount_usd_converted=@usd,
               exchange_rate_usd_id=@rate_id, usd_rate_quote_per_1_usd=@rate_val
           WHERE church_id=@church_id AND payment_id=@id`,
          {
            usd: formatMoneyMicro({ currency: 'USD', amountMicro: amountUsd }),
            rate_id: exchangeRateId,
            rate_val: rateValCdf,
            church_id: ctx.churchId,
            id: row.payment_id,
          }
        );

        this.auditRepo.append(
          buildAuditEntry({
            churchId: ctx.churchId,
            sessionId: ctx.sessionId,
            workstationId: ctx.workstationId,
            actorUserId: ctx.userId,
            entityType: 'faith_pledge_payment',
            entityId: row.payment_id,
            action: 'RECALC',
            oldValue: old,
            newValue: {
              amount_usd_converted: formatMoneyMicro({ currency: 'USD', amountMicro: amountUsd }),
            },
            metadata: { effectiveDate, reason: 'TAUX_CHANGE' },
            changedAt,
          })
        );
      }
    });

    return total;
  }
}
