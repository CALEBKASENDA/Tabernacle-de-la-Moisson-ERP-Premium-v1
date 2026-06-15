/**
 * CI smoke — démarre l'API sur un dossier temporaire, exécute smoke-finance, arrête.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tabernacle-ci-'));
const port = 13847;

process.env.TABERNACLE_DATA_DIR = tmp;
process.env.TABERNACLE_CHURCH_ID = 'church_ci';
process.env.TABERNACLE_CHURCH_NAME = 'CI Test';
process.env.TABERNACLE_BOOTSTRAP_EMAIL = 'ci@test.local';
process.env.TABERNACLE_BOOTSTRAP_PASSWORD = 'CiTest-2026!';
process.env.TABERNACLE_JWT_SECRET = 'ci-jwt-secret';
process.env.PORT = String(port);
process.env.HOST = '127.0.0.1';

const server = spawn('node', ['dist/server.js'], {
  cwd: path.join(root, 'apps/api'),
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe'],
});

function waitHealth(maxMs = 30000) {
  const base = `http://127.0.0.1:${port}/health`;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(base);
        if (res.ok) return resolve();
      } catch {
        /* retry */
      }
      if (Date.now() - start > maxMs) return reject(new Error('API non démarrée à temps'));
      setTimeout(tick, 400);
    };
    tick();
  });
}

let stderr = '';
server.stderr?.on('data', (c) => { stderr += c.toString(); });

try {
  await waitHealth();
  const smoke = spawn('node', ['scripts/smoke-finance.mjs', String(port)], {
    cwd: path.join(root, 'apps/api'),
    stdio: 'inherit',
    env: { ...process.env },
  });
  const code = await new Promise((resolve) => smoke.on('close', resolve));
  if (code !== 0) {
    throw new Error(`smoke-finance exit ${code}`);
  }

  const loginRes = await fetch(`http://127.0.0.1:${port}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ci@test.local', password: 'CiTest-2026!' }),
  });
  const loginJson = await loginRes.json();
  if (!loginJson.data?.accessToken) throw new Error('JWT accessToken manquant');
  const meRes = await fetch(`http://127.0.0.1:${port}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${loginJson.data.accessToken}` },
  });
  if (!meRes.ok) throw new Error('JWT Bearer /auth/me échoué');

  console.log('OK ci-smoke (finance + JWT)');
} catch (err) {
  console.error(stderr);
  throw err;
} finally {
  server.kill('SIGTERM');
}
