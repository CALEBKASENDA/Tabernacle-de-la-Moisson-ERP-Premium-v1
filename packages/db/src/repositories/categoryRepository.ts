import type { TenantContext } from '../tenantContext';
import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import { newId } from '@tabernacle/erp-premium-domain';

export type CategoryRow = {
  category_id: string;
  church_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  status: string;
};

export class CategoryRepository {
  constructor(private readonly db: SqliteDatabase) {}

  list(ctx: TenantContext): CategoryRow[] {
    return this.db.all<CategoryRow>(
      `SELECT * FROM finance_category WHERE church_id=@church_id AND status!='deleted' AND deleted_at IS NULL ORDER BY sort_order, name`,
      { church_id: ctx.churchId }
    );
  }

  create(params: {
    ctx: TenantContext;
    name: string;
    parentId?: string | null;
    sortOrder?: number;
  }): string {
    const now = new Date().toISOString();
    const id = newId('cat');
    this.db.run(
      `INSERT INTO finance_category (category_id, church_id, parent_id, name, sort_order, status, created_at, updated_at)
       VALUES (@id, @church_id, @parent_id, @name, @sort, 'active', @now, @now)`,
      {
        id,
        church_id: params.ctx.churchId,
        parent_id: params.parentId ?? null,
        name: params.name,
        sort: params.sortOrder ?? 0,
        now,
      }
    );
    return id;
  }

  update(params: {
    ctx: TenantContext;
    categoryId: string;
    name?: string;
    parentId?: string | null;
    sortOrder?: number;
    status?: string;
  }): void {
    const now = new Date().toISOString();
    const row = this.db.get<CategoryRow>(
      `SELECT * FROM finance_category WHERE church_id=@church_id AND category_id=@id`,
      { church_id: params.ctx.churchId, id: params.categoryId }
    );
    if (!row) throw new Error('Category not found');
    this.db.run(
      `UPDATE finance_category SET name=@name, parent_id=@parent_id, sort_order=@sort, status=@status, updated_at=@now
       WHERE church_id=@church_id AND category_id=@id`,
      {
        name: params.name ?? row.name,
        parent_id: params.parentId !== undefined ? params.parentId : row.parent_id,
        sort: params.sortOrder ?? row.sort_order,
        status: params.status ?? row.status,
        now,
        church_id: params.ctx.churchId,
        id: params.categoryId,
      }
    );
  }

  softDelete(params: { ctx: TenantContext; categoryId: string; reason: string }): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE finance_category SET status='deleted', deleted_at=@now, deletion_reason=@reason, updated_at=@now
       WHERE church_id=@church_id AND category_id=@id`,
      { now, reason: params.reason, church_id: params.ctx.churchId, id: params.categoryId }
    );
  }
}
