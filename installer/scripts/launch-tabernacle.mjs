/**
 * Lanceur rapide sans console — démarre le serveur local et ouvre une
 * fenetre desktop (Edge app mode) sans barre d'adresse.
 */
import { spawn, execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const installRoot = path.resolve(__dirname, '..');
const nodeExe = path.join(installRoot, 'node', 'node.exe');
const serverJs = path.join(installRoot, 'app', 'apps', 'api', 'dist', 'server.js');
const webDist = path.join(installRoot, 'app', 'apps', 'desktop', 'dist');
const configDir = path.join(installRoot, 'config');
const dataDir = path.join(installRoot, 'data');
const logsDir = path.join(configDir, 'logs');
const envFile = path.join(configDir, '.env');
const envTemplate = path.join(configDir, 'env.template');
const pidFile = path.join(configDir, 'tabernacle.pid');
const logOut = path.join(logsDir, 'tabernacle.log');
const logErr = path.join(logsDir, 'tabernacle-error.log');
const apiCwd = path.join(installRoot, 'app', 'apps', 'api');
const PORT = 3847;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isPidAlive(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(400, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: PORT, path: '/health', timeout: 2000 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve(data?.status === 'ok' || data?.status === 'starting');
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function openPath(target) {
  execFile('cmd.exe', ['/c', 'start', '', target], { windowsHide: true });
}

function openDesktopWindow(url) {
  const edgeCandidates = [
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);

  const edgeExe = edgeCandidates.find((p) => fs.existsSync(p));
  if (!edgeExe) return false;

  try {
    execFileSync(edgeExe, [`--app=${url}`, '--new-window', '--window-size=1366,860'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 2500,
    });
    return true;
  } catch {
    try {
      execFile(edgeExe, [`--app=${url}`, '--new-window', '--window-size=1366,860'], {
        windowsHide: true,
      });
      return true;
    } catch {
      return false;
    }
  }
}

function openApp() {
  const url = `http://127.0.0.1:${PORT}/`;
  if (openDesktopWindow(url)) return;
  openPath(url);
}

async function waitForServer(maxMs = 90_000) {
  let delay = 80;
  for (let elapsed = 0; elapsed < maxMs; elapsed += delay) {
    if ((await isPortOpen(PORT)) && (await checkHealth())) return true;
    await new Promise((r) => setTimeout(r, delay));
    if (delay < 500) delay += 20;
  }
  return false;
}

function clearPidFile() {
  try {
    fs.unlinkSync(pidFile);
  } catch {
    /* ignore */
  }
}

function readPidFile() {
  if (!fs.existsSync(pidFile)) return null;
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  return Number.isFinite(pid) ? pid : null;
}

function ensureEnvFile() {
  if (fs.existsSync(envFile)) return;
  ensureDir(configDir);
  if (fs.existsSync(envTemplate)) {
    fs.copyFileSync(envTemplate, envFile);
    return;
  }
  fs.writeFileSync(
    envFile,
    [
      'TABERNACLE_CHURCH_ID=church_default',
      'TABERNACLE_CHURCH_NAME=Tabernacle de la Moisson',
      'TABERNACLE_BOOTSTRAP_EMAIL=tresorkasenda5@gmail.com',
      'TABERNACLE_BOOTSTRAP_PASSWORD=1958MSensei1234!',
      'TABERNACLE_BOOTSTRAP_NAME=Mister Sensei5',
      '',
    ].join('\n'),
    'utf8',
  );
}

function copyTreeSync(source, destination, skip = new Set()) {
  ensureDir(destination);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const src = path.join(source, entry.name);
    const dest = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTreeSync(src, dest, skip);
    else fs.copyFileSync(src, dest);
  }
}

function migrateLegacyDataIfNeeded() {
  const newDb = path.join(dataDir, 'tabernacle-finance.sqlite');
  if (fs.existsSync(newDb)) return;

  const legacyRoot = path.join(process.env.LOCALAPPDATA || '', 'Tabernacle ERP');
  const legacyData = path.join(legacyRoot, 'data');
  const legacyDb = path.join(legacyData, 'tabernacle-finance.sqlite');
  if (!fs.existsSync(legacyDb)) return;

  ensureDir(dataDir);
  copyTreeSync(legacyData, dataDir, new Set(['backups']));
  const legacyEnv = path.join(legacyRoot, '.env');
  if (fs.existsSync(legacyEnv) && !fs.existsSync(envFile)) {
    ensureDir(configDir);
    fs.copyFileSync(legacyEnv, envFile);
  }
  ensureDir(logsDir);
  fs.appendFileSync(logOut, `[${new Date().toISOString()}] Migration AppData -> ${dataDir}\n`);
}

function startServer() {
  ensureDir(logsDir);
  const outFd = fs.openSync(logOut, 'a');
  const errFd = fs.openSync(logErr, 'a');

  const child = spawn(nodeExe, [serverJs], {
    cwd: apiCwd,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    windowsHide: true,
    env: {
      ...process.env,
      TABERNACLE_INSTALL_ROOT: installRoot,
      TABERNACLE_ENV_FILE: envFile,
      TABERNACLE_DATA_DIR: dataDir,
      WEB_DIST_DIR: webDist,
      HOST: '127.0.0.1',
      PORT: String(PORT),
      TABERNACLE_APP_VERSION: '1.5.6',
      NODE_ENV: 'production',
    },
  });

  child.unref();
  fs.writeFileSync(pidFile, String(child.pid), 'utf8');
  return child.pid;
}

function showError(message) {
  execFile(
    'mshta',
    [
      'javascript:alert("Tabernacle ERP\\n\\n' +
        message.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n') +
        '");close()',
    ],
    { windowsHide: true },
  );
}

async function serverResponding() {
  return (await isPortOpen(PORT)) && (await checkHealth());
}

async function main() {
  if (!fs.existsSync(nodeExe)) throw new Error(`Node introuvable : ${nodeExe}`);
  if (!fs.existsSync(serverJs)) throw new Error(`Serveur introuvable : ${serverJs}`);
  if (!fs.existsSync(webDist)) throw new Error(`Interface introuvable : ${webDist}`);

  ensureDir(configDir);
  ensureDir(dataDir);
  ensureEnvFile();
  migrateLegacyDataIfNeeded();

  const oldPid = readPidFile();
  if (oldPid && !isPidAlive(oldPid)) {
    clearPidFile();
  }

  if (await serverResponding()) {
    openApp();
    return;
  }

  if (oldPid && isPidAlive(oldPid)) {
    const ready = await waitForServer(15_000);
    if (ready) {
      openApp();
      return;
    }
    clearPidFile();
  }

  startServer();
  const ready = await waitForServer();
  if (!ready) {
    let detail = '';
    if (fs.existsSync(logErr)) {
      const tail = fs.readFileSync(logErr, 'utf8').slice(-1200);
      if (tail.trim()) detail = `\n\n${tail.trim()}`;
    }
    throw new Error(
      `Le serveur local n'a pas demarre (127.0.0.1:${PORT}).\n` +
        `Consultez les journaux :\n  ${logOut}\n  ${logErr}${detail}`,
    );
  }

  openApp();
}

main().catch((err) => {
  try {
    ensureDir(logsDir);
    fs.appendFileSync(logErr, `[${new Date().toISOString()}] Lanceur: ${err?.stack || err}\n`);
  } catch {
    /* ignore */
  }
  const msg = err instanceof Error ? err.message : String(err);
  showError(msg);
  process.exit(1);
});
