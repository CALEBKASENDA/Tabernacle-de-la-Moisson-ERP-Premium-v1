import type { SqliteDatabase } from '../sqlite/sqliteDatabase';

function columnExists(db: SqliteDatabase, table: string, column: string): boolean {
  const cols = db.all<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

/** Option facultative « répartition par fonds » par église. */
export function migrateChurchFundsEnabled(db: SqliteDatabase): void {
  if (!columnExists(db, 'church', 'funds_enabled')) {
    db.exec(`ALTER TABLE church ADD COLUMN funds_enabled INTEGER NOT NULL DEFAULT 0`);
    db.exec(`
      UPDATE church SET funds_enabled = 1
      WHERE church_id IN (
        SELECT DISTINCT church_id FROM financial_operation WHERE fund_id IS NOT NULL AND fund_id != ''
      )
    `);
  }
}
