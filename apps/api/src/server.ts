import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from './loadEnv';
import cors from '@fastify/cors';
import { initAppContext } from './appContext';
import { startAutoBackupScheduler } from './autoBackup';
import { financeRoutes } from './routes/finance';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { systemRoutes } from './routes/system';
import { syncRoutes } from './routes/sync';
import { pastoralRoutes } from './routes/pastoral';
import { oauthRoutes } from './routes/oauth';
import { registerWebApp, registerDevLanding } from './serveWeb';
import { installBigIntJsonSupport, sanitizeForJson } from './jsonSafe';
import { SPLASH_HTML, getHealthPayload, isAppReady, setAppReady, setBootError } from './bootSplash';

const PORT = Number(process.env.PORT ?? 3847);
const HOST = process.env.HOST ?? (process.env.WEB_DIST_DIR ? '0.0.0.0' : '127.0.0.1');

async function registerApiAndWeb(app: FastifyInstance): Promise<void> {
  app.addHook('preSerialization', async (_request, _reply, payload) => sanitizeForJson(payload));

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-church-id',
      'x-user-id',
      'x-session-id',
      'x-workstation-id',
      'x-site-id',
    ],
  });

  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(systemRoutes, { prefix: '/api/v1' });
  await app.register(syncRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1' });
  await app.register(financeRoutes, { prefix: '/api/v1' });
  await app.register(oauthRoutes, { prefix: '/api/v1' });
  await app.register(pastoralRoutes, { prefix: '/api/v1' });

  const webServed = await registerWebApp(app);
  if (!webServed) {
    registerDevLanding(app, PORT);
  }

  app.setErrorHandler((err, _req, reply) => {
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur';
    const code =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? Number((err as { statusCode?: number }).statusCode)
        : undefined;

    let status = 500;
    if (code === 401 || message.includes('Authentification requise') || message.includes('invalides')) {
      status = 401;
    } else if (code === 403 || message.includes('Permission refusée') || message.includes('interdit')) {
      status = 403;
    } else if (code === 429) {
      status = 429;
    } else if (
      message.includes('introuvable') ||
      message.includes('invalide') ||
      message.includes('requis') ||
      message.includes('manquant') ||
      message.includes('clôturée') ||
      message.includes('interdit') ||
      message.includes('Invalid money') ||
      message.includes('Rubrique') ||
      message.includes('Libellé') ||
      message.includes('taux USD')
    ) {
      status = 400;
    }

    if (status >= 500) {
      app.log.error({ err }, message);
    }

    reply.status(status).send({ error: message });
  });
}

async function main(): Promise<void> {
  installBigIntJsonSupport();
  loadEnv();
  const isInstalled = Boolean(process.env.TABERNACLE_INSTALL_ROOT);

  const app = Fastify({
    logger: isInstalled ? false : true,
    trustProxy: true,
    connectionTimeout: 10_000,
    keepAliveTimeout: 5_000,
  });

  app.addHook('onRequest', async (req, reply) => {
    if (isAppReady()) return;
    const urlPath = req.url.split('?')[0] ?? '/';
    if (urlPath === '/health') return;
    if (urlPath.startsWith('/api/')) {
      reply.status(503).send({ error: 'Démarrage en cours…', retry: true, mode: 'hybrid-local-first' });
      return;
    }
    reply.type('text/html; charset=utf-8').send(SPLASH_HTML);
  });

  app.get('/health', async () => getHealthPayload());

  await app.listen({ port: PORT, host: HOST });

  try {
    initAppContext();
    await registerApiAndWeb(app);
    setAppReady();
    if (isInstalled) {
      setImmediate(() => startAutoBackupScheduler());
    } else {
      startAutoBackupScheduler();
    }
    console.log(`Tabernacle Finance API: http://${HOST}:${PORT}/api/v1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setBootError(message);
    console.error(err);
    if (isInstalled) {
      console.error('[Tabernacle] Echec initialisation — consultez config/logs/tabernacle-error.log');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
