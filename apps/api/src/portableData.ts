import fs from 'node:fs';
import path from 'node:path';

export const PORTABLE_FOLDER_NAME = 'TabernacleERP-Portable';
export const PORTABLE_MANIFEST = 'manifest.json';
export const IMPORT_PENDING_FILE = 'import-portable.pending';

export type PortableManifest = {
  format: 'tabernacle-portable-v1';
  exportedAt: string;
  appVersion: string;
  churchName?: string;
};

function normalizeDir(p: string): string {
  return path.resolve(p.trim());
}

function copyDirRecursive(src: string, dest: string, skipNames = new Set<string>()): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipNames.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(from, to, skipNames);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function dirSizeBytes(root: string): number {
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    }
  };
  walk(root);
  return total;
}

export function validatePortablePackage(sourceDir: string): { ok: boolean; errors: string[]; manifest?: PortableManifest } {
  const root = normalizeDir(sourceDir);
  const errors: string[] = [];
  if (!fs.existsSync(root)) {
    return { ok: false, errors: ['Dossier introuvable'] };
  }

  const manifestPath = path.join(root, PORTABLE_MANIFEST);
  const dataDir = path.join(root, 'data');
  const dbInRoot = path.join(root, 'tabernacle-finance.sqlite');
  const dbInData = path.join(dataDir, 'tabernacle-finance.sqlite');

  let manifest: PortableManifest | undefined;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PortableManifest;
      if (manifest.format !== 'tabernacle-portable-v1') {
        errors.push('Format de paquet non reconnu');
      }
    } catch {
      errors.push('Fichier manifest.json invalide');
    }
  } else {
    errors.push('manifest.json manquant');
  }

  const hasDb = fs.existsSync(dbInData) || fs.existsSync(dbInRoot);
  if (!hasDb) {
    errors.push('Base tabernacle-finance.sqlite introuvable');
  }

  return { ok: errors.length === 0, errors, manifest };
}

export function exportPortablePackage(params: {
  dataDir: string;
  configEnvPath?: string | null;
  targetDir: string;
  churchName?: string;
}): { ok: boolean; packagePath: string; bytes: number; error?: string } {
  const dataDir = normalizeDir(params.dataDir);
  const dbPath = path.join(dataDir, 'tabernacle-finance.sqlite');
  if (!fs.existsSync(dbPath)) {
    return { ok: false, packagePath: '', bytes: 0, error: 'Base de données introuvable' };
  }

  let targetRoot = normalizeDir(params.targetDir);
  if (path.basename(targetRoot).toLowerCase() !== PORTABLE_FOLDER_NAME.toLowerCase()) {
    targetRoot = path.join(targetRoot, PORTABLE_FOLDER_NAME);
  }

  if (targetRoot.startsWith(dataDir + path.sep) || targetRoot === dataDir) {
    return { ok: false, packagePath: '', bytes: 0, error: 'Choisissez un dossier externe (ex. clé USB)' };
  }

  try {
    if (fs.existsSync(targetRoot)) {
      fs.rmSync(targetRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(targetRoot, { recursive: true });

    const packageDataDir = path.join(targetRoot, 'data');
    copyDirRecursive(dataDir, packageDataDir, new Set([IMPORT_PENDING_FILE]));

    const manifest: PortableManifest = {
      format: 'tabernacle-portable-v1',
      exportedAt: new Date().toISOString(),
      appVersion: process.env.npm_package_version ?? '1.2.0',
      churchName: params.churchName,
    };
    fs.writeFileSync(path.join(targetRoot, PORTABLE_MANIFEST), JSON.stringify(manifest, null, 2), 'utf8');

    if (params.configEnvPath && fs.existsSync(params.configEnvPath)) {
      fs.mkdirSync(path.join(targetRoot, 'config'), { recursive: true });
      fs.copyFileSync(params.configEnvPath, path.join(targetRoot, 'config', '.env'));
    }

    fs.writeFileSync(
      path.join(targetRoot, 'LISEZMOI.txt'),
      [
        'Tabernacle de la Moisson ERP — paquet portable',
        '',
        '1. Installez Tabernacle ERP sur l\'autre PC (même version ou plus récente).',
        '2. Arrêtez l\'application sur les deux PC.',
        '3. Menu Démarrer → Importer données portables (clé USB)',
        '   OU dans Cloud → Importer depuis ce dossier.',
        '',
        `Exporté le : ${manifest.exportedAt}`,
      ].join('\r\n'),
      'utf8'
    );

    const bytes = dirSizeBytes(targetRoot);
    return { ok: true, packagePath: targetRoot, bytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export impossible';
    return { ok: false, packagePath: '', bytes: 0, error: message };
  }
}

export function schedulePortableImport(dataDir: string, sourceDir: string): { ok: boolean; error?: string } {
  const validation = validatePortablePackage(sourceDir);
  if (!validation.ok) {
    return { ok: false, error: validation.errors.join(' ; ') };
  }

  const flagPath = path.join(normalizeDir(dataDir), IMPORT_PENDING_FILE);
  try {
    fs.writeFileSync(flagPath, normalizeDir(sourceDir), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Planification impossible' };
  }
}

export function applyPendingPortableImport(dataDir: string, configDir: string): { applied: boolean; source?: string; error?: string } {
  const root = normalizeDir(dataDir);
  const flagPath = path.join(root, IMPORT_PENDING_FILE);
  if (!fs.existsSync(flagPath)) {
    return { applied: false };
  }

  const sourceDir = fs.readFileSync(flagPath, 'utf8').trim();
  fs.unlinkSync(flagPath);

  const validation = validatePortablePackage(sourceDir);
  if (!validation.ok) {
    return { applied: false, source: sourceDir, error: validation.errors.join(' ; ') };
  }

  const packageDataDir = path.join(normalizeDir(sourceDir), 'data');
  const legacyDb = path.join(normalizeDir(sourceDir), 'tabernacle-finance.sqlite');
  const srcData = fs.existsSync(packageDataDir) ? packageDataDir : normalizeDir(sourceDir);

  try {
    const backupDir = path.join(root, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const preImportBackup = path.join(backupDir, `pre-import-${stamp}`);
    if (fs.existsSync(root)) {
      copyDirRecursive(root, preImportBackup, new Set(['backups', IMPORT_PENDING_FILE]));
    }

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.name === 'backups' || entry.name === IMPORT_PENDING_FILE) continue;
      const p = path.join(root, entry.name);
      fs.rmSync(p, { recursive: true, force: true });
    }

    if (fs.existsSync(packageDataDir)) {
      copyDirRecursive(packageDataDir, root, new Set(['backups', IMPORT_PENDING_FILE]));
    } else if (fs.existsSync(legacyDb)) {
      fs.mkdirSync(root, { recursive: true });
      for (const entry of fs.readdirSync(srcData, { withFileTypes: true })) {
        if (entry.name === 'backups') continue;
        const from = path.join(srcData, entry.name);
        const to = path.join(root, entry.name);
        if (entry.isDirectory()) copyDirRecursive(from, to);
        else fs.copyFileSync(from, to);
      }
    }

    const envSrc = path.join(normalizeDir(sourceDir), 'config', '.env');
    if (fs.existsSync(envSrc)) {
      fs.mkdirSync(configDir, { recursive: true });
      fs.copyFileSync(envSrc, path.join(configDir, '.env'));
    }

    return { applied: true, source: sourceDir };
  } catch (err) {
    return { applied: false, source: sourceDir, error: err instanceof Error ? err.message : 'Import impossible' };
  }
}
