import fs from 'node:fs';
import path from 'node:path';

const BOOTSTRAP_KEYS = [
  'TABERNACLE_BOOTSTRAP_EMAIL',
  'TABERNACLE_BOOTSTRAP_PASSWORD',
  'TABERNACLE_BOOTSTRAP_NAME',
  'TABERNACLE_BOOTSTRAP_RESET',
  'TABERNACLE_DB_KEY',
  'TABERNACLE_JWT_SECRET',
] as const;

export function parseEnvFile(content: string): Record<string, string> {
  const map: Record<string, string> = {};
  const normalized = content.replace(/^\uFEFF/, '');
  for (const line of normalized.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^\uFEFF/, '');
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

export function installConfigPaths(): string[] {
  const paths: string[] = [];
  if (process.env.TABERNACLE_ENV_FILE) {
    paths.push(process.env.TABERNACLE_ENV_FILE);
  }
  if (process.env.TABERNACLE_INSTALL_ROOT) {
    const configDir = path.join(process.env.TABERNACLE_INSTALL_ROOT, 'config');
    paths.push(path.join(configDir, '.env'));
    paths.push(path.join(configDir, 'env.template'));
  }
  return [...new Set(paths)];
}

/** Charge la configuration d'installation (bootstrap, secrets) — écrase les valeurs vides ou manquantes. */
export function loadInstallBootstrapConfig(): void {
  for (const file of installConfigPaths()) {
    if (!fs.existsSync(file)) continue;
    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const map = parseEnvFile(raw);
    for (const key of BOOTSTRAP_KEYS) {
      const value = map[key]?.trim();
      if (value) {
        process.env[key] = value;
      }
    }
  }
}

export function resolveBootstrapAccount(): {
  email: string;
  password: string;
  fullName: string;
  resetPassword: boolean;
} | null {
  loadInstallBootstrapConfig();
  const email = process.env.TABERNACLE_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.TABERNACLE_BOOTSTRAP_PASSWORD;
  const fullName = process.env.TABERNACLE_BOOTSTRAP_NAME?.trim() || 'Administrateur';
  if (!email || !password) return null;
  return {
    email,
    password,
    fullName,
    resetPassword: process.env.TABERNACLE_BOOTSTRAP_RESET === 'true',
  };
}
