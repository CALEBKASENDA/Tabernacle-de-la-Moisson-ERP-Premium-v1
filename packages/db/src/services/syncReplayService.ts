import type { TenantContext } from '../tenantContext';
import type { AppDatabase } from '../database/appDatabase';
import type { SyncEventIngestInput } from '../repositories/auditRepository';
import { ExchangeRateRepository } from '../repositories/exchangeRateRepository';
import { FinancialOperationRepository } from '../repositories/financialOperationRepository';
import {
  computeFinancialOperation,
  formatMoneyMicro,
  parseMoneyMicro,
  convertCdfToUsd,
  type PiecePrefix,
} from '@tabernacle/erp-premium-domain';

function parsePayload(ev: SyncEventIngestInput): Record<string, unknown> {
  try {
    return JSON.parse(ev.payloadJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function metaDate(payload: Record<string, unknown>): string | null {
  const meta = payload._meta as { effectiveDate?: string } | undefined;
  return meta?.effectiveDate ?? (typeof payload.effectiveDate === 'string' ? payload.effectiveDate : null);
}

/** Applique un événement sync distant sur la base locale (sans re-journaliser). */
export class SyncReplayService {
  private readonly exchangeRates: ExchangeRateRepository;
  private readonly operations: FinancialOperationRepository;

  constructor(private readonly db: AppDatabase) {
    this.exchangeRates = new ExchangeRateRepository(db);
    this.operations = new FinancialOperationRepository(db);
  }

  applyEvent(ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    const ctx: TenantContext = {
      churchId: ev.churchId,
      userId: 'sync',
      sessionId: 'sync',
      workstationId: 'sync',
    };

    switch (ev.entityType) {
      case 'financial_operation':
        return this.applyFinancialOperation(ctx, ev);
      case 'exchange_rate':
        return this.applyExchangeRate(ctx, ev);
      case 'envelope':
        return this.applyEnvelopeRecalc(ctx, ev);
      case 'cash_transaction':
        return this.applyCashRecalc(ctx, ev);
      case 'bank_transaction':
        return this.applyBankRecalc(ctx, ev);
      case 'faith_pledge':
        return this.applyFaithPledge(ctx, ev);
      case 'faith_pledge_payment':
        return this.applyFaithPledgePayment(ctx, ev);
      case 'counting_session':
        return this.applyCountingSession(ctx, ev);
      case 'counting_line':
        return this.applyCountingLine(ctx, ev);
      case 'finance_budget':
        return this.applyFinanceBudget(ctx, ev);
      case 'finance_budget_line':
        return this.applyFinanceBudgetLine(ctx, ev);
      default:
        return Promise.resolve({ applied: false, reason: `Type non supporté: ${ev.entityType}` });
    }
  }

  private async applyExchangeRate(
    ctx: TenantContext,
    ev: SyncEventIngestInput
  ): Promise<{ applied: boolean; reason?: string }> {
    const op = ev.operation.toUpperCase();
    if (op !== 'CREATE' && op !== 'UPDATE') {
      return { applied: false, reason: `Opération ${ev.operation} non supportée pour exchange_rate` };
    }

    const payload = parsePayload(ev);
    const effectiveDate = metaDate(payload);
    const base = String(payload.base ?? 'USD') as 'USD' | 'CDF';
    const quote = String(payload.quote ?? 'CDF') as 'USD' | 'CDF';
    const rate = String(payload.rate ?? '');
    if (!effectiveDate || !rate) {
      return { applied: false, reason: 'effectiveDate ou rate manquant dans le payload' };
    }

    this.exchangeRates.upsertDynamicUsdCdf({
      ctx,
      effectiveDate,
      baseCurrency: base,
      quoteCurrency: quote,
      rateValue: rate,
    });
    return { applied: true };
  }

  private async applyEnvelopeRecalc(
    ctx: TenantContext,
    ev: SyncEventIngestInput
  ): Promise<{ applied: boolean; reason?: string }> {
    if (ev.operation.toUpperCase() !== 'RECALC') {
      return { applied: false, reason: 'Seul RECALC est supporté pour envelope' };
    }
    const payload = parsePayload(ev);
    const amountUsdConverted = payload.amount_usd_converted;
    if (amountUsdConverted == null) {
      return { applied: false, reason: 'amount_usd_converted manquant' };
    }

    const meta = payload._meta as { effectiveDate?: string } | undefined;
    const effectiveDate = meta?.effectiveDate;
    let rateId: string | null = null;
    let rateVal: string | null = null;
    if (effectiveDate) {
      const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx, effectiveDate });
      if (rate) {
        rateId = rate.exchangeRateId;
        rateVal = formatMoneyMicro({ currency: 'CDF', amountMicro: rate.rateQuotePer1BaseMicro });
      }
    }

    const existing = this.db.get<{ envelope_id: string }>(
      `SELECT envelope_id FROM envelope WHERE church_id=@church_id AND envelope_id=@id`,
      { church_id: ctx.churchId, id: ev.entityId }
    );
    if (!existing) return { applied: false, reason: 'Enveloppe introuvable' };

    const now = new Date().toISOString();
    this.db.run(
      `UPDATE envelope
       SET amount_usd_converted=@usd,
           exchange_rate_usd_id=COALESCE(@rate_id, exchange_rate_usd_id),
           usd_rate_quote_per_1_usd=COALESCE(@rate_val, usd_rate_quote_per_1_usd),
           updated_at=@now, updated_by_user_id=@user
       WHERE church_id=@church_id AND envelope_id=@id`,
      {
        usd: String(amountUsdConverted),
        rate_id: rateId,
        rate_val: rateVal,
        now,
        user: ctx.userId,
        church_id: ctx.churchId,
        id: ev.entityId,
      }
    );
    return { applied: true };
  }

  private async applyCashRecalc(
    ctx: TenantContext,
    ev: SyncEventIngestInput
  ): Promise<{ applied: boolean; reason?: string }> {
    if (ev.operation.toUpperCase() !== 'RECALC') {
      return { applied: false, reason: 'Seul RECALC est supporté pour cash_transaction' };
    }
    const payload = parsePayload(ev);
    const recUsd = payload.receipts_usd_converted;
    const expUsd = payload.expenses_usd_converted;
    if (recUsd == null && expUsd == null) {
      return { applied: false, reason: 'Montants USD manquants' };
    }

    const meta = payload._meta as { effectiveDate?: string } | undefined;
    const effectiveDate = meta?.effectiveDate;
    let rateId: string | null = null;
    let rateVal: string | null = null;
    if (effectiveDate) {
      const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx, effectiveDate });
      if (rate) {
        rateId = rate.exchangeRateId;
        rateVal = formatMoneyMicro({ currency: 'CDF', amountMicro: rate.rateQuotePer1BaseMicro });
      }
    }

    const existing = this.db.get<{ cash_transaction_id: string }>(
      `SELECT cash_transaction_id FROM cash_transaction WHERE church_id=@church_id AND cash_transaction_id=@id`,
      { church_id: ctx.churchId, id: ev.entityId }
    );
    if (!existing) return { applied: false, reason: 'Transaction caisse introuvable' };

    this.db.run(
      `UPDATE cash_transaction
       SET receipts_usd_converted=COALESCE(@rec_usd, receipts_usd_converted),
           expenses_usd_converted=COALESCE(@exp_usd, expenses_usd_converted),
           exchange_rate_usd_id=COALESCE(@rate_id, exchange_rate_usd_id),
           usd_rate_quote_per_1_usd=COALESCE(@rate_val, usd_rate_quote_per_1_usd)
       WHERE church_id=@church_id AND cash_transaction_id=@id`,
      {
        rec_usd: recUsd != null ? String(recUsd) : null,
        exp_usd: expUsd != null ? String(expUsd) : null,
        rate_id: rateId,
        rate_val: rateVal,
        church_id: ctx.churchId,
        id: ev.entityId,
      }
    );
    return { applied: true };
  }

  private async applyBankRecalc(
    ctx: TenantContext,
    ev: SyncEventIngestInput
  ): Promise<{ applied: boolean; reason?: string }> {
    if (ev.operation.toUpperCase() !== 'RECALC') {
      return { applied: false, reason: 'Seul RECALC est supporté pour bank_transaction' };
    }
    const payload = parsePayload(ev);
    const recUsd = payload.receipts_usd_converted;
    const expUsd = payload.expenses_usd_converted;
    if (recUsd == null && expUsd == null) {
      return { applied: false, reason: 'Montants USD manquants' };
    }

    const meta = payload._meta as { effectiveDate?: string } | undefined;
    const effectiveDate = meta?.effectiveDate;
    let rateId: string | null = null;
    let rateVal: string | null = null;
    if (effectiveDate) {
      const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx, effectiveDate });
      if (rate) {
        rateId = rate.exchangeRateId;
        rateVal = formatMoneyMicro({ currency: 'CDF', amountMicro: rate.rateQuotePer1BaseMicro });
      }
    }

    const existing = this.db.get<{ bank_transaction_id: string }>(
      `SELECT bank_transaction_id FROM bank_transaction WHERE church_id=@church_id AND bank_transaction_id=@id`,
      { church_id: ctx.churchId, id: ev.entityId }
    );
    if (!existing) return { applied: false, reason: 'Transaction banque introuvable' };

    this.db.run(
      `UPDATE bank_transaction
       SET receipts_usd_converted=COALESCE(@rec_usd, receipts_usd_converted),
           expenses_usd_converted=COALESCE(@exp_usd, expenses_usd_converted),
           exchange_rate_usd_id=COALESCE(@rate_id, exchange_rate_usd_id),
           usd_rate_quote_per_1_usd=COALESCE(@rate_val, usd_rate_quote_per_1_usd)
       WHERE church_id=@church_id AND bank_transaction_id=@id`,
      {
        rec_usd: recUsd != null ? String(recUsd) : null,
        exp_usd: expUsd != null ? String(expUsd) : null,
        rate_id: rateId,
        rate_val: rateVal,
        church_id: ctx.churchId,
        id: ev.entityId,
      }
    );
    return { applied: true };
  }

  private async applyFaithPledge(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    if (ev.operation.toUpperCase() !== 'CREATE') {
      return { applied: false, reason: 'Seul CREATE supporté pour faith_pledge' };
    }
    const existing = this.db.get(`SELECT pledge_id FROM faith_pledge WHERE church_id=@c AND pledge_id=@id`, {
      c: ctx.churchId,
      id: ev.entityId,
    });
    if (existing) return { applied: false, reason: 'Déjà présent' };

    const p = parsePayload(ev);
    const now = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);
    const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx, effectiveDate: today });
    const cdf = String(p.pledgeAmountCdf ?? p.pledge_amount_cdf ?? '0');
    const usdMicro = rate
      ? convertCdfToUsd({ cdfMicro: parseMoneyMicro('CDF', cdf).amountMicro, rate })
      : 0n;

    this.db.run(
      `INSERT INTO faith_pledge (pledge_id, church_id, follower, pledge_amount_cdf, pledge_amount_usd_converted,
        pledge_amount_usd, start_date, end_date, created_at, created_by_user_id, updated_at, updated_by_user_id)
       VALUES (@id, @c, @follower, @cdf, @usd_conv, @usd_dir, @start, @end, @now, @user, @now, @user)`,
      {
        id: ev.entityId,
        c: ctx.churchId,
        follower: String(p.follower ?? 'Sync'),
        cdf,
        usd_conv: formatMoneyMicro({ currency: 'USD', amountMicro: usdMicro }),
        usd_dir: String(p.pledgeAmountUsd ?? p.pledge_amount_usd ?? '0'),
        start: p.startDate ?? p.start_date ?? null,
        end: p.endDate ?? p.end_date ?? null,
        now,
        user: ctx.userId,
      }
    );
    return { applied: true };
  }

  private async applyFaithPledgePayment(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    if (ev.operation.toUpperCase() !== 'CREATE') {
      return { applied: false, reason: 'Seul CREATE supporté pour faith_pledge_payment' };
    }
    const existing = this.db.get(`SELECT payment_id FROM faith_pledge_payment WHERE payment_id=@id`, { id: ev.entityId });
    if (existing) return { applied: false, reason: 'Déjà présent' };

    const p = parsePayload(ev);
    const paymentDate = String(p.paymentDate ?? p.payment_date ?? new Date().toISOString().slice(0, 10));
    const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx, effectiveDate: paymentDate });
    if (!rate) return { applied: false, reason: `Taux absent pour ${paymentDate}` };

    const amountCdf = String(p.amountCdf ?? p.amount_cdf ?? '0');
    const usdMicro = convertCdfToUsd({ cdfMicro: parseMoneyMicro('CDF', amountCdf).amountMicro, rate });
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO faith_pledge_payment (payment_id, church_id, pledge_id, payment_date, amount_cdf,
        amount_usd_converted, amount_usd, exchange_rate_usd_id, usd_rate_quote_per_1_usd, category_id, fund_id, observation,
        created_at, created_by_user_id)
       VALUES (@id, @c, @pledge, @date, @cdf, @usd_conv, @usd_dir, @rate_id, @rate_val, @cat, @fund, @obs, @now, @user)`,
      {
        id: ev.entityId,
        c: ctx.churchId,
        pledge: String(p.pledgeId ?? p.pledge_id ?? ''),
        date: paymentDate,
        cdf: amountCdf,
        usd_conv: formatMoneyMicro({ currency: 'USD', amountMicro: usdMicro }),
        usd_dir: String(p.amountUsd ?? p.amount_usd ?? '0'),
        rate_id: rate.exchangeRateId,
        rate_val: formatMoneyMicro({ currency: 'CDF', amountMicro: rate.rateQuotePer1BaseMicro }),
        cat: String(p.categoryId ?? p.category_id ?? ''),
        fund: p.fundId ?? p.fund_id ?? null,
        obs: p.observation ?? null,
        now,
        user: ctx.userId,
      }
    );
    return { applied: true };
  }

  private async applyCountingSession(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    const op = ev.operation.toUpperCase();
    const p = parsePayload(ev);
    if (op === 'CREATE') {
      const existing = this.db.get(`SELECT counting_session_id FROM counting_session WHERE counting_session_id=@id`, {
        id: ev.entityId,
      });
      if (existing) return { applied: false, reason: 'Déjà présent' };
      const now = new Date().toISOString();
      this.db.run(
        `INSERT INTO counting_session (counting_session_id, church_id, counting_date, team_name, created_at, created_by_user_id, status)
         VALUES (@id, @c, @date, @team, @now, @user, 'opened')`,
        {
          id: ev.entityId,
          c: ctx.churchId,
          date: String(p.countingDate ?? p.counting_date ?? now.slice(0, 10)),
          team: String(p.teamName ?? p.team_name ?? 'Sync'),
          now,
          user: ctx.userId,
        }
      );
      return { applied: true };
    }
    if (op === 'UPDATE') {
      const now = new Date().toISOString();
      this.db.run(
        `UPDATE counting_session SET status='validated', validated_at=@now, validated_by_user_id=@user WHERE counting_session_id=@id`,
        { now, user: ctx.userId, id: ev.entityId }
      );
      return { applied: true };
    }
    return { applied: false, reason: `Opération ${ev.operation} non supportée` };
  }

  private async applyCountingLine(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    if (ev.operation.toUpperCase() === 'RECALC') {
      return this.applyCountingLineRecalc(ctx, ev);
    }
    if (ev.operation.toUpperCase() !== 'CREATE') {
      return { applied: false, reason: 'CREATE ou RECALC attendu' };
    }
    const existing = this.db.get(`SELECT counting_line_id FROM counting_line WHERE counting_line_id=@id`, { id: ev.entityId });
    if (existing) return { applied: false, reason: 'Déjà présent' };

    const p = parsePayload(ev);
    const sessionId = String(p.sessionId ?? p.counting_session_id ?? '');
    const session = this.db.get<{ counting_date: string }>(
      `SELECT counting_date FROM counting_session WHERE counting_session_id=@id`,
      { id: sessionId }
    );
    const rateDate = session?.counting_date ?? new Date().toISOString().slice(0, 10);
    const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx, effectiveDate: rateDate });
    if (!rate) return { applied: false, reason: 'Taux requis' };

    const cdf = String(p.amountCdf ?? p.amount_cdf ?? '0');
    const usdMicro = convertCdfToUsd({ cdfMicro: parseMoneyMicro('CDF', cdf).amountMicro, rate });
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO counting_line (counting_line_id, counting_session_id, church_id, category_id, fund_id,
        amount_cdf, amount_usd_converted, amount_usd, exchange_rate_usd_id, usd_rate_quote_per_1_usd, created_at, created_by_user_id)
       VALUES (@id, @session, @c, @cat, @fund, @cdf, @usd_conv, @usd_dir, @rate_id, @rate_val, @now, @user)`,
      {
        id: ev.entityId,
        session: sessionId,
        c: ctx.churchId,
        cat: String(p.categoryId ?? p.category_id ?? ''),
        fund: p.fundId ?? p.fund_id ?? null,
        cdf,
        usd_conv: formatMoneyMicro({ currency: 'USD', amountMicro: usdMicro }),
        usd_dir: String(p.amountUsd ?? p.amount_usd ?? '0'),
        rate_id: rate.exchangeRateId,
        rate_val: formatMoneyMicro({ currency: 'CDF', amountMicro: rate.rateQuotePer1BaseMicro }),
        now,
        user: ctx.userId,
      }
    );
    return { applied: true };
  }

  private async applyCountingLineRecalc(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    const payload = parsePayload(ev);
    const amountUsdConverted = payload.amount_usd_converted;
    if (amountUsdConverted == null) return { applied: false, reason: 'amount_usd_converted manquant' };
    this.db.run(
      `UPDATE counting_line SET amount_usd_converted=@usd WHERE church_id=@c AND counting_line_id=@id`,
      { usd: String(amountUsdConverted), c: ctx.churchId, id: ev.entityId }
    );
    return { applied: true };
  }

  private async applyFinanceBudget(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    if (ev.operation.toUpperCase() !== 'CREATE') {
      return { applied: false, reason: 'Seul CREATE supporté pour finance_budget' };
    }
    const existing = this.db.get(`SELECT budget_id FROM finance_budget WHERE budget_id=@id`, { id: ev.entityId });
    if (existing) return { applied: false, reason: 'Déjà présent' };

    const p = parsePayload(ev);
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO finance_budget (budget_id, church_id, budget_type, period_start, period_end, fiscal_year, created_at, created_by_user_id, updated_at, updated_by_user_id)
       VALUES (@id, @c, @type, @start, @end, @year, @now, @user, @now, @user)`,
      {
        id: ev.entityId,
        c: ctx.churchId,
        type: String(p.budgetType ?? p.budget_type ?? 'ANNUAL'),
        start: String(p.periodStart ?? p.period_start ?? ''),
        end: String(p.periodEnd ?? p.period_end ?? ''),
        year: p.fiscalYear ?? p.fiscal_year ?? null,
        now,
        user: ctx.userId,
      }
    );
    return { applied: true };
  }

  private async applyFinanceBudgetLine(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    const op = ev.operation.toUpperCase();
    if (op !== 'CREATE' && op !== 'UPDATE') {
      return { applied: false, reason: 'CREATE/UPDATE attendu' };
    }
    const p = parsePayload(ev);
    const existing = this.db.get<{ budget_line_id: string }>(
      `SELECT budget_line_id FROM finance_budget_line WHERE budget_line_id=@id`,
      { id: ev.entityId }
    );
    const now = new Date().toISOString();
    if (!existing) {
      this.db.run(
        `INSERT INTO finance_budget_line (budget_line_id, budget_id, church_id, category_id, fund_id,
          planned_receipts_usd, planned_expenses_usd, created_at, updated_at)
         VALUES (@id, @budget, @c, @cat, @fund, @pr, @pe, @now, @now)`,
        {
          id: ev.entityId,
          budget: String(p.budgetId ?? p.budget_id ?? ''),
          c: ctx.churchId,
          cat: String(p.categoryId ?? p.category_id ?? ''),
          fund: p.fundId ?? p.fund_id ?? null,
          pr: String(p.plannedReceiptsUsd ?? p.planned_receipts_usd ?? '0'),
          pe: String(p.plannedExpensesUsd ?? p.planned_expenses_usd ?? '0'),
          now,
        }
      );
      return { applied: true };
    }
    this.db.run(
      `UPDATE finance_budget_line SET planned_receipts_usd=@pr, planned_expenses_usd=@pe, updated_at=@now WHERE budget_line_id=@id`,
      {
        pr: String(p.plannedReceiptsUsd ?? p.planned_receipts_usd ?? '0'),
        pe: String(p.plannedExpensesUsd ?? p.planned_expenses_usd ?? '0'),
        now,
        id: ev.entityId,
      }
    );
    return { applied: true };
  }

  private async applyFinancialOperation(
    ctx: TenantContext,
    ev: SyncEventIngestInput
  ): Promise<{ applied: boolean; reason?: string }> {
    const op = ev.operation.toUpperCase();

    if (op === 'CREATE') {
      return this.applyCreate(ctx, ev);
    }
    if (op === 'DELETE') {
      return this.applyDelete(ctx, ev);
    }
    if (op === 'UPDATE') {
      return this.applyUpdate(ctx, ev);
    }
    if (op === 'RESTORE') {
      return this.applyRestore(ctx, ev);
    }

    return { applied: false, reason: `Opération ${ev.operation} non supportée` };
  }

  private async applyCreate(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    const existing = this.db.get<{ operation_id: string }>(
      `SELECT operation_id FROM financial_operation WHERE church_id=@church_id AND operation_id=@id`,
      { church_id: ctx.churchId, id: ev.entityId }
    );
    if (existing) return { applied: false, reason: 'Déjà présent' };

    const payload = parsePayload(ev);
    const pieceType = String(payload.pieceType ?? 'REC') as PiecePrefix;
    const opDate = String(payload.opDate ?? new Date().toISOString().slice(0, 10));
    const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx, effectiveDate: opDate });
    if (!rate) return { applied: false, reason: `Taux absent pour ${opDate}` };

    const receiptsCdf = String(payload.receiptsCdf ?? '0');
    const receiptsUsd = String(payload.receiptsUsd ?? '0');
    const expensesCdf = String(payload.expensesCdf ?? '0');
    const expensesUsd = String(payload.expensesUsd ?? '0');

    const computed = computeFinancialOperation({
      pieceType,
      opDate,
      receiptsCdfMicro: parseMoneyMicro('CDF', receiptsCdf).amountMicro,
      receiptsUsdMicro: parseMoneyMicro('USD', receiptsUsd).amountMicro,
      expensesCdfMicro: parseMoneyMicro('CDF', expensesCdf).amountMicro,
      expensesUsdMicro: parseMoneyMicro('USD', expensesUsd).amountMicro,
      exchangeRate: rate,
    });

    if (!String(payload.categoryId ?? '').trim()) {
      return { applied: false, reason: 'categoryId manquant' };
    }

    const pieceNumber = String(payload.pieceNumber ?? `${pieceType}-SYNC-${ev.entityId.slice(-8)}`);

    await this.operations.create({
      ctx,
      operation: {
        operationId: ev.entityId,
        pieceNumber,
        opDate,
        pieceType,
        label: String(payload.label ?? 'Sync'),
        beneficiary: payload.beneficiary != null ? String(payload.beneficiary) : null,
        categoryId: String(payload.categoryId ?? ''),
        fundId: payload.fundId != null ? String(payload.fundId) : null,
        eventId: payload.eventId != null ? String(payload.eventId) : null,
        receiptsCdf,
        receiptsUsdConverted: formatMoneyMicro({ currency: 'USD', amountMicro: computed.receiptsUsdConvertedMicro }),
        receiptsUsd,
        expensesCdf,
        expensesUsdConverted: formatMoneyMicro({ currency: 'USD', amountMicro: computed.expensesUsdConvertedMicro }),
        expensesUsd,
        observation: payload.observation != null ? String(payload.observation) : null,
        exchangeRateUsdId: rate.exchangeRateId,
        usdRateQuotePer1Usd: formatMoneyMicro({ currency: 'CDF', amountMicro: rate.rateQuotePer1BaseMicro }),
        isLockedByClosure: false,
      },
    });

    return { applied: true };
  }

  private async applyDelete(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    const payload = parsePayload(ev);
    const reason = typeof payload.reason === 'string' ? payload.reason : 'Sync DELETE';
    await this.operations.softDelete({ ctx, operationId: ev.entityId, reason });
    return { applied: true };
  }

  private async applyUpdate(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    const patch = parsePayload(ev);
    await this.operations.update({
      ctx,
      operationId: ev.entityId,
      patch: {
        label: patch.label != null ? String(patch.label) : undefined,
        beneficiary: patch.beneficiary != null ? String(patch.beneficiary) : undefined,
        categoryId: patch.categoryId != null ? String(patch.categoryId) : undefined,
        fundId: patch.fundId !== undefined ? (patch.fundId != null ? String(patch.fundId) : null) : undefined,
        opDate: patch.opDate != null ? String(patch.opDate) : undefined,
        observation: patch.observation !== undefined ? (patch.observation != null ? String(patch.observation) : null) : undefined,
      },
    });
    return { applied: true };
  }

  private async applyRestore(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    await this.operations.restore({ ctx, operationId: ev.entityId });
    return { applied: true };
  }
}
