import type { SqliteDatabase } from '../sqlite/sqliteDatabase';

/** Permissions personnalisées par utilisateur et par église. */
export function migrateUserPermission(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_permission (
      church_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (church_id, user_id, permission_id)
    );
  `);
}
