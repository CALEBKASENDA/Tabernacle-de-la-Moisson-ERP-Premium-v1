export const FINANCE_FULL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS church (
  church_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  funds_enabled INTEGER NOT NULL DEFAULT 0,
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
  password_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS church_user (
  church_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  PRIMARY KEY (church_id, user_id)
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

CREATE TABLE IF NOT EXISTS role (
  role_id TEXT PRIMARY KEY,
  church_id TEXT,
  name TEXT NOT NULL,
  is_system_role INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permission (
  permission_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permission (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_role (
  church_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  PRIMARY KEY (church_id, user_id, role_id)
);

CREATE TABLE IF NOT EXISTS user_permission (
  church_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (church_id, user_id, permission_id)
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

CREATE TABLE IF NOT EXISTS currency (
  currency_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
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

CREATE TABLE IF NOT EXISTS finance_category (
  category_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  code TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deletion_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_category_church_status ON finance_category(church_id, status);

CREATE TABLE IF NOT EXISTS finance_fund (
  fund_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deletion_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_fund_church_status ON finance_fund(church_id, status);

CREATE TABLE IF NOT EXISTS church_event (
  event_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_church_date ON church_event(church_id, event_date);

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
);
CREATE INDEX IF NOT EXISTS idx_finop_church_date ON financial_operation(church_id, op_date);
CREATE INDEX IF NOT EXISTS idx_finop_deleted ON financial_operation(church_id, deleted_at);

CREATE TABLE IF NOT EXISTS envelope (
  envelope_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  envelope_number TEXT NOT NULL,
  follower TEXT NOT NULL,
  envelope_date TEXT NOT NULL,
  category_id TEXT NOT NULL,
  fund_id TEXT,
  amount_cdf NUMERIC(20,6) NOT NULL,
  amount_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  amount_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
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
);

CREATE TABLE IF NOT EXISTS faith_pledge (
  pledge_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  follower TEXT NOT NULL,
  pledge_amount_cdf NUMERIC(20,6) NOT NULL,
  pledge_amount_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  pledge_amount_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  deleted_at TEXT,
  deletion_reason TEXT
);

CREATE TABLE IF NOT EXISTS faith_pledge_payment (
  payment_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  pledge_id TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  amount_cdf NUMERIC(20,6) NOT NULL,
  amount_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  amount_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  exchange_rate_usd_id TEXT,
  usd_rate_quote_per_1_usd NUMERIC(20,6),
  category_id TEXT NOT NULL,
  fund_id TEXT,
  event_id TEXT,
  observation TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counting_session (
  counting_session_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  counting_date TEXT NOT NULL,
  team_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  validated_at TEXT,
  validated_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'opened',
  deleted_at TEXT,
  deletion_reason TEXT
);

CREATE TABLE IF NOT EXISTS counting_line (
  counting_line_id TEXT PRIMARY KEY,
  counting_session_id TEXT NOT NULL,
  church_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  fund_id TEXT,
  amount_cdf NUMERIC(20,6) NOT NULL,
  amount_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  amount_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  exchange_rate_usd_id TEXT,
  usd_rate_quote_per_1_usd NUMERIC(20,6),
  observation TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_box (
  cash_box_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_session (
  cash_session_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  cash_box_id TEXT NOT NULL,
  open_date TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  opened_by_user_id TEXT NOT NULL,
  opening_balance_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
  opening_balance_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  close_date TEXT,
  closed_at TEXT,
  closed_by_user_id TEXT,
  closing_balance_cdf NUMERIC(20,6),
  closing_balance_usd NUMERIC(20,6),
  cash_diff_cdf NUMERIC(20,6),
  cash_diff_usd NUMERIC(20,6),
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS cash_transaction (
  cash_transaction_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  cash_session_id TEXT NOT NULL,
  piece_type TEXT NOT NULL DEFAULT 'CAI',
  piece_number TEXT NOT NULL,
  op_date TEXT NOT NULL,
  label TEXT NOT NULL,
  beneficiary TEXT,
  category_id TEXT NOT NULL,
  fund_id TEXT,
  event_id TEXT,
  receipts_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
  expenses_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
  receipts_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  receipts_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  expenses_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  expenses_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  exchange_rate_usd_id TEXT,
  usd_rate_quote_per_1_usd NUMERIC(20,6),
  observation TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  deleted_at TEXT,
  deletion_reason TEXT,
  UNIQUE (church_id, piece_number)
);

CREATE TABLE IF NOT EXISTS bank_account (
  bank_account_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  name TEXT NOT NULL,
  iban TEXT,
  swift TEXT,
  currency_code TEXT NOT NULL DEFAULT 'CDF',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_transaction (
  bank_transaction_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  piece_type TEXT NOT NULL DEFAULT 'BAN',
  piece_number TEXT NOT NULL,
  tx_date TEXT NOT NULL,
  label TEXT NOT NULL,
  beneficiary TEXT,
  category_id TEXT NOT NULL,
  fund_id TEXT,
  event_id TEXT,
  receipts_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
  expenses_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
  receipts_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  receipts_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  expenses_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  expenses_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  exchange_rate_usd_id TEXT,
  usd_rate_quote_per_1_usd NUMERIC(20,6),
  external_reference TEXT,
  observation TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  deleted_at TEXT,
  deletion_reason TEXT,
  UNIQUE (church_id, piece_number)
);

CREATE TABLE IF NOT EXISTS bank_reconciliation (
  bank_reconciliation_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  reconciliation_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  opened_by_user_id TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  validated_by_user_id TEXT,
  validated_at TEXT,
  notes TEXT
);

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

CREATE TABLE IF NOT EXISTS finance_budget (
  budget_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  budget_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  fiscal_year INTEGER,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_budget_line (
  budget_line_id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL,
  church_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  fund_id TEXT,
  planned_receipts_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  planned_expenses_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operation_attachment (
  attachment_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  attachment_kind TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  encrypted_blob_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_event (
  event_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  operation TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS alert_event (
  alert_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  acknowledged_at TEXT
);
`;
