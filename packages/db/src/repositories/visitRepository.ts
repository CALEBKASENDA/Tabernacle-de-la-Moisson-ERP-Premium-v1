import type { TenantContext } from '../tenantContext';
import type { AppDatabase } from '../database/appDatabase';
import { newId } from '@tabernacle/erp-premium-domain';

export type VisitRow = {
  visit_id: string;
  church_id: string;
  member_id: string | null;
  visitor_name: string;
  visit_date: string;
  visit_type: string;
  notes: string | null;
  created_at: string;
};

export class VisitRepository {
  constructor(private readonly db: AppDatabase) {}

  list(ctx: TenantContext, filters?: { dateFrom?: string; dateTo?: string }): VisitRow[] {
    let sql = `SELECT * FROM pastoral_visit WHERE church_id=@church_id AND deleted_at IS NULL`;
    const binds: Record<string, unknown> = { church_id: ctx.churchId };
    if (filters?.dateFrom) {
      sql += ` AND visit_date >= @from`;
      binds.from = filters.dateFrom;
    }
    if (filters?.dateTo) {
      sql += ` AND visit_date <= @to`;
      binds.to = filters.dateTo;
    }
    sql += ` ORDER BY visit_date DESC`;
    return this.db.all<VisitRow>(sql, binds);
  }

  create(params: {
    ctx: TenantContext;
    visitorName: string;
    visitDate: string;
    visitType?: string;
    memberId?: string | null;
    notes?: string | null;
  }): string {
    const id = newId('visit');
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO pastoral_visit (visit_id, church_id, member_id, visitor_name, visit_date, visit_type, notes, created_at, created_by_user_id)
       VALUES (@id, @church_id, @member, @visitor, @date, @type, @notes, @now, @user)`,
      {
        id,
        church_id: params.ctx.churchId,
        member: params.memberId ?? null,
        visitor: params.visitorName.trim(),
        date: params.visitDate,
        type: params.visitType ?? 'domicile',
        notes: params.notes ?? null,
        now,
        user: params.ctx.userId,
      }
    );
    return id;
  }

  softDelete(ctx: TenantContext, visitId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE pastoral_visit SET deleted_at=@now WHERE church_id=@church_id AND visit_id=@id`,
      { now, church_id: ctx.churchId, id: visitId }
    );
  }
}
