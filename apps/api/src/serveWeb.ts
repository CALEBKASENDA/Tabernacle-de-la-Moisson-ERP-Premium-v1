import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

export async function registerWebApp(app: FastifyInstance): Promise<boolean> {
  const webDist = process.env.WEB_DIST_DIR;
  if (!webDist) return false;

  const indexHtml = path.join(webDist, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    app.log.warn({ webDist }, 'WEB_DIST_DIR défini mais index.html introuvable — interface web non servie');
    return false;
  }

  const root = path.resolve(webDist);

  app.get('/*', async (req, reply) => {
    const urlPath = req.url.split('?')[0] ?? '/';
    if (urlPath.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Route API introuvable' });
    }

    const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
    const candidate = path.resolve(root, relative);
    if (!candidate.startsWith(root)) {
      return reply.status(403).send({ error: 'Accès refusé' });
    }

    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const ext = path.extname(candidate);
      return reply.type(MIME[ext] ?? 'application/octet-stream').send(fs.createReadStream(candidate));
    }

    return reply.type('text/html; charset=utf-8').send(fs.createReadStream(indexHtml));
  });

  app.log.info({ webDist }, 'Interface web servie depuis WEB_DIST_DIR');
  return true;
}

/** En dev sans build statique : redirige vers Vite (5173) au lieu d'un 404 JSON. */
export function registerDevLanding(app: FastifyInstance, apiPort: number): void {
  const uiBase = process.env.DEV_UI_URL ?? 'http://localhost:5173';

  app.get('/', async (_req, reply) => {
    return reply.redirect(`${uiBase}/`, 302);
  });

  app.get('/*', async (req, reply) => {
    const urlPath = req.url.split('?')[0] ?? '/';
    if (urlPath.startsWith('/api/') || urlPath === '/health') {
      return reply.callNotFound();
    }
    const query = req.url.includes('?') ? `?${req.url.split('?').slice(1).join('?')}` : '';
    return reply.redirect(`${uiBase}${urlPath}${query}`, 302);
  });

  app.log.info({ uiBase, apiPort }, 'Mode dev — interface sur Vite, API sur ce port');
}
