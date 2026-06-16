import type { AppDatabase } from '../database/appDatabase';
import { ensureColumn } from './schemaUtils';

export function migrateUsdDirectColumns(db: AppDatabase): void {
  ensureColumn(db, 'envelope', 'amount_usd', 'NUMERIC(20,6) NOT NULL DEFAULT 0');
  ensureColumn(db, 'counting_line', 'amount_usd', 'NUMERIC(20,6) NOT NULL DEFAULT 0');
  ensureColumn(db, 'faith_pledge', 'pledge_amount_usd', 'NUMERIC(20,6) NOT NULL DEFAULT 0');
  ensureColumn(db, 'faith_pledge_payment', 'amount_usd', 'NUMERIC(20,6) NOT NULL DEFAULT 0');
  ensureColumn(db, 'cash_transaction', 'receipts_usd', 'NUMERIC(20,6) NOT NULL DEFAULT 0');
  ensureColumn(db, 'bank_transaction', 'receipts_usd', 'NUMERIC(20,6) NOT NULL DEFAULT 0');
  ensureColumn(db, 'cash_session', 'opening_balance_usd', 'NUMERIC(20,6) NOT NULL DEFAULT 0');
  ensureColumn(db, 'cash_session', 'closing_balance_usd', 'NUMERIC(20,6) NOT NULL DEFAULT 0');
  ensureColumn(db, 'cash_session', 'cash_diff_usd', 'NUMERIC(20,6) NOT NULL DEFAULT 0');
}
