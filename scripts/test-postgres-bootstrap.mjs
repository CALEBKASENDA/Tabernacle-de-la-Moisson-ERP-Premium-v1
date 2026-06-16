/**
 * Smoke test PostgreSQL cloud — nécessite DATABASE_URL.
 * Exemple : DATABASE_URL=postgresql://tabernacle:test@127.0.0.1:5432/tabernacle node scripts/test-postgres-bootstrap.mjs
 */
import { PostgresDatabase, ensureFinanceSchema, seedChurchDefaults } from '../packages/db/dist/index.js';

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('DATABASE_URL requis');
  process.exit(1);
}

const db = new PostgresDatabase({ connectionString: url });
try {
  ensureFinanceSchema(db);
  seedChurchDefaults(db, 'church_pg_test', 'Test PostgreSQL');
  const church = db.get(`SELECT church_id, name FROM church WHERE church_id=@id`, { id: 'church_pg_test' });
  if (!church) throw new Error('Église de test introuvable après bootstrap');
  console.log('OK bootstrap PostgreSQL', church);
} finally {
  db.close();
}
