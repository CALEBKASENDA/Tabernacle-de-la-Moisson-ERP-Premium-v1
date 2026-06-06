# Modélisation DB (SQLite) — Module Finance (Multi-églises)

> Remarque : ce document décrit une modélisation “SQLite compatible” (clés UUID en texte, montants décimaux via `NUMERIC`).  
> L'architecture prévoit des migrations et vues, et des contraintes d'invariants au niveau application (tenanting strict).

## Notations
- `church_id` : UUID
- `site_id` : UUID (optionnel)
- `uuid` : stocké en TEXT (SQLite)
- `money` : `NUMERIC(20,6)`
- `date` : `TEXT` au format `YYYY-MM-DD`
- `timestamp` : `TEXT` ISO 8601

## Tables “Tenant / Sécurité” (minimum requis pour le module)

### Église
```sql
CREATE TABLE church (
  church_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active|disabled
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_church_status ON church(status);
```

### Poste de travail (anti-répudiation)
```sql
CREATE TABLE workstation (
  workstation_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);
CREATE INDEX idx_workstation_church ON workstation(church_id);
```

### Utilisateurs (global) + rattachement à une église
```sql
CREATE TABLE app_user (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE church_user (
  church_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active|disabled
  created_at TEXT NOT NULL,
  PRIMARY KEY (church_id, user_id),
  FOREIGN KEY (church_id) REFERENCES church(church_id),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
);
CREATE INDEX idx_church_user_user ON church_user(user_id);
```

### Sessions (pour audit)
```sql
CREATE TABLE user_session (
  session_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workstation_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  session_fingerprint TEXT,
  FOREIGN KEY (church_id) REFERENCES church(church_id),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id),
  FOREIGN KEY (workstation_id) REFERENCES workstation(workstation_id)
);
CREATE INDEX idx_session_church ON user_session(church_id, started_at);
```

### RBAC dynamique (rôles & permissions)
```sql
CREATE TABLE role (
  role_id TEXT PRIMARY KEY,
  church_id TEXT, -- NULL pour rôles globaux, sinon rôles personnalisés par église
  name TEXT NOT NULL,
  is_system_role INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (church_id, name)
);

CREATE TABLE permission (
  permission_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE, -- ex: finance:operations:read
  description TEXT
);

CREATE TABLE role_permission (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES role(role_id),
  FOREIGN KEY (permission_id) REFERENCES permission(permission_id)
);

CREATE TABLE user_role (
  church_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  PRIMARY KEY (church_id, user_id, role_id),
  FOREIGN KEY (church_id) REFERENCES church(church_id),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id),
  FOREIGN KEY (role_id) REFERENCES role(role_id)
);
```

### Audit (append-only)
```sql
CREATE TABLE audit_log (
  audit_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  workstation_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL, -- CREATE|UPDATE|DELETE|RESTORE|ARCHIVE|IMPORT|SYNC
  old_value_json TEXT,
  new_value_json TEXT,
  metadata_json TEXT,
  changed_at TEXT NOT NULL,
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);
CREATE INDEX idx_audit_church_entity_time ON audit_log(church_id, entity_type, changed_at);
```

## Tables Master Data Finance

### Devises (global, extensible)
```sql
CREATE TABLE currency (
  currency_code TEXT PRIMARY KEY, -- USD|CDF|EUR|GBP|...
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);
```

### Taux de change (par date, par église, multi-devise)
Interprétation : `rate_quote_per_1_base` signifie
`1 (base_currency) = rate_quote_per_1_base (quote_currency)`.
```sql
CREATE TABLE exchange_rate (
  exchange_rate_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  base_currency_code TEXT NOT NULL,  -- ex: USD
  quote_currency_code TEXT NOT NULL, -- ex: CDF
  effective_date TEXT NOT NULL,      -- YYYY-MM-DD
  rate_quote_per_1_base NUMERIC(20,6) NOT NULL,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  deletion_reason TEXT,
  UNIQUE (church_id, base_currency_code, quote_currency_code, effective_date),
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);

CREATE INDEX idx_exchange_rate_church_date ON exchange_rate(church_id, effective_date);
```

