import type { TenantContext } from '../tenantContext';
import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import { newId, formatMoneyMicro, parseMoneyMicro } from '@tabernacle/erp-premium-domain';

export class BankRepository {
  constructor(private readonly db: SqliteDatabase) {}

  createBankAccount(params: {
    ctx: TenantContext;
    name: string;
    iban?: string;
    swift?: string;
    currencyCode?: string;
  }): string {
    const now = new Date().toISOString();
    const id = newId('bank');
    this.db.run(
      `INSERT INTO bank_account (bank_account_id, church_id, name, iban, swift, currency_code, is_active, created_at, updated_at)
       VALUES (@id, @church_id, @name, @iban, @swift, @currency, 1, @now, @now)`,
      {
        id,
        church_id: params.ctx.churchId,
        name: params.name,
        iban: params.iban ?? null,
        swift: params.swift ?? null,
        currency: params.currencyCode ?? 'CDF',
        now,
      }
    );
    return id;
  }

  listBankAccounts(ctx: TenantContext): Array<{
    bank_account_id: string;
    name: string;
    iban: string | null;
    swift: string | null;
    currency_code: string;
    is_active: number;
    created_at: string;
  }> {
    return this.db.all(
      `SELECT bank_account_id, name, iban, swift, currency_code, is_active, created_at
       FROM bank_account
       WHERE church_id=@church_id AND is_active=1
       ORDER BY name`,
      { church_id: ctx.churchId }
    );
  }

