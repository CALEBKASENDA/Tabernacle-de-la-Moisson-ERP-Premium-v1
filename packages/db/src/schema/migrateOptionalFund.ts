import type { SqliteDatabase } from '../sqlite/sqliteDatabase';

function fundIdIsRequired(db: SqliteDatabase, table: string): boolean {
  const rows = db.all<{ name: string; notnull: number }>(`PRAGMA table_info('${table}')`);
  const fundCol = rows.find((r) => r.name === 'fund_id');
  return fundCol?.notnull === 1;
}

function rebuildTable(
  db: SqliteDatabase,
  table: string,
  createNewSql: string,
  columns: string[],
  indexes: string[] = []
): void {
  if (!fundIdIsRequired(db, table)) return;
  const cols = columns.join(', ');
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec(createNewSql);
  db.exec(`INSERT INTO ${table}_new (${cols}) SELECT ${cols} FROM ${table}`);
  db.exec(`DROP TABLE ${table}`);
  db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
  for (const idx of indexes) db.exec(idx);
  db.exec('PRAGMA foreign_keys=ON');
}

/** Rend fund_id facultatif sur les tables financières (bases existantes). */
export function migrateOptionalFundId(db: SqliteDatabase): void {
  rebuildTable(
    db,
    'financial_operation',
    `CREATE TABLE financial_operation_new (
      operation_id TEXT PRIMARY KEY,
      church_id TEXT NOT NULL,
      site_id TEXT,
      op_date TEXT NOT NULL,
      piece_type TEXT NOT NULL,
      piece_number TEXT NOT NULL,
      label TEXT NOT NULL,
      beneficiary TEXT,
      category_id TEXT NOT NULL,
      fund_id TEXT,
      event_id TEXT,
      receipts_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
      receipts_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
      receipts_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
      expenses_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
      expenses_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
      expenses_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
      observation TEXT,
      exchange_rate_usd_id TEXT,
      usd_rate_quote_per_1_usd NUMERIC(20,6),
      rate_base_currency TEXT,
      rate_quote_currency TEXT,
      created_by_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      deleted_at TEXT,
      deletion_reason TEXT,
      is_locked_by_closure INTEGER NOT NULL DEFAULT 0,
      row_version INTEGER NOT NULL DEFAULT 1,
      UNIQUE (church_id, piece_number)
    )`,
    [
      'operation_id', 'church_id', 'site_id', 'op_date', 'piece_type', 'piece_number',
      'label', 'beneficiary', 'category_id', 'fund_id', 'event_id',
      'receipts_cdf', 'receipts_usd_converted', 'receipts_usd', 'expenses_cdf', 'expenses_usd_converted', 'expenses_usd',
      'observation', 'exchange_rate_usd_id', 'usd_rate_quote_per_1_usd', 'rate_base_currency', 'rate_quote_currency',
      'created_by_user_id', 'created_at', 'updated_by_user_id', 'updated_at',
      'archived_at', 'deleted_at', 'deletion_reason', 'is_locked_by_closure', 'row_version',
    ],
    [
      'CREATE INDEX IF NOT EXISTS idx_finop_church_date ON financial_operation(church_id, op_date)',
      'CREATE INDEX IF NOT EXISTS idx_finop_deleted ON financial_operation(church_id, deleted_at)',
    ]
  );

  rebuildTable(
    db,
    'envelope',
    `CREATE TABLE envelope_new (
      envelope_id TEXT PRIMARY KEY,
      church_id TEXT NOT NULL,
      envelope_number TEXT NOT NULL,
      follower TEXT NOT NULL,
      envelope_date TEXT NOT NULL,
      category_id TEXT NOT NULL,
      fund_id TEXT,
      amount_cdf NUMERIC(20,6) NOT NULL,
      amount_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
      exchange_rate_usd_id TEXT,
      usd_rate_quote_per_1_usd NUMERIC(20,6),
      rate_base_currency TEXT,
      rate_quote_currency TEXT,
      event_id TEXT,
      observation TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      deleted_at TEXT,
      deletion_reason TEXT,
      UNIQUE (church_id, envelope_number)
    )`,
    [
      'envelope_id', 'church_id', 'envelope_number', 'follower', 'envelope_date', 'category_id', 'fund_id',
      'amount_cdf', 'amount_usd_converted', 'exchange_rate_usd_id', 'usd_rate_quote_per_1_usd',
      'rate_base_currency', 'rate_quote_currency', 'event_id', 'observation',
      'created_at', 'updated_at', 'created_by_user_id', 'updated_by_user_id', 'deleted_at', 'deletion_reason',
    ]
  );
}
