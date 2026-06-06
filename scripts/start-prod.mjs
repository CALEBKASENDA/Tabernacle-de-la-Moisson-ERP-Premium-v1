import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.WEB_DIST_DIR = path.join(root, 'apps', 'desktop', 'dist');
process.env.HOST = process.env.HOST ?? '0.0.0.0';
process.env.PORT = process.env.PORT ?? '3847';
process.env.TABERNACLE_DATA_DIR = process.env.TABERNACLE_DATA_DIR ?? path.join(root, 'data');

const child = spawn('npm', ['run', 'start', '-w', '@tabernacle/erp-premium-api'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
