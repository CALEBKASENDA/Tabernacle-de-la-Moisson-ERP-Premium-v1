import fs from 'node:fs';
import path from 'node:path';

function candidateEnvPaths(): string[] {
  const paths: string[] = [];
  if (process.env.TABERNACLE_ENV_FILE) {
    paths.push(process.env.TABERNACLE_ENV_FILE);
  }
  if (process.env.TABERNACLE_INSTALL_ROOT) {
    paths.push(path.join(process.env.TABERNACLE_INSTALL_ROOT, 'config', '.env'));
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    paths.push(path.join(process.env.LOCALAPPDATA, 'Tabernacle ERP', '.env'));
  }
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    paths.push(path.join(dir, '.env'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return paths;
}

/** Charge `.env` (sans écraser les variables déjà définies). */
export function loadEnv(): void {
  for (const file of candidateEnvPaths()) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    return;
  }
}
