import type { AppDatabase } from '../database/appDatabase';
import type { AuditEntry } from '@tabernacle/erp-premium-domain';
import { newId } from '@tabernacle/erp-premium-domain';

export class AuditRepository {
  constructor(private readonly db: AppDatabase) {}

  append(entry: AuditEntry): void {
    this.db.run(
      `
      INSERT INTO audit_log (
        audit_id,
        church_id,
        session_id,
        workstation_id,
        actor_user_id,
        entity_type,
        entity_id,
        action,
        old_value_json,
        new_value_json,
        metadata_json,
        changed_at
      ) VALUES (
        @audit_id,
        @church_id,
        @session_id,
        @workstation_id,
        @actor_user_id,
        @entity_type,
        @entity_id,
        @action,
        @old_value_json,
        @new_value_json,
        @metadata_json,
        @changed_at
      )
      `,
      {
        audit_id: entry.auditId,
        church_id: entry.churchId,
        session_id: entry.sessionId,
        workstation_id: entry.workstationId,
        actor_user_id: entry.actorUserId,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        action: entry.action,
        old_value_json: entry.oldValueJson ?? null,
        new_value_json: entry.newValueJson ?? null,
        metadata_json: entry.metadataJson ?? null,
        changed_at: entry.changedAt,
      }
    );

    let payload = entry.newValueJson ?? entry.oldValueJson ?? '{}';
    if (entry.metadataJson) {
      try {
        const body = JSON.parse(payload) as Record<string, unknown>;
        body._meta = JSON.parse(entry.metadataJson);
        payload = JSON.stringify(body);
      } catch {
        /* garde le payload d'origine */
      }
    }
    this.db.run(
      `INSERT INTO sync_event (event_id, church_id, entity_type, operation, entity_id, payload_json, created_at, sync_status)
       VALUES (@event_id, @church_id, @entity_type, @operation, @entity_id, @payload, @created_at, 'PENDING')`,
      {
        event_id: newId('sync'),
        church_id: entry.churchId,
        entity_type: entry.entityType,
        operation: entry.action,
        entity_id: entry.entityId,
        payload,
        created_at: entry.changedAt,
      }
    );
  }

  countPendingSync(churchId?: string): number {
    const row = churchId
      ? this.db.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM sync_event WHERE sync_status='PENDING' AND church_id=@church_id`,
          { church_id: churchId }
        )
      : this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM sync_event WHERE sync_status='PENDING'`);
    return row?.n ?? 0;
  }

  listPendingSyncEvents(limit = 100, churchId?: string): SyncEventRow[] {
    return churchId
      ? this.db.all<SyncEventRow>(
          `SELECT * FROM sync_event WHERE sync_status='PENDING' AND church_id=@church_id ORDER BY created_at ASC LIMIT @limit`,
          { church_id: churchId, limit }
        )
      : this.db.all<SyncEventRow>(
          `SELECT * FROM sync_event WHERE sync_status='PENDING' ORDER BY created_at ASC LIMIT @limit`,
          { limit }
        );
  }

  markSyncEventsAcked(eventIds: string[]): number {
    if (eventIds.length === 0) return 0;
    let n = 0;
    for (const id of eventIds) {
      this.db.run(
        `UPDATE sync_event SET sync_status='ACKED' WHERE event_id=@id AND sync_status='PENDING'`,
        { id }
      );
      n += 1;
    }
    return n;
  }

  markSyncEventConflict(eventId: string): void {
    this.db.run(`UPDATE sync_event SET sync_status='CONFLICT' WHERE event_id=@id`, { id: eventId });
  }

  countSyncByStatus(status: string, churchId?: string): number {
    const row = churchId
      ? this.db.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM sync_event WHERE sync_status=@status AND church_id=@church_id`,
          { status, church_id: churchId }
        )
      : this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM sync_event WHERE sync_status=@status`, { status });
    return row?.n ?? 0;
  }

  listSyncEventsByStatus(status: string, limit = 100, churchId?: string): SyncEventRow[] {
    return churchId
      ? this.db.all<SyncEventRow>(
          `SELECT * FROM sync_event WHERE sync_status=@status AND church_id=@church_id ORDER BY created_at DESC LIMIT @limit`,
          { status, church_id: churchId, limit }
        )
      : this.db.all<SyncEventRow>(
          `SELECT * FROM sync_event WHERE sync_status=@status ORDER BY created_at DESC LIMIT @limit`,
          { status, limit }
        );
  }

  dismissSyncConflict(eventId: string): boolean {
    const row = this.db.get<{ event_id: string }>(
      `SELECT event_id FROM sync_event WHERE event_id=@id AND sync_status='CONFLICT'`,
      { id: eventId }
    );
    if (!row) return false;
    this.db.run(`UPDATE sync_event SET sync_status='ACKED' WHERE event_id=@id`, { id: eventId });
    return true;
  }

  getSyncEvent(eventId: string): SyncEventRow | null {
    return this.db.get<SyncEventRow>(`SELECT * FROM sync_event WHERE event_id=@id`, { id: eventId }) ?? null;
  }

  async ingestRemoteEvents(
    events: SyncEventIngestInput[],
    replay?: { apply: (ev: SyncEventIngestInput) => Promise<void> }
  ): Promise<{ accepted: number; conflicts: Array<{ eventId: string; reason: string }> }> {
    let accepted = 0;
    const conflicts: Array<{ eventId: string; reason: string }> = [];

    for (const ev of events) {
      const exists = this.db.get<{ event_id: string }>(
        `SELECT event_id FROM sync_event WHERE event_id=@id`,
        { id: ev.eventId }
      );
      if (exists) continue;

      if (replay) {
        try {
          await replay.apply(ev);
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Replay échoué';
          console.warn('[Tabernacle] Sync replay échoué:', ev.eventId, reason);
          this.db.run(
            `INSERT INTO sync_event (event_id, church_id, entity_type, operation, entity_id, payload_json, created_at, sync_status)
             VALUES (@event_id, @church_id, @entity_type, @operation, @entity_id, @payload, @created_at, 'CONFLICT')`,
            {
              event_id: ev.eventId,
              church_id: ev.churchId,
              entity_type: ev.entityType,
              operation: ev.operation,
              entity_id: ev.entityId,
              payload: ev.payloadJson,
              created_at: ev.createdAt,
            }
          );
          conflicts.push({ eventId: ev.eventId, reason });
          continue;
        }
      }

      this.db.run(
        `INSERT INTO sync_event (event_id, church_id, entity_type, operation, entity_id, payload_json, created_at, sync_status)
         VALUES (@event_id, @church_id, @entity_type, @operation, @entity_id, @payload, @created_at, 'ACKED')`,
        {
          event_id: ev.eventId,
          church_id: ev.churchId,
          entity_type: ev.entityType,
          operation: ev.operation,
          entity_id: ev.entityId,
          payload: ev.payloadJson,
          created_at: ev.createdAt,
        }
      );
      accepted += 1;
    }
    return { accepted, conflicts };
  }
}

export type SyncEventRow = {
  event_id: string;
  church_id: string;
  entity_type: string;
  operation: string;
  entity_id: string;
  payload_json: string;
  created_at: string;
  sync_status: string;
};

export type SyncEventIngestInput = {
  eventId: string;
  churchId: string;
  entityType: string;
  operation: string;
  entityId: string;
  payloadJson: string;
  createdAt: string;
};