### Rubriques (dynamique, hiérarchique)
```sql
CREATE TABLE finance_category (
  category_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  code TEXT, -- optionnel, pour affichage
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- active|inactive|deleted
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deletion_reason TEXT,
  FOREIGN KEY (church_id) REFERENCES church(church_id),
  FOREIGN KEY (parent_id) REFERENCES finance_category(category_id)
);

CREATE INDEX idx_category_church_status ON finance_category(church_id, status);
CREATE INDEX idx_category_church_parent ON finance_category(church_id, parent_id);
```

### Fonds dédiés
```sql
CREATE TABLE finance_fund (
  fund_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active|inactive|deleted
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deletion_reason TEXT,
  FOREIGN KEY (church_id) REFERENCES church(church_id),
  UNIQUE (church_id, name)
);
CREATE INDEX idx_fund_church_status ON finance_fund(church_id, status);
```

### Événements (types de cultes & opérations associées)
```sql
CREATE TABLE church_event (
  event_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- ex: CULTE_DOMINICAL, VEILLEE, ...
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);
CREATE INDEX idx_event_church_date ON church_event(church_id, event_date);
```

## Opérations financières (recettes / dépenses)

### Opération financière unifiée (pour synthèses & export)
Cette table contient les colonnes demandées :
- recettes CDF
- recettes converties USD
- dépenses CDF
- dépenses converties USD
- dépenses USD (saisie directe)
```sql
CREATE TABLE financial_operation (
  operation_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  site_id TEXT,

  op_date TEXT NOT NULL,            -- YYYY-MM-DD
  piece_type TEXT NOT NULL,        -- REC|DEP|CAI|BAN
  piece_number TEXT NOT NULL,     -- ex: REC-AAAA-000001

  label TEXT NOT NULL,             -- Libellé
  beneficiary TEXT,               -- Bénéficiaire

  category_id TEXT NOT NULL,      -- Rubrique
  fund_id TEXT NOT NULL,          -- Fonds
  event_id TEXT,                   -- Événement (optionnel)

  -- Recettes
  receipts_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
  receipts_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,

  -- Dépenses
  expenses_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
  expenses_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,

  -- Dépenses saisies directement en USD
  expenses_usd NUMERIC(20,6) NOT NULL DEFAULT 0,

  observation TEXT,

  -- Taux utilisé pour les conversions CDF->USD
  exchange_rate_usd_id TEXT,
  usd_rate_quote_per_1_usd NUMERIC(20,6),

  -- Création / modification
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- Corbeille / suppression logique
  archived_at TEXT,
  deleted_at TEXT,
  deletion_reason TEXT,

  -- Verrouillage : après clôture, état immuable selon règles
  is_locked_by_closure INTEGER NOT NULL DEFAULT 0,

  -- Audit et intégrité
  row_version INTEGER NOT NULL DEFAULT 1,

  UNIQUE (church_id, piece_number),
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);

CREATE INDEX idx_finop_church_date ON financial_operation(church_id, op_date);
CREATE INDEX idx_finop_church_category ON financial_operation(church_id, category_id);
CREATE INDEX idx_finop_church_fund ON financial_operation(church_id, fund_id);
CREATE INDEX idx_finop_church_event ON financial_operation(church_id, event_id);
CREATE INDEX idx_finop_deleted ON financial_operation(church_id, deleted_at);
```

### Invariant de calcul (règle métier)
- `receipts_usd_converted = receipts_cdf / usd_rate_quote_per_1_usd`
- `expenses_usd_converted = expenses_cdf / usd_rate_quote_per_1_usd`
- `Total Recettes = SUM(receipts_usd_converted)`
- `Total Dépenses = SUM(expenses_usd + expenses_usd_converted)`
- `Solde Net = Total Recettes - Total Dépenses`

Le recalcul “en temps réel” se fera via :
1. service de mise à jour des taux
2. recalcul des lignes concernées + audit

## Clôture financière & verrous
```sql
CREATE TABLE financial_closure (
  closure_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  closure_type TEXT NOT NULL, -- MONTH|QUARTER|YEAR
  period_start TEXT NOT NULL, -- YYYY-MM-DD
  period_end TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  closed_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active|archived
  notes TEXT,
  UNIQUE (church_id, closure_type, period_start, period_end),
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);
CREATE INDEX idx_closure_church_range ON financial_closure(church_id, period_start, period_end);
```

