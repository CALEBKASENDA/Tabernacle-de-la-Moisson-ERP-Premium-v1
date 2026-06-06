import { getAppContext } from './appContext';
import { readCloudConfig } from './cloudConfig';
import path from 'node:path';

export type SyncPushResult = {
  ok: boolean;
  pushed: number;
  message: string;
  remoteUrl?: string;
};

export async function pushPendingSyncEvents(dataDir: string, churchId?: string): Promise<SyncPushResult> {
  const { finance } = getAppContext();
  const config = readCloudConfig(dataDir);
  const remoteUrl = (config.remoteUrl ?? '').replace(/\/$/, '');
  if (!remoteUrl) {
    return { ok: false, pushed: 0, message: 'Aucune URL cloud configurée' };
  }

  const events = finance.audit.listPendingSyncEvents(200, churchId);
  if (events.length === 0) {
    return { ok: true, pushed: 0, message: 'Aucun événement en attente', remoteUrl };
  }

  const ingestUrl = `${remoteUrl}/api/v1/sync/ingest`;
  const body = {
    schemaVersion: 1,
    events: events.map((e) => ({
      eventId: e.event_id,
      churchId: e.church_id,
      entityType: e.entity_type,
      operation: e.operation,
      entityId: e.entity_id,
      payloadJson: e.payload_json,
      createdAt: e.created_at,
    })),
  };

  try {
    const syncToken =
      process.env.TABERNACLE_SYNC_TOKEN?.trim() || readCloudConfig(dataDir).syncToken?.trim() || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (syncToken) headers['x-sync-token'] = syncToken;

    const res = await fetch(ingestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json()) as { error?: string; data?: { accepted?: number } };
    if (!res.ok) {
      return {
        ok: false,
        pushed: 0,
        message: json.error ?? `Serveur distant HTTP ${res.status}`,
        remoteUrl,
      };
    }
    const ids = events.map((e) => e.event_id);
    finance.audit.markSyncEventsAcked(ids);
    return {
      ok: true,
      pushed: json.data?.accepted ?? ids.length,
      message: `${ids.length} événement(s) synchronisé(s)`,
      remoteUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync échouée';
    return { ok: false, pushed: 0, message, remoteUrl };
  }
}

export function ingestSyncEventsBatch(
  events: Array<{
    eventId: string;
    churchId: string;
    entityType: string;
    operation: string;
    entityId: string;
    payloadJson: string;
    createdAt: string;
  }>
): Promise<number> {
  const { finance } = getAppContext();
  return finance.ingestRemoteSyncEvents(events);
}

export function getDataDirFromEnv(): string {
  return process.env.TABERNACLE_DATA_DIR ?? path.join(process.cwd(), 'data');
}