  setBankAccountActive(params: { ctx: TenantContext; bankAccountId: string; isActive: boolean }): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE bank_account SET is_active=@is_active, updated_at=@now WHERE church_id=@church_id AND bank_account_id=@id`,
      {
        is_active: params.isActive ? 1 : 0,
        now,
        church_id: params.ctx.churchId,
        id: params.bankAccountId,
      }
    );
  }

  createBankTransactionRow(params: {
    ctx: TenantContext;
    bankAccountId: string;
    pieceNumber: string;
    txDate: string;
    label: string;
    beneficiary?: string | null;
    categoryId: string;
    fundId?: string | null;
    eventId?: string | null;
    receiptsCdf: string;
    expensesCdf: string;
    receiptsUsdConverted: string;
    receiptsUsd: string;
    expensesUsdConverted: string;
    expensesUsd: string;
    exchangeRateId: string;
    usdRateQuotePer1Usd: string;
    externalReference?: string | null;
    observation?: string | null;
  }): string {
    const now = new Date().toISOString();
    const id = newId('btx');
    this.db.run(
      `INSERT INTO bank_transaction (
         bank_transaction_id, church_id, bank_account_id,
         piece_type, piece_number, tx_date,
         label, beneficiary, category_id, fund_id, event_id,
         receipts_cdf, receipts_usd_converted, receipts_usd, expenses_cdf, expenses_usd_converted, expenses_usd,
         exchange_rate_usd_id, usd_rate_quote_per_1_usd,
         external_reference, observation,
         created_at, created_by_user_id
       ) VALUES (
         @id, @church_id, @bank_account_id,
         'BAN', @piece_number, @tx_date,
         @label, @beneficiary, @category_id, @fund_id, @event_id,
         @receipts_cdf, @receipts_usd_converted, @receipts_usd, @expenses_cdf, @expenses_usd_converted, @expenses_usd,
         @exchange_rate_usd_id, @usd_rate_quote_per_1_usd,
         @external_reference, @observation,
         @now, @user
       )`,
      {
        id,
        church_id: params.ctx.churchId,
        bank_account_id: params.bankAccountId,
        piece_number: params.pieceNumber,
        tx_date: params.txDate,
        label: params.label,
        beneficiary: params.beneficiary ?? null,
        category_id: params.categoryId,
        fund_id: params.fundId ?? null,
        event_id: params.eventId ?? null,
        receipts_cdf: params.receiptsCdf,
        receipts_usd_converted: params.receiptsUsdConverted,
        receipts_usd: params.receiptsUsd,
        expenses_cdf: params.expensesCdf,
        expenses_usd_converted: params.expensesUsdConverted,
        expenses_usd: params.expensesUsd,
        exchange_rate_usd_id: params.exchangeRateId,
        usd_rate_quote_per_1_usd: params.usdRateQuotePer1Usd,
        external_reference: params.externalReference ?? null,
        observation: params.observation ?? null,
        now,
        user: params.ctx.userId,
      }
    );
    return id;
  }

  createBankReconciliation(params: {
    ctx: TenantContext;
    bankAccountId: string;
    reconciliationDate: string;
    notes?: string;
  }): string {
    const now = new Date().toISOString();
    const id = newId('brec');
    this.db.run(
      `INSERT INTO bank_reconciliation (
         bank_reconciliation_id, church_id, bank_account_id,
         reconciliation_date, status,
         opened_by_user_id, opened_at, notes
       ) VALUES (
         @id, @church_id, @bank_account_id,
         @date, 'open',
         @user, @now, @notes
       )`,
      {
        id,
        church_id: params.ctx.churchId,
        bank_account_id: params.bankAccountId,
        date: params.reconciliationDate,
        user: params.ctx.userId,
        now,
        notes: params.notes ?? null,
      }
    );
    return id;
  }

  addBankReconciliationMatch(params: {
    ctx: TenantContext;
    bankReconciliationId: string;
    bankTransactionId?: string | null;
    externalStatementLineRef: string;
    matchedAmountCdf: string;
  }): string {
    const id = newId('match');
    const matched = params.matchedAmountCdf;
    this.db.run(
      `INSERT INTO bank_reconciliation_match (
         match_id, bank_reconciliation_id, church_id,
         bank_transaction_id, external_statement_line_ref, matched_amount_cdf, created_at
       ) VALUES (
         @id, @rec_id, @church_id,
         @btx_id, @ext_ref, @amount, @now
       )`,
      {
        id,
        rec_id: params.bankReconciliationId,
        church_id: params.ctx.churchId,
        btx_id: params.bankTransactionId ?? null,
        ext_ref: params.externalStatementLineRef,
        amount: matched,
        now: new Date().toISOString(),
      }
    );
    return id;
  }

  listBankReconciliations(ctx: TenantContext) {
    return this.db.all(
      `SELECT r.*, a.name as bank_account_name
       FROM bank_reconciliation r
       JOIN bank_account a ON a.bank_account_id = r.bank_account_id
       WHERE r.church_id=@church_id
       ORDER BY r.reconciliation_date DESC, r.opened_at DESC`,
      { church_id: ctx.churchId }
    );
  }

  validateBankReconciliation(params: { ctx: TenantContext; bankReconciliationId: string }): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE bank_reconciliation
          SET status='validated',
              validated_by_user_id=@user,
              validated_at=@now
        WHERE church_id=@church_id AND bank_reconciliation_id=@id`,
      {
        user: params.ctx.userId,
        now,
        church_id: params.ctx.churchId,
        id: params.bankReconciliationId,
      }
    );
  }

  listBankTransactions(params: { ctx: TenantContext; bankAccountId: string; limit?: number }) {
    return this.db.all(
      `SELECT bank_transaction_id, piece_number, tx_date, label, beneficiary,
              receipts_cdf, expenses_cdf, receipts_usd, expenses_usd, external_reference
       FROM bank_transaction
       WHERE church_id=@church_id AND bank_account_id=@account_id
       ORDER BY tx_date DESC, created_at DESC
       LIMIT @limit`,
      {
        church_id: params.ctx.churchId,
        account_id: params.bankAccountId,
        limit: params.limit ?? 100,
      }
    );
  }

  listReconciliationMatches(params: { ctx: TenantContext; bankReconciliationId: string }) {
    return this.db.all(
      `SELECT m.*, t.piece_number, t.tx_date, t.label
       FROM bank_reconciliation_match m
       LEFT JOIN bank_transaction t ON t.bank_transaction_id = m.bank_transaction_id
       WHERE m.church_id=@church_id AND m.bank_reconciliation_id=@rec_id
       ORDER BY m.created_at DESC`,
      { church_id: params.ctx.churchId, rec_id: params.bankReconciliationId }
    );
  }
}

