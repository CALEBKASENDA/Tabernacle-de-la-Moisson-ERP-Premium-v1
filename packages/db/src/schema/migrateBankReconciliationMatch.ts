import type { AppDatabase } from '../database/appDatabase';

export function migrateBankReconciliationMatch(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_reconciliation_match (
      match_id TEXT PRIMARY KEY,
      bank_reconciliation_id TEXT NOT NULL,
      church_id TEXT NOT NULL,
      bank_transaction_id TEXT,
      external_statement_line_ref TEXT,
      matched_amount_cdf NUMERIC(20,6),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_brec_match_rec ON bank_reconciliation_match(bank_reconciliation_id);
  `);
}
