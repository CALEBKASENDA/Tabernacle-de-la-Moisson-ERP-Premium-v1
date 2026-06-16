import type { AppDatabase } from '../database/appDatabase';

const MIGRATIONS: Array<{ version: number; name: string; run: (db: AppDatabase) => void }> = [];

export function registerMigration(version: number, name: string, run: (db: AppDatabase) => void): void {
  MIGRATIONS.push({ version, name, run });
  MIGRATIONS.sort((a, b) => a.version - b.version);
}

export function runVersionedMigrations(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  for (const m of MIGRATIONS) {
    const applied = db.get<{ version: number }>(
      `SELECT version FROM schema_migration WHERE version=@v`,
      { v: m.version }
    );
    if (applied) continue;
    m.run(db);
    db.run(
      `INSERT INTO schema_migration (version, name, applied_at) VALUES (@v, @name, @at)`,
      { v: m.version, name: m.name, at: new Date().toISOString() }
    );
  }
}
