/**
 * Prépare le dev Tauri : compile l'API puis lance Vite (bloquant).
 */
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('[Tauri] Compilation API (domain, db, api)...');
execSync(
  'npm run build -w @tabernacle/erp-premium-domain && npm run build -w @tabernacle/erp-premium-db && npm run build -w @tabernacle/erp-premium-api',
  { cwd: root, stdio: 'inherit', shell: true }
);

console.log('[Tauri] Démarrage Vite sur http://localhost:5173');
const vite = spawn('npm', ['run', 'dev:web'], {
  cwd: path.join(root, 'apps', 'desktop'),
  stdio: 'inherit',
  shell: true,
});

vite.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => vite.kill('SIGTERM'));
process.on('SIGTERM', () => vite.kill('SIGTERM'));
