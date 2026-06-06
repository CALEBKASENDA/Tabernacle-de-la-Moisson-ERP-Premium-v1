import { loadEnv } from './loadEnv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initAppContext } from './appContext';
import { startAutoBackupScheduler } from './autoBackup';
import { financeRoutes } from './routes/finance';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { systemRoutes } from './routes/system';
import { syncRoutes } from './routes/sync';
import { registerWebApp, registerDevLanding } from './serveWeb';
import { installBigIntJsonSupport, sanitizeForJson } from './jsonSafe';

const PORT = Number(process.env.PORT ?? 3847);
const HOST = process.env.HOST ?? (process.env.WEB_DIST_DIR ? '0.0.0.0' : '127.0.0.1');

async function main(): Promise<void> {
  installBigIntJsonSupport();
  loadEnv();
  initAppContext();
  startAutoBackupScheduler();

  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  app.addHook('preSerialization', async (_request, _reply, payload) => sanitizeForJson(payload));

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'x-church-id',
      'x-user-id',
      'x-session-id',
      'x-workstation-id',
      'x-site-id',
    ],
  });

  app.get('/health', async () => ({ status: 'ok', service: 'tabernacle-finance-api' }));

  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(systemRoutes, { prefix: '/api/v1' });
  await app.register(syncRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1' });
  await app.register(financeRoutes, { prefix: '/api/v1' });

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

  await app.listen({ port: PORT, host: HOST });
  console.log(`Tabernacle Finance API: http://${HOST}:${PORT}/api/v1`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
