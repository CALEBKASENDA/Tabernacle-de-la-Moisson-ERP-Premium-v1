import type { SqliteDatabase } from '../sqlite/sqliteDatabase';

function ensureColumn(db: SqliteDatabase, table: string, column: string): void {
  const cols = db.all<{ name: string }>(`PRAGMA table_info('${table}')`);
  if (!cols.some((c) => c.name === column)) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} NUMERIC(20,6) NOT NULL DEFAULT 0`
    );
  }
}

export function migrateUsdDirectColumns(db: SqliteDatabase): void {
  ensureColumn(db, 'envelope', 'amount_usd');
  ensureColumn(db, 'counting_line', 'amount_usd');
  ensureColumn(db, 'faith_pledge', 'pledge_amount_usd');
  ensureColumn(db, 'faith_pledge_payment', 'amount_usd');
  ensureColumn(db, 'cash_transaction', 'receipts_usd');
  ensureColumn(db, 'bank_transaction', 'receipts_usd');
  ensureColumn(db, 'cash_session', 'opening_balance_usd');
  ensureColumn(db, 'cash_session', 'closing_balance_usd');
  ensureColumn(db, 'cash_session', 'cash_diff_usd');
}
