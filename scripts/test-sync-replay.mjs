/**
 * Test replay sync — taux de change et opération financière.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FinanceModule } from '../packages/db/dist/FinanceModule.js';
import { SqliteDatabase } from '../packages/db/dist/sqlite/sqliteDatabase.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tabernacle-sync-test-'));
const dbPath = path.join(tmp, 'test.sqlite');
const db = new SqliteDatabase({ dbFilePath: dbPath, encryption: { enabled: false, passphrase: '' } });
const churchId = 'church_sync_test';
const finance = FinanceModule.bootstrap(db, churchId, 'Église test sync', tmp);

const ctx = {
  churchId,
  userId: 'user_test',
  sessionId: 'session_test',
  workstationId: 'ws_test',
};

await finance.setExchangeRate({
  ctx,
  effectiveDate: '2026-06-15',
  baseCurrency: 'USD',
  quoteCurrency: 'CDF',
  rateValue: '2800',
});

const cats = finance.categories.list(ctx);
assert.ok(cats.length > 0, 'rubriques requises');

const { operationId } = await finance.createOperation({
  ctx,
  pieceType: 'REC',
  opDate: '2026-06-15',
  label: 'Test sync local',
  categoryId: cats[0].category_id,
  receiptsCdf: '5000',
  receiptsUsd: '0',
  expensesCdf: '0',
  expensesUsd: '0',
});

const pending = finance.audit.listPendingSyncEvents(10, churchId);
assert.ok(pending.length >= 2, 'événements sync en attente');

const rateEvent = pending.find((e) => e.entity_type === 'exchange_rate');
assert.ok(rateEvent, 'événement exchange_rate attendu');

const opEvent = pending.find((e) => e.entity_type === 'financial_operation' && e.entity_id === operationId);
assert.ok(opEvent, 'événement financial_operation attendu');

const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'tabernacle-sync-remote-'));
const db2Path = path.join(tmp2, 'remote.sqlite');
const db2 = new SqliteDatabase({ dbFilePath: db2Path, encryption: { enabled: false, passphrase: '' } });
const finance2 = FinanceModule.bootstrap(db2, churchId, 'Église test sync remote', tmp2);

const ingest = await finance2.ingestRemoteSyncEvents([
  {
    eventId: rateEvent.event_id,
    churchId: rateEvent.church_id,
    entityType: rateEvent.entity_type,
    operation: rateEvent.operation,
    entityId: rateEvent.entity_id,
    payloadJson: rateEvent.payload_json,
    createdAt: rateEvent.created_at,
  },
  {
    eventId: opEvent.event_id,
    churchId: opEvent.church_id,
    entityType: opEvent.entity_type,
    operation: opEvent.operation,
    entityId: opEvent.entity_id,
    payloadJson: opEvent.payload_json,
    createdAt: opEvent.created_at,
  },
]);

assert.equal(ingest.accepted, 2, 'deux événements acceptés');
assert.equal(ingest.conflicts.length, 0, 'aucun conflit');

const remoteCtx = { churchId, userId: 'u', sessionId: 's', workstationId: 'w' };
const remoteRate = finance2.getTauxDuJour(remoteCtx);
assert.ok(remoteRate, 'taux rejoué sur base distante');

const remoteOps = finance2.listOperations(remoteCtx);
assert.ok(remoteOps.some((o) => o.operation_id === operationId), 'opération rejouée');

console.log('OK test sync replay');
