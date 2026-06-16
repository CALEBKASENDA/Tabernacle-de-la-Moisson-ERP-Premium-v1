import { parentPort, type MessagePort } from 'node:worker_threads';
import { Pool, type PoolClient } from 'pg';

if (!parentPort) {
  throw new Error('pgWorker must run inside a worker thread');
}

type WorkerRequest =
  | { id: number; op: 'connect'; connectionString: string }
  | { id: number; op: 'query'; sql: string; values?: unknown[] }
  | { id: number; op: 'exec'; sql: string }
  | { id: number; op: 'begin' }
  | { id: number; op: 'commit' }
  | { id: number; op: 'rollback' }
  | { id: number; op: 'close' };

let pool: Pool | null = null;
let txClient: PoolClient | null = null;

function client(): Pool {
  if (!pool) throw new Error('PostgreSQL worker not connected');
  return pool;
}

async function handleRequest(msg: WorkerRequest, port: MessagePort): Promise<void> {
  try {
    switch (msg.op) {
      case 'connect': {
        pool = new Pool({ connectionString: msg.connectionString, max: 10 });
        await pool.query('SELECT 1');
        port.postMessage({ id: msg.id, ok: true });
        return;
      }
      case 'begin': {
        txClient = await client().connect();
        await txClient.query('BEGIN');
        port.postMessage({ id: msg.id, ok: true });
        return;
      }
      case 'commit': {
        if (!txClient) throw new Error('No active transaction');
        await txClient.query('COMMIT');
        txClient.release();
        txClient = null;
        port.postMessage({ id: msg.id, ok: true });
        return;
      }
      case 'rollback': {
        if (!txClient) throw new Error('No active transaction');
        await txClient.query('ROLLBACK');
        txClient.release();
        txClient = null;
        port.postMessage({ id: msg.id, ok: true });
        return;
      }
      case 'exec': {
        const runner = txClient ?? client();
        await runner.query(msg.sql);
        port.postMessage({ id: msg.id, ok: true });
        return;
      }
      case 'query': {
        const runner = txClient ?? client();
        const res = await runner.query(msg.sql, msg.values ?? []);
        port.postMessage({
          id: msg.id,
          ok: true,
          rows: res.rows,
          rowCount: res.rowCount ?? 0,
        });
        return;
      }
      case 'close': {
        if (txClient) {
          try {
            await txClient.query('ROLLBACK');
          } catch {
            /* ignore */
          }
          txClient.release();
          txClient = null;
        }
        if (pool) {
          await pool.end();
          pool = null;
        }
        port.postMessage({ id: msg.id, ok: true });
        return;
      }
      default:
        throw new Error('Unknown worker op');
    }
  } catch (error) {
    port.postMessage({
      id: msg.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

parentPort.once('message', (initial: { port: MessagePort }) => {
  const port = initial.port;
  port.on('message', (msg: WorkerRequest) => {
    void handleRequest(msg, port);
  });
});
