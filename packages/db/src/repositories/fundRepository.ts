import type { TenantContext } from '../tenantContext';
import type { AppDatabase } from '../database/appDatabase';
import { newId, parseMoneyMicro } from '@tabernacle/erp-premium-domain';

export type FundRow = {
  fund_id: string;
  church_id: string;
  name: string;
  sort_order: number;
  status: string;
};

export class FundRepository {
  constructor(private readonly db: AppDatabase) {}

  list(ctx: TenantContext): FundRow[] {
    return this.db.all<FundRow>(
      `SELECT * FROM finance_fund WHERE church_id=@church_id AND status!='deleted' AND deleted_at IS NULL ORDER BY sort_order, name`,
      { church_id: ctx.churchId }
    );
  }

  create(params: { ctx: TenantContext; name: string; sortOrder?: number }): string {
    const now = new Date().toISOString();
    const id = newId('fund');
    this.db.run(
      `INSERT INTO finance_fund (fund_id, church_id, name, sort_order, status, created_at, updated_at)
       VALUES (@id, @church_id, @name, @sort, 'active', @now, @now)`,
      { id, church_id: params.ctx.churchId, name: params.name, sort: params.sortOrder ?? 0, now }
    );
    return id;
  }

  update(params: {
    ctx: TenantContext;
    fundId: string;
    name?: string;
    sortOrder?: number;
    status?: string;
  }): void {
    const now = new Date().toISOString();
    const row = this.db.get<FundRow>(
      `SELECT * FROM finance_fund WHERE church_id=@church_id AND fund_id=@id`,
      { church_id: params.ctx.churchId, id: params.fundId }
    );
    if (!row) throw new Error('Fund not found');
    this.db.run(
      `UPDATE finance_fund SET name=@name, sort_order=@sort, status=@status, updated_at=@now
       WHERE church_id=@church_id AND fund_id=@id`,
      {
        name: params.name ?? row.name,
        sort: params.sortOrder ?? row.sort_order,
        status: params.status ?? row.status,
        now,
        church_id: params.ctx.churchId,
        id: params.fundId,
      }
    );
  }

  softDelete(params: { ctx: TenantContext; fundId: string; reason: string }): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE finance_fund SET status='deleted', deleted_at=@now, deletion_reason=@reason, updated_at=@now
       WHERE church_id=@church_id AND fund_id=@id`,
      { now, reason: params.reason, church_id: params.ctx.churchId, id: params.fundId }
    );
  }

  getBalanceUsdMicro(params: { ctx: TenantContext; fundId: string }): bigint {
    const row = this.db.get<{
      receipts: string;
      exp_usd: string;
      exp_conv: string;
    }>(
      `SELECT
         COALESCE(SUM(CAST(receipts_usd_converted AS REAL) + CAST(receipts_usd AS REAL)), 0) as receipts,
         COALESCE(SUM(CAST(expenses_usd AS REAL)), 0) as exp_usd,
         COALESCE(SUM(CAST(expenses_usd_converted AS REAL)), 0) as exp_conv
       FROM financial_operation
       WHERE church_id=@church_id AND fund_id=@fund_id AND deleted_at IS NULL AND archived_at IS NULL`,
      { church_id: params.ctx.churchId, fund_id: params.fundId }
    );
    if (!row) return 0n;
    const receipts = parseMoneyMicro('USD', String(row.receipts)).amountMicro;
    const expUsd = parseMoneyMicro('USD', String(row.exp_usd)).amountMicro;
    const expConv = parseMoneyMicro('USD', String(row.exp_conv)).amountMicro;
    return receipts - expUsd - expConv;
  }
}
