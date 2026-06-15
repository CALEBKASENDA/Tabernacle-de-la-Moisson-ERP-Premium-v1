import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { getAppContext } from '../appContext';
import {
  probeRemoteHealth,
  readCloudConfig,
  resolveDeploymentInfo,
  writeCloudConfig,
} from '../cloudConfig';
import {
  exportPortablePackage,
  schedulePortableImport,
  validatePortablePackage,
  PORTABLE_FOLDER_NAME,
} from '../portableData';
import { pushPendingSyncEvents } from '../syncService';
import { browseWindowsFolder, listWindowsDrives } from '../windowsFolder';
import { appendPortableExportLog, readPortableExportHistory } from '../portableExportLog';
import { generateSystemNotifications, markNotificationRead, sha256File } from '../notifications';
import { requireAuth, requireSuperAdmin, type RequestWithAuth } from '../middleware/auth';
import { APP_VERSION } from '@tabernacle/erp-premium-domain';

function getDataDir(): string {
  return process.env.TABERNACLE_DATA_DIR ?? path.join(process.cwd(), 'data');
}

function getConfigDir(): string {
  if (process.env.TABERNACLE_ENV_FILE) {
    return path.dirname(process.env.TABERNACLE_ENV_FILE);
  }
  if (process.env.TABERNACLE_INSTALL_ROOT) {
    return path.join(process.env.TABERNACLE_INSTALL_ROOT, 'config');
  }
  return getDataDir();
}

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/system/info/public', async () => ({
    data: { version: APP_VERSION, status: 'ok' },
  }));

  app.get('/system/info', { preHandler: requireAuth }, async (req) => {
    const auth = (req as RequestWithAuth).auth;
    const { defaultChurchId } = getAppContext();
    const dataDir = getDataDir();
    const deployment = resolveDeploymentInfo();
    const cloud = readCloudConfig(dataDir);
    const accessUrl =
      deployment.publicUrl ||
      (cloud.remoteUrl ? cloud.remoteUrl : null) ||
      (deployment.deploymentMode === 'local-desktop'
        ? `http://127.0.0.1:${Number(process.env.PORT ?? 3847)}`
        : null);

    return {
      data: {
        mode: deployment.deploymentMode === 'cloud-server' ? 'cloud-server' : 'local-first',
        churchId: auth.churchId ?? defaultChurchId,
        version: APP_VERSION,
        deployment: {
          deploymentMode: deployment.deploymentMode,
          servesWebUi: deployment.servesWebUi,
          networkAccessible: deployment.networkAccessible,
          httpsEnabled: deployment.httpsEnabled,
        },
        accessUrl,
      },
    };
  });

  app.get('/system/local', { preHandler: [requireAuth, requireSuperAdmin()] }, async () => {
    const dataDir = getDataDir();
    const dbPath = path.join(dataDir, 'tabernacle-finance.sqlite');
    const dbExists = fs.existsSync(dbPath);
    let dbSize = 0;
    if (dbExists) {
      try {
        dbSize = fs.statSync(dbPath).size;
      } catch {
        dbSize = 0;
      }
    }

    let userCount = 0;
    let pendingSyncEvents = 0;
    try {
      const { db, finance } = getAppContext();
      const row = db.get<{ n: number }>(`SELECT COUNT(*) as n FROM app_user WHERE is_active=1`);
      userCount = row?.n ?? 0;
      pendingSyncEvents = finance.audit.countPendingSync();
    } catch {
      userCount = 0;
      pendingSyncEvents = 0;
    }

    const deployment = resolveDeploymentInfo();
    const isCloud = deployment.deploymentMode === 'cloud-server';

    return {
      data: {
        mode: isCloud ? 'cloud-server' : 'local-first',
        description: isCloud
          ? 'Serveur cloud/VPS actif — données SQLite sur ce serveur, accès mondial via navigateur.'
          : 'Données stockées dans le dossier d\'installation (data\\). Export portable vers clé USB disponible.',
        dataDir,
        installRoot: process.env.TABERNACLE_INSTALL_ROOT ?? null,
        configDir: getConfigDir(),
        portableFolderName: PORTABLE_FOLDER_NAME,
        databaseFile: dbPath,
        databaseExists: dbExists,
        databaseBytes: dbSize,
        activeUsers: userCount,
        pendingSyncEvents,
        autoBackupEnabled: process.env.TABERNACLE_DISABLE_AUTO_BACKUP !== '1',
        host: process.env.HOST ?? '127.0.0.1',
        port: Number(process.env.PORT ?? 3847),
        deployment,
      },
    };
  });

  app.get('/system/cloud', { preHandler: [requireAuth, requireSuperAdmin()] }, async () => {
    const dataDir = getDataDir();
    const { finance } = getAppContext();
    const deployment = resolveDeploymentInfo();
    const config = readCloudConfig(dataDir);
    const backupDir = path.join(dataDir, 'backups');
    let backupCount = 0;
    let latestBackup: string | null = null;
    if (fs.existsSync(backupDir)) {
      const files = fs
        .readdirSync(backupDir)
        .filter((f) => f.endsWith('.sqlite'))
        .sort()
        .reverse();
      backupCount = files.length;
      latestBackup = files[0] ?? null;
    }

    return {
      data: {
        config,
        deployment,
        backups: {
          directory: backupDir,
          count: backupCount,
          latestFile: latestBackup,
        },
        pendingSyncEvents: finance.audit.countPendingSync(),
        syncConflicts: finance.countSyncConflicts(),
        autoBackupEnabled: process.env.TABERNACLE_DISABLE_AUTO_BACKUP !== '1',
      },
    };
  });

  app.put('/system/cloud', {
    preHandler: [requireAuth, requireSuperAdmin()],
  }, async (req, reply) => {
    const body = req.body as {
      remoteUrl?: string;
      publicLabel?: string;
      notes?: string;
    };
    const remoteUrl = body.remoteUrl?.trim() ?? '';
    if (remoteUrl && !/^https?:\/\//i.test(remoteUrl)) {
      return reply.status(400).send({
        error: 'URL distante invalide — utilisez http:// ou https://',
      });
    }
    const dataDir = getDataDir();
    const config = writeCloudConfig(dataDir, {
      remoteUrl,
      publicLabel: body.publicLabel?.trim() || undefined,
      notes: body.notes?.trim() || undefined,
    });
    return { data: config };
  });

  app.post('/system/cloud/test-remote', { preHandler: [requireAuth, requireSuperAdmin()] }, async (req, reply) => {
    const body = (req.body ?? {}) as { url?: string };
    const dataDir = getDataDir();
    const deployment = resolveDeploymentInfo();
    const config = readCloudConfig(dataDir);
    const target =
      body.url?.trim() ||
      config.remoteUrl ||
      deployment.publicUrl ||
      '';
    if (!target) {
      return reply.status(400).send({
        error: 'Aucune URL distante configurée',
      });
    }
    const result = await probeRemoteHealth(target);
    const auth = (req as RequestWithAuth).auth;
    if (auth?.roles.includes('SUPER_ADMIN')) {
      writeCloudConfig(dataDir, {
        lastRemoteCheckAt: new Date().toISOString(),
        lastRemoteCheckOk: result.ok,
      });
    }
    return {
      data: {
        url: target,
        ...result,
      },
    };
  });

  app.post('/system/backup', {
    preHandler: [requireAuth, requireSuperAdmin()],
  }, async (_req, reply) => {
    const dataDir = getDataDir();
    const dbPath = path.join(dataDir, 'tabernacle-finance.sqlite');
    if (!fs.existsSync(dbPath)) {
      return reply.status(404).send({ error: 'Base de données introuvable' });
    }
    const backupDir = path.join(dataDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `tabernacle-finance-${stamp}.sqlite`;
    const dest = path.join(backupDir, fileName);
    fs.copyFileSync(dbPath, dest);
    const bytes = fs.statSync(dest).size;
    const sha256 = sha256File(dest);
    return {
      data: {
        fileName,
        path: dest,
        bytes,
        sha256,
        createdAt: new Date().toISOString(),
      },
    };
  });

  app.post('/system/portable/export', {
    preHandler: [requireAuth, requireSuperAdmin()],
  }, async (req, reply) => {
    const body = req.body as { targetPath?: string };
    const targetPath = body.targetPath?.trim();
    if (!targetPath) {
      return reply.status(400).send({ error: 'Chemin de destination requis (ex. E:\\ ou E:\\MaCleUSB)' });
    }
    if (!/^[a-zA-Z]:\\/.test(targetPath) && !targetPath.startsWith('\\\\')) {
      return reply.status(400).send({ error: 'Indiquez un chemin Windows complet (ex. E:\\TabernacleERP)' });
    }

    const dataDir = getDataDir();
    const envFile = process.env.TABERNACLE_ENV_FILE ?? path.join(getConfigDir(), '.env');
    const { defaultChurchId, security } = getAppContext();
    const church = security.churches.getById(defaultChurchId);

    const result = exportPortablePackage({
      dataDir,
      configEnvPath: fs.existsSync(envFile) ? envFile : null,
      targetDir: targetPath,
      churchName: church?.name,
    });

    if (!result.ok) {
      return reply.status(400).send({ error: result.error ?? 'Export impossible' });
    }

    const auth = (req as RequestWithAuth).auth;
    appendPortableExportLog(dataDir, {
      direction: 'export',
      packagePath: result.packagePath,
      bytes: result.bytes,
      userId: auth?.userId,
    });

    return {
      data: {
        packagePath: result.packagePath,
        bytes: result.bytes,
        folderName: PORTABLE_FOLDER_NAME,
      },
    };
  });

  app.post('/system/portable/validate', {
    preHandler: [requireAuth, requireSuperAdmin()],
  }, async (req, reply) => {
    const body = req.body as { sourcePath?: string };
    const sourcePath = body.sourcePath?.trim();
    if (!sourcePath) {
      return reply.status(400).send({ error: 'Chemin source requis' });
    }
    const validation = validatePortablePackage(sourcePath);
    return { data: validation };
  });

  app.post('/system/portable/import', {
    preHandler: [requireAuth, requireSuperAdmin()],
  }, async (req, reply) => {
    const body = req.body as { sourcePath?: string };
    const sourcePath = body.sourcePath?.trim();
    if (!sourcePath) {
      return reply.status(400).send({ error: 'Chemin du paquet portable requis' });
    }

    const dataDir = getDataDir();
    const scheduled = schedulePortableImport(dataDir, sourcePath);
    if (!scheduled.ok) {
      return reply.status(400).send({ error: scheduled.error ?? 'Import impossible' });
    }

    const auth = (req as RequestWithAuth).auth;
    appendPortableExportLog(dataDir, {
      direction: 'import',
      packagePath: sourcePath,
      userId: auth?.userId,
    });

    return {
      data: {
        scheduled: true,
        requiresRestart: true,
        message:
          'Import planifié. Arrêtez l\'application (Menu Démarrer → Arrêter), puis relancez-la pour appliquer les données de la clé USB.',
      },
    };
  });

  app.get('/system/drives', { preHandler: [requireAuth, requireSuperAdmin()] }, async () => ({
    data: listWindowsDrives(),
  }));

  app.post('/system/browse-folder', { preHandler: [requireAuth, requireSuperAdmin()] }, async (req) => {
    const body = (req.body ?? {}) as { initialPath?: string };
    const selected = browseWindowsFolder(body.initialPath);
    return { data: { path: selected } };
  });

  app.post('/system/sync/push', { preHandler: [requireAuth, requireSuperAdmin()] }, async (req) => {
    const auth = (req as RequestWithAuth).auth;
    const dataDir = getDataDir();
    const result = await pushPendingSyncEvents(dataDir, auth?.churchId);
    return { data: result };
  });

  app.get('/system/sync/conflicts', { preHandler: [requireAuth, requireSuperAdmin()] }, async (req) => {
    const { finance } = getAppContext();
    const auth = (req as RequestWithAuth).auth;
    const limit = Number((req.query as { limit?: string }).limit ?? 50);
    return { data: finance.listSyncConflicts(auth.churchId, limit) };
  });

  app.post('/system/sync/conflicts/:id/retry', { preHandler: [requireAuth, requireSuperAdmin()] }, async (req) => {
    const { finance } = getAppContext();
    const { id } = req.params as { id: string };
    const result = await finance.retrySyncConflict(id);
    if (!result.ok) {
      return { data: result };
    }
    return { data: result };
  });

  app.post('/system/sync/conflicts/:id/dismiss', { preHandler: [requireAuth, requireSuperAdmin()] }, async (req) => {
    const { finance } = getAppContext();
    const { id } = req.params as { id: string };
    const ok = finance.dismissSyncConflict(id);
    if (!ok) throw new Error('Conflit introuvable');
    return { ok: true };
  });

  app.get('/system/notifications', { preHandler: requireAuth }, async (req) => {
    const auth = (req as RequestWithAuth).auth;
    const dataDir = getDataDir();
    const items = generateSystemNotifications(dataDir, auth.churchId);
    return { data: items };
  });

  app.post('/system/notifications/:id/read', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const auth = (req as RequestWithAuth).auth;
    markNotificationRead(getDataDir(), auth.churchId, id);
    return { ok: true };
  });

  app.get('/system/portable/history', { preHandler: [requireAuth, requireSuperAdmin()] }, async () => ({
    data: readPortableExportHistory(getDataDir()),
  }));

  app.get('/system/version', async () => ({
    data: {
      current: APP_VERSION,
      updateUrl: process.env.TABERNACLE_UPDATE_URL ?? null,
      sqlCipherEnabled: !!process.env.TABERNACLE_DB_KEY?.trim(),
    },
  }));
}
