import type { SqliteDatabase } from '../sqlite/sqliteDatabase';

export function migratePastoralExtended(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pastoral_cell (
      cell_id TEXT PRIMARY KEY,
      church_id TEXT NOT NULL,
      name TEXT NOT NULL,
      leader_member_id TEXT,
      meeting_day TEXT,
      meeting_time TEXT,
      location TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cell_church ON pastoral_cell(church_id, status);

    CREATE TABLE IF NOT EXISTS pastoral_visit (
      visit_id TEXT PRIMARY KEY,
      church_id TEXT NOT NULL,
      member_id TEXT,
      visitor_name TEXT NOT NULL,
      visit_date TEXT NOT NULL,
      visit_type TEXT NOT NULL DEFAULT 'domicile',
      notes TEXT,
      created_at TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_visit_church_date ON pastoral_visit(church_id, visit_date);

    CREATE TABLE IF NOT EXISTS pastoral_training (
      training_id TEXT PRIMARY KEY,
      church_id TEXT NOT NULL,
      title TEXT NOT NULL,
      training_date TEXT NOT NULL,
      trainer TEXT,
      location TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_training_church_date ON pastoral_training(church_id, training_date);

    CREATE TABLE IF NOT EXISTS oauth_identity (
      oauth_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(provider, provider_subject)
    );
  `);
}