## Budget prévisionnel
```sql
CREATE TABLE finance_budget (
  budget_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  budget_type TEXT NOT NULL, -- ANNUAL|SEMIANNUAL|QUARTERLY|MONTHLY
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  fiscal_year INTEGER,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  UNIQUE (church_id, budget_type, period_start, period_end),
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);

CREATE TABLE finance_budget_line (
  budget_line_id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL,
  church_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  fund_id TEXT,
  planned_receipts_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  planned_expenses_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  planned_expenses_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (budget_id) REFERENCES finance_budget(budget_id),
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);
CREATE INDEX idx_budgetline_church_cat ON finance_budget_line(church_id, category_id);
```

## Pièces justificatives
```sql
CREATE TABLE operation_attachment (
  attachment_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  attachment_kind TEXT NOT NULL, -- IMAGE|PDF|FACTURE|RECU|AUTRE
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  encrypted_blob_ref TEXT NOT NULL, -- référence vers stockage chiffré
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  FOREIGN KEY (church_id) REFERENCES church(church_id),
  FOREIGN KEY (operation_id) REFERENCES financial_operation(operation_id)
);
CREATE INDEX idx_attachment_church_op ON operation_attachment(church_id, operation_id);
```

## Enveloppes
```sql
CREATE TABLE envelope (
  envelope_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  envelope_number TEXT NOT NULL, -- ex: ENV-AAAA-000001 (définir dans la spec)
  follower TEXT NOT NULL,        -- Fidèle
  envelope_date TEXT NOT NULL,
  category_id TEXT NOT NULL,
  fund_id TEXT NOT NULL,
  amount_cdf NUMERIC(20,6) NOT NULL,
  amount_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  usd_rate_quote_per_1_usd NUMERIC(20,6),
  exchange_rate_usd_id TEXT,
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
CREATE INDEX idx_envelope_church_date ON envelope(church_id, envelope_date);
CREATE INDEX idx_envelope_church_follower ON envelope(church_id, follower);
```

## Promesses de foi
```sql
CREATE TABLE faith_pledge (
  pledge_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  follower TEXT NOT NULL,
  pledge_amount_cdf NUMERIC(20,6) NOT NULL,
  pledge_amount_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  deleted_at TEXT,
  deletion_reason TEXT,
  UNIQUE (church_id, pledge_id)
);

CREATE TABLE faith_pledge_payment (
  payment_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  pledge_id TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  amount_cdf NUMERIC(20,6) NOT NULL,
  amount_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  exchange_rate_usd_id TEXT,
  usd_rate_quote_per_1_usd NUMERIC(20,6),
  category_id TEXT NOT NULL,
  fund_id TEXT NOT NULL,
  event_id TEXT,
  observation TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  FOREIGN KEY (pledge_id) REFERENCES faith_pledge(pledge_id),
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);
CREATE INDEX idx_pledge_payment_church_pledge ON faith_pledge_payment(church_id, pledge_id);
```

## Comptage des offrandes
```sql
CREATE TABLE counting_session (
  counting_session_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  counting_date TEXT NOT NULL,
  team_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  validated_at TEXT,
  validated_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'opened', -- opened|validated|archived
  deleted_at TEXT,
  deletion_reason TEXT,
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);

CREATE TABLE counting_line (
  counting_line_id TEXT PRIMARY KEY,
  counting_session_id TEXT NOT NULL,
  church_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  fund_id TEXT NOT NULL,
  amount_cdf NUMERIC(20,6) NOT NULL,
  amount_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  exchange_rate_usd_id TEXT,
  usd_rate_quote_per_1_usd NUMERIC(20,6),
  observation TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  FOREIGN KEY (counting_session_id) REFERENCES counting_session(counting_session_id),
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);
CREATE INDEX idx_countingline_session ON counting_line(counting_session_id);
```

