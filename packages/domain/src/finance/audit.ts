import { newId } from '../common/uid';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE' // logical delete
  | 'RESTORE'
  | 'ARCHIVE'
  | 'IMPORT'
  | 'SYNC'
  | 'RECALC';

export type AuditEntry = {
  auditId: string;
  churchId: string;
  sessionId: string;
  workstationId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  oldValueJson?: string;
  newValueJson?: string;
  metadataJson?: string;
  changedAt: string; // ISO timestamp
};

export function buildAuditEntry(params: {
  churchId: string;
  sessionId: string;
  workstationId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  changedAt?: string;
}): AuditEntry {
  const changedAt = params.changedAt ?? new Date().toISOString();
  return {
    auditId: newId('audit'),
    churchId: params.churchId,
    sessionId: params.sessionId,
    workstationId: params.workstationId,
    actorUserId: params.actorUserId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    oldValueJson: params.oldValue === undefined ? undefined : JSON.stringify(params.oldValue),
    newValueJson: params.newValue === undefined ? undefined : JSON.stringify(params.newValue),
    metadataJson: params.metadata === undefined ? undefined : JSON.stringify(params.metadata),
    changedAt,
  };
}

