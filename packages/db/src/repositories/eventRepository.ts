import type { TenantContext } from '../tenantContext';
import type { AppDatabase } from '../database/appDatabase';
import { newId } from '@tabernacle/erp-premium-domain';

export type EventRow = {
  event_id: string;
  church_id: string;
  event_type: string;
  title: string;
  event_date: string;
  archived_at: string | null;
};

export class EventRepository {
  constructor(private readonly db: AppDatabase) {}

  list(ctx: TenantContext): EventRow[] {
    return this.db.all<EventRow>(
      `SELECT * FROM church_event WHERE church_id=@church_id AND archived_at IS NULL ORDER BY event_date DESC`,
      { church_id: ctx.churchId }
    );
  }

  create(params: {
    ctx: TenantContext;
    eventType: string;
    title: string;
    eventDate: string;
  }): string {
    const now = new Date().toISOString();
    const id = newId('evt');
    this.db.run(
      `INSERT INTO church_event (event_id, church_id, event_type, title, event_date, created_at, updated_at)
       VALUES (@id, @church_id, @type, @title, @date, @now, @now)`,
      {
        id,
        church_id: params.ctx.churchId,
        type: params.eventType,
        title: params.title,
        date: params.eventDate,
        now,
      }
    );
    return id;
  }

  archive(params: { ctx: TenantContext; eventId: string }): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE church_event SET archived_at=@now, updated_at=@now WHERE church_id=@church_id AND event_id=@id`,
      { now, church_id: params.ctx.churchId, id: params.eventId }
    );
  }
}
