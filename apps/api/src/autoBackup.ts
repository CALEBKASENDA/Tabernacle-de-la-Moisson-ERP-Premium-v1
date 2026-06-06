import fs from 'node:fs';
import path from 'node:path';

const INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_BACKUPS = 14;

function getDataDir(): string {
  return process.env.TABERNACLE_DATA_DIR ?? path.join(process.cwd(), 'data');
}

export function runAutoBackup(): { ok: boolean; fileName?: string; error?: string } {
  const dataDir = getDataDir();
  const dbPath = path.join(dataDir, 'tabernacle-finance.sqlite');
  if (!fs.existsSync(dbPath)) {
    return { ok: false, error: 'Base de données introuvable' };
  }

  const backupDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `tabernacle-finance-${stamp}.sqlite`;
  const dest = path.join(backupDir, fileName);

  try {
    fs.copyFileSync(dbPath, dest);
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.sqlite'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of files.slice(MAX_BACKUPS)) {
      try {
        fs.unlinkSync(path.join(backupDir, old.name));
      } catch {
        /* ignore */
      }
    }
    console.log(`[Tabernacle] Sauvegarde automatique : ${fileName}`);
    return { ok: true, fileName };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur sauvegarde';
    console.error('[Tabernacle] Sauvegarde automatique échouée:', message);
    return { ok: false, error: message };
  }
}

export function startAutoBackupScheduler(): void {
  if (process.env.TABERNACLE_DISABLE_AUTO_BACKUP === '1') return;

  const tick = () => runAutoBackup();
  setTimeout(tick, 60_000);
  setInterval(tick, INTERVAL_MS);
  console.log('[Tabernacle] Sauvegarde automatique planifiée (quotidienne, rétention 14 jours)');
}
