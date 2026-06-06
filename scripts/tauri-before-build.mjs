/**
 * Prépare le build Tauri : compile tout + copie Node et l'app dans src-tauri/resources.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('[Tauri] build:all...');
execSync('npm run build:all', { cwd: root, stdio: 'inherit', shell: true });

const isWin = process.platform === 'win32';
if (isWin) {
  console.log('[Tauri] Préparation des ressources Windows...');
  execSync(
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-tauri-resources.ps1',
    { cwd: root, stdio: 'inherit' }
  );
} else {
  console.warn('[Tauri] Build natif complet : préparez manuellement src-tauri/resources (voir README).');
}
