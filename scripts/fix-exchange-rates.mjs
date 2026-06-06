/**
 * Répare les taux manquants dans la base locale AppData.
 * Usage : node scripts/fix-exchange-rates.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SqliteDatabase } from '@tabernacle/erp-premium-db';

const dataDir = path.join(os.homedir(), 'AppData', 'Local', 'Tabernacle ERP', 'data');
const dbPath = path.join(dataDir, 'tabernacle-finance.sqlite');

if (!fs.existsSync(dbPath)) {
  console.error('Base introuvable :', dbPath);
  process.exit(1);
}

const db = new SqliteDatabase({ dbFilePath: dbPath });
const churches = db.all(`SELECT church_id FROM church`);
const now = new Date().toISOString();
const today = now.slice(0, 10);

for (const { church_id } of churches) {
  const latest = db.get(
    `SELECT rate_quote_per_1_base, effective_date FROM exchange_rate
     WHERE church_id=@c AND deleted_at IS NULL AND is_active=1
       AND base_currency_code='USD' AND quote_currency_code='CDF'
     ORDER BY effective_date DESC LIMIT 1`,
    { c: church_id }
  );

  const rate = latest?.rate_quote_per_1_base ?? '2800';
  const dates = ['2026-04-05', today];

  for (const d of dates) {
    const exists = db.get(
      `SELECT 1 FROM exchange_rate WHERE church_id=@c AND effective_date=@d
         AND base_currency_code='USD' AND quote_currency_code='CDF' AND deleted_at IS NULL`,
      { c: church_id, d }
    );
    if (exists) continue;
    const id = `exrate_fix_${church_id}_${d.replace(/-/g, '')}`;
    db.run(
      `INSERT INTO exchange_rate (
        exchange_rate_id, church_id, base_currency_code, quote_currency_code, effective_date,
        rate_quote_per_1_base, created_at, created_by_user_id, updated_at, updated_by_user_id, is_active
      ) VALUES (@id, @c, 'USD', 'CDF', @d, @rate, @now, 'system', @now, 'system', 1)`,
      { id, c: church_id, d, rate, now }
    );
    console.log(`[OK] ${church_id} — taux ${d} : 1 USD = ${rate} CDF`);
  }
}

console.log('Terminé. Redémarrez Tabernacle ERP puis réessayez une opération.');
