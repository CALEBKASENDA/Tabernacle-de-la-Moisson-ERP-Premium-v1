import test from 'node:test';
import assert from 'node:assert/strict';
import { isDateLockedByClosures } from '../packages/domain/dist/finance/closure.js';

test('isDateLockedByClosures — date dans période active', () => {
  const locked = isDateLockedByClosures({
    opDate: '2026-03-15',
    closures: [
      {
        closureId: 'c1',
        churchId: 'church',
        closureType: 'MONTH',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        status: 'active',
      },
    ],
  });
  assert.equal(locked, true);
});

test('isDateLockedByClosures — date hors période', () => {
  const locked = isDateLockedByClosures({
    opDate: '2026-04-01',
    closures: [
      {
        closureId: 'c1',
        churchId: 'church',
        closureType: 'MONTH',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        status: 'active',
      },
    ],
  });
  assert.equal(locked, false);
});
