export const FINANCE_MINIMAL_SCHEMA_SQL = `
-- Minimal Finance schema for production bootstrapping.
-- Expand as other finance features (envelopes, pledges, counting, cash, bank) are implemented.

CREATE TABLE IF NOT EXISTS church (
  church_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workstation (
  workstation_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_user (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_session (
  session_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workstation_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  session_fingerprint TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  workstation_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  metadata_json TEXT,
  changed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_church_entity_time ON audit_log(church_id, entity_type, changed_at);

CREATE TABLE IF NOT EXISTS numbering_sequence (
  church_id TEXT NOT NULL,
  sequence_key TEXT NOT NULL,
  prefix TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_value INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (church_id, sequence_key)
);

CREATE TABLE IF NOT EXISTS exchange_rate (
  exchange_rate_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  base_currency_code TEXT NOT NULL,
  quote_currency_code TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  rate_quote_per_1_base NUMERIC(20,6) NOT NULL,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  deletion_reason TEXT,
  UNIQUE (church_id, base_currency_code, quote_currency_code, effective_date)
);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_church_date ON exchange_rate(church_id, effective_date);

CREATE TABLE IF NOT EXISTS financial_closure (
  closure_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  closure_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  closed_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  UNIQUE (church_id, closure_type, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS idx_closure_church_range ON financial_closure(church_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS financial_operation (
  operation_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  site_id TEXT,
  op_date TEXT NOT NULL,
  piece_type TEXT NOT NULL,
  piece_number TEXT NOT NULL,
  label TEXT NOT NULL,
  beneficiary TEXT,
  category_id TEXT NOT NULL,
  fund_id TEXT NOT NULL,
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
);
CREATE INDEX IF NOT EXISTS idx_finop_church_date ON financial_operation(church_id, op_date);
CREATE INDEX IF NOT EXISTS idx_finop_church_category ON financial_operation(church_id, category_id);
CREATE INDEX IF NOT EXISTS idx_finop_church_fund ON financial_operation(church_id, fund_id);
CREATE INDEX IF NOT EXISTS idx_finop_deleted ON financial_operation(church_id, deleted_at);
`;

