import type { TenantContext } from '../tenantContext';
import type { AppDatabase } from '../database/appDatabase';
import { newId } from '@tabernacle/erp-premium-domain';

export type CellRow = {
  cell_id: string;
  church_id: string;
  name: string;
  leader_member_id: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  location: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export class CellRepository {
  constructor(private readonly db: AppDatabase) {}

  list(ctx: TenantContext): CellRow[] {
    return this.db.all<CellRow>(
      `SELECT * FROM pastoral_cell WHERE church_id=@church_id AND deleted_at IS NULL ORDER BY name`,
      { church_id: ctx.churchId }
    );
  }

  create(params: {
    ctx: TenantContext;
    name: string;
    leaderMemberId?: string | null;
    meetingDay?: string | null;
    meetingTime?: string | null;
    location?: string | null;
    notes?: string | null;
  }): string {
    const id = newId('cell');
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO pastoral_cell (cell_id, church_id, name, leader_member_id, meeting_day, meeting_time, location, notes,
        status, created_at, updated_at, created_by_user_id, updated_by_user_id)
       VALUES (@id, @church_id, @name, @leader, @day, @time, @loc, @notes, 'active', @now, @now, @user, @user)`,
      {
        id,
        church_id: params.ctx.churchId,
        name: params.name.trim(),
        leader: params.leaderMemberId ?? null,
        day: params.meetingDay ?? null,
        time: params.meetingTime ?? null,
        loc: params.location ?? null,
        notes: params.notes ?? null,
        now,
        user: params.ctx.userId,
      }
    );
    return id;
  }

  update(params: {
    ctx: TenantContext;
    cellId: string;
    patch: Partial<{
      name: string;
      leaderMemberId: string | null;
      meetingDay: string | null;
      meetingTime: string | null;
      location: string | null;
      notes: string | null;
      status: string;
    }>;
  }): void {
    const p = params.patch;
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE pastoral_cell SET
        name=COALESCE(@name, name),
        leader_member_id=COALESCE(@leader, leader_member_id),
        meeting_day=COALESCE(@day, meeting_day),
        meeting_time=COALESCE(@time, meeting_time),
        location=COALESCE(@loc, location),
        notes=COALESCE(@notes, notes),
        status=COALESCE(@status, status),
        updated_at=@now, updated_by_user_id=@user
       WHERE church_id=@church_id AND cell_id=@id AND deleted_at IS NULL`,
      {
        name: p.name?.trim(),
        leader: p.leaderMemberId,
        day: p.meetingDay,
        time: p.meetingTime,
        loc: p.location,
        notes: p.notes,
        status: p.status,
        now,
        user: params.ctx.userId,
        church_id: params.ctx.churchId,
        id: params.cellId,
      }
    );
  }

  softDelete(ctx: TenantContext, cellId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE pastoral_cell SET deleted_at=@now, status='archived', updated_at=@now WHERE church_id=@church_id AND cell_id=@id`,
      { now, church_id: ctx.churchId, id: cellId }
    );
  }
}
