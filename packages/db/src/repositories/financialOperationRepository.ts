import type { TenantContext } from '../tenantContext';
import type { SqliteDatabase } from '../sqlite/sqliteDatabase';

export type FinancialOperationPieceType = 'REC' | 'DEP' | 'CAI' | 'BAN';

export type FinancialOperationRow = {
  operation_id: string;
  church_id: string;
  site_id?: string | null;

  op_date: string;
  piece_type: FinancialOperationPieceType;
  piece_number: string;

  label: string;
  beneficiary?: string | null;
  category_id: string;
  fund_id: string | null;
  event_id?: string | null;

  receipts_cdf: string;
  receipts_usd_converted: string;
  receipts_usd: string;
  expenses_cdf: string;
  expenses_usd_converted: string;
  expenses_usd: string;

  observation?: string | null;

  exchange_rate_usd_id?: string | null;
  usd_rate_quote_per_1_usd?: string | null;

  created_by_user_id: string;
  created_at: string;
  updated_by_user_id: string;
  updated_at: string;

  archived_at?: string | null;
  deleted_at?: string | null;
  deletion_reason?: string | null;
  is_locked_by_closure: number;
};

export class FinancialOperationRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async getById(params: { ctx: TenantContext; operationId: string }): Promise<FinancialOperationRow | null> {
    const { ctx, operationId } = params;
    const row = this.db.get<FinancialOperationRow>(
      `
      SELECT *
        FROM financial_operation
       WHERE church_id=@church_id
         AND operation_id=@operation_id
         AND deleted_at IS NULL
         AND (archived_at IS NULL)
      `,
      { church_id: ctx.churchId, operation_id: operationId }
    );
    return row ?? null;
  }

  async getForAudit(params: { ctx: TenantContext; operationId: string }): Promise<FinancialOperationRow | null> {
    const { ctx, operationId } = params;
    const row = this.db.get<FinancialOperationRow>(
      `
      SELECT *
        FROM financial_operation
       WHERE church_id=@church_id
         AND operation_id=@operation_id
      `,
      { church_id: ctx.churchId, operation_id: operationId }
    );
    return row ?? null;
  }

  async create(params: {
    ctx: TenantContext;
    operation: {
      operationId: string;
      pieceNumber: string;
      opDate: string;
      pieceType: FinancialOperationPieceType;
      label: string;
      beneficiary?: string | null;
      categoryId: string;
      fundId?: string | null;
      eventId?: string | null;
      receiptsCdf: string; // NUMERIC(20,6) decimal string
      receiptsUsdConverted: string;
      receiptsUsd: string;
      expensesCdf: string;
      expensesUsdConverted: string;
      expensesUsd: string;
      observation?: string | null;
      exchangeRateUsdId?: string | null;
      usdRateQuotePer1Usd?: string | null;
      isLockedByClosure: boolean;
    };
  }): Promise<void> {
    const { ctx, operation } = params;

    const now = new Date().toISOString();
    this.db.withTransaction((tx) => {
      tx.prepare(
        `
        INSERT INTO financial_operation (
          operation_id, church_id, site_id,
          op_date, piece_type, piece_number,
          label, beneficiary, category_id, fund_id, event_id,
          receipts_cdf, receipts_usd_converted, receipts_usd,
          expenses_cdf, expenses_usd_converted,
          expenses_usd,
          observation,
          exchange_rate_usd_id, usd_rate_quote_per_1_usd,
          created_by_user_id, created_at,
          updated_by_user_id, updated_at,
          is_locked_by_closure
        ) VALUES (
          @operation_id, @church_id, @site_id,
          @op_date, @piece_type, @piece_number,
          @label, @beneficiary, @category_id, @fund_id, @event_id,
          @receipts_cdf, @receipts_usd_converted, @receipts_usd,
          @expenses_cdf, @expenses_usd_converted,
          @expenses_usd,
          @observation,
          @exchange_rate_usd_id, @usd_rate_quote_per_1_usd,
          @created_by_user_id, @created_at,
          @updated_by_user_id, @updated_at,
          @is_locked_by_closure
        )
        `,
      ).run({
        operation_id: operation.operationId,
        church_id: ctx.churchId,
        site_id: null,
        op_date: operation.opDate,
        piece_type: operation.pieceType,
        piece_number: operation.pieceNumber,
        label: operation.label,
        beneficiary: operation.beneficiary ?? null,
        category_id: operation.categoryId,
        fund_id: operation.fundId ?? null,
        event_id: operation.eventId ?? null,
        receipts_cdf: operation.receiptsCdf,
        receipts_usd_converted: operation.receiptsUsdConverted,
        receipts_usd: operation.receiptsUsd,
        expenses_cdf: operation.expensesCdf,
        expenses_usd_converted: operation.expensesUsdConverted,
        expenses_usd: operation.expensesUsd,
        observation: operation.observation ?? null,
        exchange_rate_usd_id: operation.exchangeRateUsdId ?? null,
        usd_rate_quote_per_1_usd: operation.usdRateQuotePer1Usd ?? null,
        created_by_user_id: ctx.userId,
        created_at: now,
        updated_by_user_id: ctx.userId,
        updated_at: now,
        is_locked_by_closure: operation.isLockedByClosure ? 1 : 0,
      });
    });
  }

  async update(params: {
    ctx: TenantContext;
    operationId: string;
    patch: {
      label?: string;
      beneficiary?: string | null;
      categoryId?: string;
      fundId?: string | null;
      eventId?: string | null;
      opDate?: string;
      receiptsCdf?: string;
      receiptsUsdConverted?: string;
      receiptsUsd?: string;
      expensesCdf?: string;
      expensesUsdConverted?: string;
      expensesUsd?: string;
      observation?: string | null;
      exchangeRateUsdId?: string | null;
      usdRateQuotePer1Usd?: string | null;
      isLockedByClosure?: boolean;
    };
  }): Promise<void> {
    const { ctx, operationId, patch } = params;
    const now = new Date().toISOString();

    // Fetch old row to build dynamic update in a safe way (single operation).
    // Caller should audit separately; repo only mutates.
    const old = this.db.get<FinancialOperationRow>(
      `SELECT * FROM financial_operation WHERE church_id=@church_id AND operation_id=@operation_id`,
      { church_id: ctx.churchId, operation_id: operationId }
    );
    if (!old) throw new Error('Operation not found');

    const next = {
      label: patch.label ?? old.label,
      beneficiary: patch.beneficiary !== undefined ? patch.beneficiary : old.beneficiary ?? null,
      category_id: patch.categoryId ?? old.category_id,
      fund_id: patch.fundId !== undefined ? (patch.fundId || null) : old.fund_id,
      event_id: patch.eventId !== undefined ? patch.eventId : old.event_id ?? null,
      op_date: patch.opDate ?? old.op_date,
      receipts_cdf: patch.receiptsCdf ?? old.receipts_cdf,
      receipts_usd_converted: patch.receiptsUsdConverted ?? old.receipts_usd_converted,
      receipts_usd: patch.receiptsUsd ?? old.receipts_usd ?? '0',
      expenses_cdf: patch.expensesCdf ?? old.expenses_cdf,
      expenses_usd_converted: patch.expensesUsdConverted ?? old.expenses_usd_converted,
      expenses_usd: patch.expensesUsd ?? old.expenses_usd,
      observation: patch.observation !== undefined ? patch.observation : old.observation ?? null,
      exchange_rate_usd_id: patch.exchangeRateUsdId !== undefined ? patch.exchangeRateUsdId : old.exchange_rate_usd_id ?? null,
      usd_rate_quote_per_1_usd:
        patch.usdRateQuotePer1Usd !== undefined ? patch.usdRateQuotePer1Usd : old.usd_rate_quote_per_1_usd ?? null,
      is_locked_by_closure:
        patch.isLockedByClosure !== undefined ? (patch.isLockedByClosure ? 1 : 0) : old.is_locked_by_closure,
    };

    this.db.withTransaction((tx) => {
      tx.prepare(
        `
        UPDATE financial_operation
           SET op_date=@op_date,
               label=@label,
               beneficiary=@beneficiary,
               category_id=@category_id,
               fund_id=@fund_id,
               event_id=@event_id,
               receipts_cdf=@receipts_cdf,
               receipts_usd_converted=@receipts_usd_converted,
               receipts_usd=@receipts_usd,
               expenses_cdf=@expenses_cdf,
               expenses_usd_converted=@expenses_usd_converted,
               expenses_usd=@expenses_usd,
               observation=@observation,
               exchange_rate_usd_id=@exchange_rate_usd_id,
               usd_rate_quote_per_1_usd=@usd_rate_quote_per_1_usd,
               updated_by_user_id=@updated_by_user_id,
               updated_at=@updated_at,
               is_locked_by_closure=@is_locked_by_closure
         WHERE church_id=@church_id AND operation_id=@operation_id
        `
      ).run({
        church_id: ctx.churchId,
        operation_id: operationId,
        ...next,
        updated_by_user_id: ctx.userId,
        updated_at: now,
      });
    });
  }

  async softDelete(params: {
    ctx: TenantContext;
    operationId: string;
    reason: string;
    archivedAtIso?: string | null;
  }): Promise<void> {
    const { ctx, operationId, reason, archivedAtIso } = params;
    const now = new Date().toISOString();
    this.db.run(
      `
      UPDATE financial_operation
         SET archived_at=@archived_at,
             deleted_at=@deleted_at,
             deletion_reason=@deletion_reason,
             updated_by_user_id=@updated_by_user_id,
             updated_at=@updated_at
       WHERE church_id=@church_id AND operation_id=@operation_id
      `,
      {
        archived_at: archivedAtIso ?? now,
        deleted_at: now,
        deletion_reason: reason,
        updated_by_user_id: ctx.userId,
        updated_at: now,
        church_id: ctx.churchId,
        operation_id: operationId,
      }
    );
  }

  async restore(params: { ctx: TenantContext; operationId: string }): Promise<void> {
    const { ctx, operationId } = params;
    const now = new Date().toISOString();
    this.db.run(
      `
      UPDATE financial_operation
         SET archived_at=NULL,
             deleted_at=NULL,
             deletion_reason=NULL,
             updated_by_user_id=@updated_by_user_id,
             updated_at=@updated_at
       WHERE church_id=@church_id AND operation_id=@operation_id
      `,
      {
        updated_by_user_id: ctx.userId,
        updated_at: now,
        church_id: ctx.churchId,
        operation_id: operationId,
      }
    );
  }
}

