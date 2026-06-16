import type { AppDatabase } from '../database/appDatabase';

export function migrateMembers(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS church_member (
      member_id TEXT PRIMARY KEY,
      church_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      birth_date TEXT,
      gender TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (church_id) REFERENCES church(church_id)
    );
    CREATE INDEX IF NOT EXISTS idx_member_church_status ON church_member(church_id, status);
    CREATE INDEX IF NOT EXISTS idx_member_church_name ON church_member(church_id, full_name);
  `);
}
