import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSoldeFaible } from '../packages/domain/dist/finance/alerts.js';

test('evaluateSoldeFaible — solde sous seuil', () => {
  const alert = evaluateSoldeFaible({
    churchId: 'church1',
    createdAt: '2026-06-05T00:00:00.000Z',
    soldeUsdsMicro: 500_000_000n,
    thresholdMicro: 1_000_000_000n,
  });
  assert.ok(alert);
  assert.equal(alert.code, 'SOLDE_FAIBLE');
});

test('evaluateSoldeFaible — solde OK', () => {
  const alert = evaluateSoldeFaible({
    churchId: 'church1',
    createdAt: '2026-06-05T00:00:00.000Z',
    soldeUsdsMicro: 5_000_000_000n,
    thresholdMicro: 1_000_000_000n,
  });
  assert.equal(alert, null);
});
