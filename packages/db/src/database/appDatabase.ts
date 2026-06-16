/** Interface commune SQLite locale et PostgreSQL cloud. */
export type DbStatement = {
  run(params?: Record<string, unknown>): void;
  get<T = unknown>(params?: Record<string, unknown>): T | undefined;
  all<T = Record<string, unknown>>(params?: Record<string, unknown>): T[];
};

export type DbTransaction = {
  prepare(sql: string): DbStatement;
};

export type AppDatabase = {
  readonly dialect: 'sqlite' | 'postgres';
  run(sql: string, params?: Record<string, unknown>): void;
  get<T = unknown>(sql: string, params?: Record<string, unknown>): T | undefined;
  all<T = Record<string, unknown>>(sql: string, params?: Record<string, unknown>): T[];
  exec(sql: string): void;
  withTransaction<T>(fn: (tx: DbTransaction) => T): T;
  close(): void;
};
