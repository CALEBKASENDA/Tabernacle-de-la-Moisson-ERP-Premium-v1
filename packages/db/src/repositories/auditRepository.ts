import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import type { AuditEntry } from '@tabernacle/erp-premium-domain';
import { newId } from '@tabernacle/erp-premium-domain';

export class AuditRepository {
  constructor(private readonly db: SqliteDatabase) {}

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

    const payload = entry.newValueJson ?? entry.oldValueJson ?? '{}';
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

  async ingestRemoteEvents(
    events: SyncEventIngestInput[],
    replay?: { apply: (ev: SyncEventIngestInput) => Promise<void> }
  ): Promise<number> {
    let n = 0;
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
          console.warn('[Tabernacle] Sync replay échoué:', ev.eventId, err);
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
      n += 1;
    }
    return n;
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

