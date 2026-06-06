import type { SqliteDatabase } from '../sqlite/sqliteDatabase';

export function migrateReceiptsUsdColumn(db: SqliteDatabase): void {
  const cols = db.all<{ name: string }>(`PRAGMA table_info('financial_operation')`);
  if (!cols.some((c) => c.name === 'receipts_usd')) {
    db.exec(
      `ALTER TABLE financial_operation ADD COLUMN receipts_usd NUMERIC(20,6) NOT NULL DEFAULT 0`
    );
  }
}
