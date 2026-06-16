import type { AppDatabase } from '../database/appDatabase';

export function getTableColumns(db: AppDatabase, table: string): Array<{ name: string; notnull?: number }> {
  if (db.dialect === 'sqlite') {
    return db.all<{ name: string; notnull: number }>(`PRAGMA table_info('${table}')`);
  }
  return db.all<{ name: string; notnull: number }>(
    `SELECT column_name AS name,
            CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = @table
      ORDER BY ordinal_position`,
    { table },
  );
}

export function ensureColumn(
  db: AppDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  const cols = getTableColumns(db, table);
  if (cols.some((c) => c.name === column)) return;

  if (db.dialect === 'postgres') {
    db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function sqlMonthFromDate(column: string, dialect: AppDatabase['dialect']): string {
  if (dialect === 'postgres') {
    return `to_char(${column}::date, 'YYYY-MM')`;
  }
  return `strftime('%Y-%m', ${column})`;
}
