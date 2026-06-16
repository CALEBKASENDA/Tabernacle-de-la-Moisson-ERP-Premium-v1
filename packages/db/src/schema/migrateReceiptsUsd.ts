import type { AppDatabase } from '../database/appDatabase';
import { ensureColumn } from './schemaUtils';

export function migrateReceiptsUsdColumn(db: AppDatabase): void {
  ensureColumn(db, 'financial_operation', 'receipts_usd', 'NUMERIC(20,6) NOT NULL DEFAULT 0');
}
