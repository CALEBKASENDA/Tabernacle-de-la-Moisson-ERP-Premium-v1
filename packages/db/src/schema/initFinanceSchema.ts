import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import { FINANCE_FULL_SCHEMA_SQL } from './financeFullSchema';
import { migrateOptionalFundId } from './migrateOptionalFund';
import { migrateReceiptsUsdColumn } from './migrateReceiptsUsd';
import { migrateUsdDirectColumns } from './migrateUsdDirectColumns';
import { migrateUserPermission } from './migrateUserPermission';
import { migrateChurchFundsEnabled } from './migrateChurchFundsEnabled';
import { migrateBankReconciliationMatch } from './migrateBankReconciliationMatch';
import { migrateMembers } from './migrateMembers';
import { migratePastoralExtended } from './migratePastoralExtended';
import { registerMigration, runVersionedMigrations } from './migrateSchemaVersion';
import { newId, DEFAULT_CURRENCIES, DEFAULT_FINANCE_CATEGORIES, DEFAULT_FUNDS } from '@tabernacle/erp-premium-domain';

registerMigration(1, 'bank_reconciliation_match', migrateBankReconciliationMatch);
registerMigration(2, 'church_member', migrateMembers);
registerMigration(3, 'pastoral_extended_oauth', migratePastoralExtended);

export function ensureFinanceSchema(db: SqliteDatabase): void {
  db.exec(FINANCE_FULL_SCHEMA_SQL);
  migrateOptionalFundId(db);
  migrateReceiptsUsdColumn(db);
  migrateUsdDirectColumns(db);
  migrateUserPermission(db);
  migrateChurchFundsEnabled(db);
  migrateBankReconciliationMatch(db);
  runVersionedMigrations(db);
}

export function seedChurchDefaults(db: SqliteDatabase, churchId: string, churchName: string): void {
  const now = new Date().toISOString();
  const existing = db.get<{ church_id: string }>(
    `SELECT church_id FROM church WHERE church_id = @church_id`,
    { church_id: churchId }
  );
  if (!existing) {
    db.run(
      `INSERT INTO church (church_id, name, status, created_at, updated_at) VALUES (@church_id, @name, 'active', @now, @now)`,
      { church_id: churchId, name: churchName, now }
    );
  }

  for (const c of DEFAULT_CURRENCIES) {
    db.run(
      `INSERT OR IGNORE INTO currency (currency_code, name, status) VALUES (@code, @name, 'active')`,
      { code: c.code, name: c.name }
    );
  }

  DEFAULT_FINANCE_CATEGORIES.forEach((name, i) => {
    const id = `cat_${churchId}_${i}`;
    db.run(
      `INSERT OR IGNORE INTO finance_category (category_id, church_id, name, sort_order, status, created_at, updated_at)
       VALUES (@id, @church_id, @name, @sort, 'active', @now, @now)`,
      { id, church_id: churchId, name, sort: i, now }
    );
  });

  db.run(
    `INSERT OR IGNORE INTO cash_box (cash_box_id, church_id, name, is_active, created_at, updated_at)
     VALUES (@id, @church_id, 'Caisse principale', 1, @now, @now)`,
    { id: `cashbox_${churchId}`, church_id: churchId, now }
  );

  ensureDefaultExchangeRate(db, churchId);
}

/** Crée les fonds par défaut lors de l'activation de la répartition par fonds. */
export function seedChurchFunds(db: SqliteDatabase, churchId: string): void {
  const now = new Date().toISOString();
  DEFAULT_FUNDS.forEach((name, i) => {
    const id = `fund_${churchId}_${i}`;
    db.run(
      `INSERT OR IGNORE INTO finance_fund (fund_id, church_id, name, sort_order, status, created_at, updated_at)
       VALUES (@id, @church_id, @name, @sort, 'active', @now, @now)`,
      { id, church_id: churchId, name, sort: i, now }
    );
  });
}

/** Taux USD/CDF par défaut si aucun taux n'existe encore (bases neuves ou migrations). */
export function ensureDefaultExchangeRate(db: SqliteDatabase, churchId: string): void {
  const existing = db.get<{ c: number }>(
    `SELECT COUNT(*) as c FROM exchange_rate WHERE church_id=@church_id AND deleted_at IS NULL`,
    { church_id: churchId }
  );
  if (existing && existing.c > 0) return;

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const defaultRate = process.env.TABERNACLE_DEFAULT_USD_CDF_RATE?.trim() || '2800';
  db.run(
    `INSERT INTO exchange_rate (
      exchange_rate_id, church_id, base_currency_code, quote_currency_code, effective_date,
      rate_quote_per_1_base, created_at, created_by_user_id, updated_at, updated_by_user_id, is_active
    ) VALUES (
      @id, @church_id, 'USD', 'CDF', @effective_date, @rate,
      @now, 'system', @now, 'system', 1
    )`,
    {
      id: newId('exrate'),
      church_id: churchId,
      effective_date: today,
      rate: defaultRate,
      now,
    }
  );
  console.log(`[Tabernacle] Taux USD/CDF initial créé : 1 USD = ${defaultRate} CDF (${today})`);
}

export function seedSuperAdmin(
  db: SqliteDatabase,
  params: { churchId: string; email: string; fullName: string; passwordHash: string }
): string {
  const now = new Date().toISOString();
  const userId = newId('user');
  db.run(
    `INSERT OR IGNORE INTO app_user (user_id, email, full_name, password_hash, is_active, created_at, updated_at)
     VALUES (@user_id, @email, @full_name, @password_hash, 1, @now, @now)`,
    {
      user_id: userId,
      email: params.email,
      full_name: params.fullName,
      password_hash: params.passwordHash,
      now,
    }
  );
  db.run(
    `INSERT OR IGNORE INTO church_user (church_id, user_id, status, created_at) VALUES (@church_id, @user_id, 'active', @now)`,
    { church_id: params.churchId, user_id: userId, now }
  );
  return userId;
}
