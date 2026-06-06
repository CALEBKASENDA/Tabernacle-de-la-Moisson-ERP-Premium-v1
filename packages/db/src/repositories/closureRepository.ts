import type { TenantContext } from '../tenantContext';
import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import type { ClosureType, FinancialClosure } from '@tabernacle/erp-premium-domain';
import { isDateLockedByClosures } from '@tabernacle/erp-premium-domain';

export class ClosureRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async getActiveClosuresForChurch(ctx: TenantContext): Promise<FinancialClosure[]> {
    const rows = this.db.all<{
      closure_id: string;
      church_id: string;
      closure_type: ClosureType;
      period_start: string;
      period_end: string;
      status: 'active' | 'archived';
    }>(
      `
      SELECT closure_id, church_id, closure_type, period_start, period_end, status
        FROM financial_closure
       WHERE church_id=@church_id AND status='active'
      `,
      { church_id: ctx.churchId }
    );

    return rows.map((r) => ({
      closureId: r.closure_id,
      churchId: r.church_id,
      closureType: r.closure_type,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      status: r.status,
    }));
  }

  async isDateLocked(params: { ctx: TenantContext; opDate: string }): Promise<boolean> {
    const { ctx, opDate } = params;
    const closures = await this.getActiveClosuresForChurch(ctx);
    return isDateLockedByClosures({ opDate, closures });
  }
}

