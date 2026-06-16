/**
 * Prépare le build Tauri : compile tout + copie Node et l'app dans src-tauri/resources.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourcesEmbedded = path.join(
  root,
  'apps/desktop/src-tauri/resources/app/apps/api/dist/embedded.js'
);
const skipPrep = process.env.TAURI_SKIP_RESOURCE_PREP === '1';

console.log('[Tauri] build:all...');
execSync('npm run build:all', { cwd: root, stdio: 'inherit', shell: true });

const isWin = process.platform === 'win32';
if (isWin) {
  if (skipPrep && fs.existsSync(resourcesEmbedded)) {
    console.log('[Tauri] Ressources deja pretes — copie staging ignoree.');
  } else {
    console.log('[Tauri] Preparation des ressources Windows...');
    execSync(
      'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-tauri-resources.ps1',
      { cwd: root, stdio: 'inherit' }
    );
  }
} else {
  console.warn('[Tauri] Build natif complet : preparez manuellement src-tauri/resources (voir README).');
}
