import type { TenantContext } from '../tenantContext';
import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import { newId } from '@tabernacle/erp-premium-domain';

export type TrainingRow = {
  training_id: string;
  church_id: string;
  title: string;
  training_date: string;
  trainer: string | null;
  location: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export class TrainingRepository {
  constructor(private readonly db: SqliteDatabase) {}

  list(ctx: TenantContext): TrainingRow[] {
    return this.db.all<TrainingRow>(
      `SELECT * FROM pastoral_training WHERE church_id=@church_id AND deleted_at IS NULL ORDER BY training_date DESC`,
      { church_id: ctx.churchId }
    );
  }

  create(params: {
    ctx: TenantContext;
    title: string;
    trainingDate: string;
    trainer?: string | null;
    location?: string | null;
    description?: string | null;
  }): string {
    const id = newId('training');
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO pastoral_training (training_id, church_id, title, training_date, trainer, location, description,
        created_at, updated_at, created_by_user_id, updated_by_user_id)
       VALUES (@id, @church_id, @title, @date, @trainer, @loc, @desc, @now, @now, @user, @user)`,
      {
        id,
        church_id: params.ctx.churchId,
        title: params.title.trim(),
        date: params.trainingDate,
        trainer: params.trainer ?? null,
        loc: params.location ?? null,
        desc: params.description ?? null,
        now,
        user: params.ctx.userId,
      }
    );
    return id;
  }

  update(params: {
    ctx: TenantContext;
    trainingId: string;
    patch: Partial<{
      title: string;
      trainingDate: string;
      trainer: string | null;
      location: string | null;
      description: string | null;
    }>;
  }): void {
    const p = params.patch;
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE pastoral_training SET
        title=COALESCE(@title, title),
        training_date=COALESCE(@date, training_date),
        trainer=COALESCE(@trainer, trainer),
        location=COALESCE(@loc, location),
        description=COALESCE(@desc, description),
        updated_at=@now, updated_by_user_id=@user
       WHERE church_id=@church_id AND training_id=@id AND deleted_at IS NULL`,
      {
        title: p.title?.trim(),
        date: p.trainingDate,
        trainer: p.trainer,
        loc: p.location,
        desc: p.description,
        now,
        user: params.ctx.userId,
        church_id: params.ctx.churchId,
        id: params.trainingId,
      }
    );
  }

  softDelete(ctx: TenantContext, trainingId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE pastoral_training SET deleted_at=@now, updated_at=@now WHERE church_id=@church_id AND training_id=@id`,
      { now, church_id: ctx.churchId, id: trainingId }
    );
  }
}
