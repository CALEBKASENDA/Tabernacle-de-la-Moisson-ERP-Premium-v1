/**
 * Mode embarqué — aucun port TCP, communication JSON ligne par ligne sur stdin/stdout.
 * Utilisé par le shell Tauri desktop (IPC processus, pas localhost).
 */
import readline from 'node:readline';
import type { InjectOptions } from 'fastify';
import { buildApp, initializeAppData, injectRequest } from './appFactory';

type EmbeddedRequest = {
  id: number | string;
  method?: string;
  path?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string | null;
  payload?: string | null;
};

type EmbeddedResponse = {
  id: number | string;
  ok: boolean;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
  error?: string;
  ready?: boolean;
};

function writeLine(obj: EmbeddedResponse): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function toInjectOptions(req: EmbeddedRequest): InjectOptions {
  const url = req.url ?? req.path ?? '/';
  const method = (req.method ?? 'GET').toUpperCase() as InjectOptions['method'];
  const headers = { ...(req.headers ?? {}) };
  const rawBody = req.body ?? req.payload ?? undefined;

  const options: InjectOptions = { method, url, headers };
  if (rawBody != null && rawBody !== '' && method !== 'GET' && method !== 'HEAD') {
    options.payload = rawBody;
  }
  return options;
}

async function main(): Promise<void> {
  process.env.TABERNACLE_EMBEDDED = '1';

  const { app } = await buildApp();
  await initializeAppData(app);

  writeLine({ id: 'ready', ok: true, ready: true });

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on('line', (line) => {
    void (async () => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let req: EmbeddedRequest;
      try {
        req = JSON.parse(trimmed) as EmbeddedRequest;
      } catch {
        writeLine({ id: -1, ok: false, error: 'JSON invalide' });
        return;
      }

      if (req.id === 'ping') {
        writeLine({ id: 'ping', ok: true, ready: true });
        return;
      }

      try {
        const result = await injectRequest(app, toInjectOptions(req));
        writeLine({
          id: req.id,
          ok: true,
          statusCode: result.statusCode,
          headers: result.headers,
          body: result.body,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeLine({ id: req.id, ok: false, error: message });
      }
    })();
  });

  rl.on('close', () => {
    void app.close().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
