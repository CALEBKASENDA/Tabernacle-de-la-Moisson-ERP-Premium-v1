import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(label, script) {
  const child = spawn('npm', ['run', script], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[${label}] arrêté (code ${code})`);
  });
  return child;
}

console.log('Tabernacle de la Moisson ERP — dev');
console.log('  Interface : http://localhost:5173');
console.log('  API       : http://127.0.0.1:3847/api/v1');
console.log('');

const api = run('api', 'api:dev');
const desktop = run('desktop', 'desktop:dev');

function shutdown() {
  api.kill('SIGTERM');
  desktop.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