## Caisse
```sql
CREATE TABLE cash_box (
  cash_box_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (church_id, name)
);

CREATE TABLE cash_session (
  cash_session_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  cash_box_id TEXT NOT NULL,
  open_date TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  opened_by_user_id TEXT NOT NULL,
  opening_balance_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,

  close_date TEXT,
  closed_at TEXT,
  closed_by_user_id TEXT,
  closing_balance_cdf NUMERIC(20,6),
  cash_diff_cdf NUMERIC(20,6), -- closing - expected
  status TEXT NOT NULL DEFAULT 'open', -- open|closed|archived
  notes TEXT,
  FOREIGN KEY (church_id) REFERENCES church(church_id),
  FOREIGN KEY (cash_box_id) REFERENCES cash_box(cash_box_id)
);

CREATE TABLE cash_transaction (
  cash_transaction_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  cash_session_id TEXT NOT NULL,
  piece_type TEXT NOT NULL DEFAULT 'CAI',
  piece_number TEXT NOT NULL,
  op_date TEXT NOT NULL,
  label TEXT NOT NULL,
  beneficiary TEXT,
  category_id TEXT NOT NULL,
  fund_id TEXT NOT NULL,
  event_id TEXT,
  receipts_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
  expenses_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
  receipts_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  expenses_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
  expenses_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  exchange_rate_usd_id TEXT,
  usd_rate_quote_per_1_usd NUMERIC(20,6),
  observation TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  deleted_at TEXT,
  deletion_reason TEXT,
  UNIQUE (church_id, piece_number),
  FOREIGN KEY (cash_session_id) REFERENCES cash_session(cash_session_id)
);
CREATE INDEX idx_cash_tx_session ON cash_transaction(cash_session_id);
```

## Bancaire
```sql
CREATE TABLE bank_account (
  bank_account_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  name TEXT NOT NULL,
  iban TEXT,
  swift TEXT,
  currency_code TEXT NOT NULL DEFAULT 'CDF',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (church_id, name)
);

CREATE TABLE bank_transaction (
  bank_transaction_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  piece_type TEXT NOT NULL DEFAULT 'BAN',
  piece_number TEXT NOT NULL,
  tx_date TEXT NOT NULL,
  label TEXT NOT NULL,
  beneficiary TEXT,
  category_id TEXT NOT NULL,
  fund_id TEXT NOT NULL,
  event_id TEXT,
  receipts_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
  expenses_cdf NUMERIC(20,6) NOT NULL DEFAULT 0,
  receipts_usd_converted NUMERIC(20,6) NOT NULL DEFAULT 0,
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
  UNIQUE (church_id, piece_number),
  FOREIGN KEY (bank_account_id) REFERENCES bank_account(bank_account_id)
);
CREATE INDEX idx_bank_tx_account_date ON bank_transaction(bank_account_id, tx_date);
```

## Rapprochement bancaire
```sql
CREATE TABLE bank_reconciliation (
  bank_reconciliation_id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  reconciliation_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open|validated|archived
  opened_by_user_id TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  validated_by_user_id TEXT,
  validated_at TEXT,
  notes TEXT
);

CREATE TABLE bank_reconciliation_match (
  match_id TEXT PRIMARY KEY,
  bank_reconciliation_id TEXT NOT NULL,
  church_id TEXT NOT NULL,
  bank_transaction_id TEXT,
  external_statement_line_ref TEXT,
  matched_amount_cdf NUMERIC(20,6),
  created_at TEXT NOT NULL,
  FOREIGN KEY (bank_reconciliation_id) REFERENCES bank_reconciliation(bank_reconciliation_id),
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);
```

## Numérotation automatique (REC/DEP/CAI/BAN)
La table suivante garantit :
- génération sans doublon
- génération concurrente sûre (BEGIN IMMEDIATE côté application)
```sql
CREATE TABLE numbering_sequence (
  church_id TEXT NOT NULL,
  sequence_key TEXT NOT NULL, -- ex: REC-2026, DEP-2026, ...
  prefix TEXT NOT NULL,       -- REC|DEP|CAI|BAN
  year INTEGER NOT NULL,
  last_value INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (church_id, sequence_key),
  FOREIGN KEY (church_id) REFERENCES church(church_id)
);
```

## Vérifications / invariants à implémenter en application
- Tenant scoping : tout SELECT/INSERT/UPDATE DOIT inclure `church_id`.
- Vérifier existence d’un `exchange_rate` pour `op_date` lorsque conversion USD est nécessaire.
- Vérifier l’absence de clôture active couvrant `op_date` avant modification/suppression/restauration.
- Politique de suppression : uniquement logique + corbeille, aucune suppression définitive.

