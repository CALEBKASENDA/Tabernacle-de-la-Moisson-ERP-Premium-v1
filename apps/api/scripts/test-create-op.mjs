import path from 'node:path';
import fs from 'node:fs';
import { SqliteDatabase, FinanceModule } from '@tabernacle/erp-premium-db';

const dataDir = path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'tabernacle-finance.sqlite');
const db = new SqliteDatabase({ dbFilePath: dbPath });
const finance = FinanceModule.bootstrap(db, 'church_default', 'Test');

const fundCol = db.all(`PRAGMA table_info('financial_operation')`).find((c) => c.name === 'fund_id');
console.log('fund_id column:', fundCol);

const cat = db.get(`SELECT category_id FROM finance_category WHERE church_id=@c LIMIT 1`, {
  c: 'church_default',
});
if (!cat) {
  console.error('No category');
  process.exit(1);
}

try {
  const r = await finance.createOperation({
    ctx: {
      churchId: 'church_default',
      userId: 'user_test',
      sessionId: 'session_test',
      workstationId: 'workstation_local',
      siteId: null,
    },
    pieceType: 'REC',
    opDate: '2026-06-05',
    label: 'Test op',
    categoryId: cat.category_id,
    fundId: null,
    receiptsCdf: '1000',
    expensesCdf: '0',
    expensesUsd: '0',
  });
  console.log('OK', r.pieceNumber);
} catch (e) {
  console.error('ERR', e.message);
  console.error(e.stack);
  process.exit(1);
}
