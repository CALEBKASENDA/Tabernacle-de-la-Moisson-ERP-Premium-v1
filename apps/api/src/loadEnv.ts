import fs from 'node:fs';
import path from 'node:path';
import { loadInstallBootstrapConfig, parseEnvFile } from './bootstrapConfig';

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

/** Charge `.env` (sans écraser les variables déjà définies, sauf config bootstrap). */
export function loadEnv(): void {
  loadInstallBootstrapConfig();

  for (const file of candidateEnvPaths()) {
    if (!fs.existsSync(file)) continue;
    const map = parseEnvFile(fs.readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(map)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    loadInstallBootstrapConfig();
    return;
  }
}
