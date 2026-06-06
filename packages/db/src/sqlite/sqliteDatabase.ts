type DbInstance = {
  prepare: (sql: string) => { run: (p?: object) => void; get: (p?: object) => unknown; all: (p?: object) => unknown[] };
  pragma: (v: string) => unknown;
  exec: (sql: string) => void;
  transaction: <T>(fn: () => T) => () => T;
  close: () => void;
};

type DatabaseCtor = new (filename: string, options?: object) => DbInstance;

function loadDatabaseDriver(): DatabaseCtor {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('better-sqlite3-multiple-ciphers') as DatabaseCtor;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('better-sqlite3') as DatabaseCtor;
  }
}

const Database = loadDatabaseDriver();

export type SqliteDatabaseOptions = {
  readonly dbFilePath: string;
  readonly busyTimeoutMs?: number;
  readonly foreignKeys?: boolean;
  readonly journalMode?: 'wal' | 'delete' | 'memory' | string;
  readonly synchronous?: 'off' | 'normal' | 'full' | string;
  readonly encryption?: {
    enabled: boolean;
    passphrase: string;
  };
};

export type SqliteRow = Record<string, unknown>;

export function escapeSqlCipherKey(value: string): string {
  return value.replace(/'/g, "''");
}

export function migratePlainDatabaseToEncrypted(dbFilePath: string, passphrase: string): void {
  const key = escapeSqlCipherKey(passphrase.trim());
  const db = new Database(dbFilePath);
  try {
    db.prepare(`SELECT count(*) AS n FROM sqlite_master`).get();
    db.pragma(`rekey='${key}'`);
  } finally {
    db.close();
  }
}

export class SqliteDatabase {
  private readonly db: DbInstance;

  constructor(private readonly options: SqliteDatabaseOptions) {
    this.db = new Database(options.dbFilePath, { fileMustExist: false });

    this.db.pragma(`busy_timeout = ${Math.max(0, options.busyTimeoutMs ?? 5000)}`);
    if (options.foreignKeys !== false) this.db.pragma('foreign_keys = ON');

    const enc = options.encryption;
    if (enc?.enabled && enc.passphrase.trim()) {
      try {
        this.db.pragma(`key='${escapeSqlCipherKey(enc.passphrase.trim())}'`);
      } catch (err) {
        console.warn('[Tabernacle] SQLCipher indisponible — base non chiffrée:', err);
      }
    }

    if (options.journalMode) this.db.pragma(`journal_mode = ${options.journalMode}`);
    if (options.synchronous) this.db.pragma(`synchronous = ${options.synchronous}`);
  }

  isEncryptionEnabled(): boolean {
    return !!(this.options.encryption?.enabled && this.options.encryption.passphrase.trim());
  }

  get raw(): DbInstance {
    return this.db;
  }

  withTransaction<T>(fn: (tx: DbInstance) => T): T {
    return this.db.transaction(() => fn(this.db))();
  }

  run(sql: string, params?: Record<string, unknown>): void {
    this.db.prepare(sql).run(params ?? {});
  }

  get<T = unknown>(sql: string, params?: Record<string, unknown>): T | undefined {
    return this.db.prepare(sql).get(params ?? {}) as T | undefined;
  }

  all<T = SqliteRow>(sql: string, params?: Record<string, unknown>): T[] {
    return this.db.prepare(sql).all(params ?? {}) as T[];
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}
