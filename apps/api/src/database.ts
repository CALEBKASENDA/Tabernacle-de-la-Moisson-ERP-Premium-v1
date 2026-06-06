import path from 'node:path';
import fs from 'node:fs';
import {
  SqliteDatabase,
  migratePlainDatabaseToEncrypted,
} from '@tabernacle/erp-premium-db';

function resolveDbEncryption():
  | { enabled: true; passphrase: string }
  | { enabled: false; passphrase: string } {
  const passphrase = process.env.TABERNACLE_DB_KEY?.trim() ?? '';
  if (!passphrase) return { enabled: false, passphrase: '' };
  return { enabled: true, passphrase };
}

function prepareDatabaseFile(dbPath: string, encryption: ReturnType<typeof resolveDbEncryption>): void {
  if (!encryption.enabled || !fs.existsSync(dbPath)) return;

  try {
    const probe = new SqliteDatabase({
      dbFilePath: dbPath,
      encryption: { enabled: true, passphrase: encryption.passphrase },
    });
    probe.get(`SELECT name FROM sqlite_master LIMIT 1`);
    probe.close();
    return;
  } catch {
    /* migration plain → chiffré */
  }

  try {
    migratePlainDatabaseToEncrypted(dbPath, encryption.passphrase);
    console.log('[Tabernacle] Base migrée vers SQLCipher');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'migration chiffrement';
    console.error('[Tabernacle] Migration SQLCipher échouée:', msg);
  }
}

export function openAppDatabase(dataDir: string): SqliteDatabase {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'tabernacle-finance.sqlite');
  const encryption = resolveDbEncryption();
  prepareDatabaseFile(dbPath, encryption);

  const db = new SqliteDatabase({
    dbFilePath: dbPath,
    journalMode: 'wal',
    synchronous: 'normal',
    encryption: encryption.enabled
      ? { enabled: true, passphrase: encryption.passphrase }
      : undefined,
  });

  if (encryption.enabled) {
    console.log('[Tabernacle] SQLCipher actif — base chiffrée au repos');
  }

  return db;
}
