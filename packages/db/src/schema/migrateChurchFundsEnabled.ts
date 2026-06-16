import type { AppDatabase } from '../database/appDatabase';
import { ensureColumn, getTableColumns } from './schemaUtils';

/** Option facultative « répartition par fonds » par église. */
export function migrateChurchFundsEnabled(db: AppDatabase): void {
  const before = getTableColumns(db, 'church');
  ensureColumn(db, 'church', 'funds_enabled', 'INTEGER NOT NULL DEFAULT 0');
  if (before.some((c) => c.name === 'funds_enabled')) return;

  db.exec(`
    UPDATE church SET funds_enabled = 1
    WHERE church_id IN (
      SELECT DISTINCT church_id FROM financial_operation WHERE fund_id IS NOT NULL AND fund_id != ''
    )
  `);
}
