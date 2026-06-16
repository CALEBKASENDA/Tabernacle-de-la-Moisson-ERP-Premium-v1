import { Worker, MessageChannel, MessagePort } from 'node:worker_threads';
import path from 'node:path';
import type { AppDatabase, DbStatement, DbTransaction } from '../database/appDatabase';
import { namedParamsToPositional, normalizeSqliteInsert } from './sqlConvert';

export type PostgresDatabaseOptions = {
  readonly connectionString: string;
};

type WorkerResponse = {
  id: number;
  ok: boolean;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  error?: string;
};

function finalizeInsertSql(text: string, ignoreDuplicates: boolean): string {
  if (!ignoreDuplicates || /ON CONFLICT/i.test(text)) return text;
  return `${text} ON CONFLICT DO NOTHING`;
}

function toPgSql(sql: string, params?: Record<string, unknown>): { text: string; values: unknown[] } {
  const { text: stripped, ignoreDuplicates } = normalizeSqliteInsert(sql);
  const { text, values } = namedParamsToPositional(stripped, params ?? {});
  return { text: finalizeInsertSql(text, ignoreDuplicates), values };
}

type SyncMessagePort = MessagePort & { receiveMessage(): unknown };

class PgWorkerBridge {
  private readonly worker: Worker;
  private readonly port: SyncMessagePort;
  private nextId = 1;

  constructor(workerScript: string, connectionString: string) {
    const channel = new MessageChannel();
    this.port = channel.port1 as SyncMessagePort;
    this.worker = new Worker(workerScript);
    this.worker.postMessage({ port: channel.port2 }, [channel.port2]);
    this.call('connect', { connectionString } as ConnectPayload);
  }

  private call(op: 'connect', payload: ConnectPayload): WorkerResponse;
  private call(op: 'query', payload: QueryPayload): WorkerResponse;
  private call(op: 'exec', payload: ExecPayload): WorkerResponse;
  private call(op: 'begin' | 'commit' | 'rollback' | 'close'): WorkerResponse;
  private call(
    op: WorkerRequest['op'],
    payload: Record<string, unknown> = {},
  ): WorkerResponse {
    const id = this.nextId++;
    this.port.postMessage({ id, op, ...payload });
    const response = this.port.receiveMessage() as WorkerResponse;
    if (!response.ok) {
      throw new Error(response.error ?? `PostgreSQL worker error (${op})`);
    }
    return response;
  }

  query(sql: string, values?: unknown[]): WorkerResponse {
    return this.call('query', { sql, values });
  }

  exec(sql: string): void {
    this.call('exec', { sql });
  }

  begin(): void {
    this.call('begin');
  }

  commit(): void {
    this.call('commit');
  }

  rollback(): void {
    this.call('rollback');
  }

  close(): void {
    this.call('close');
    this.worker.terminate();
  }
}

type ConnectPayload = { connectionString: string };
type QueryPayload = { sql: string; values?: unknown[] };
type ExecPayload = { sql: string };

type WorkerRequest = {
  op: 'connect' | 'query' | 'exec' | 'begin' | 'commit' | 'rollback' | 'close';
};

class PgStatement implements DbStatement {
  constructor(
    private readonly bridge: PgWorkerBridge,
    private readonly sql: string,
  ) {}

  run(params?: Record<string, unknown>): void {
    const { text, values } = toPgSql(this.sql, params);
    this.bridge.query(text, values);
  }

  get<T = unknown>(params?: Record<string, unknown>): T | undefined {
    const { text, values } = toPgSql(this.sql, params);
    return this.bridge.query(text, values).rows?.[0] as T | undefined;
  }

  all<T = Record<string, unknown>>(params?: Record<string, unknown>): T[] {
    const { text, values } = toPgSql(this.sql, params);
    return (this.bridge.query(text, values).rows ?? []) as T[];
  }
}

class PgTransaction implements DbTransaction {
  constructor(private readonly bridge: PgWorkerBridge) {}

  prepare(sql: string): DbStatement {
    return new PgStatement(this.bridge, sql);
  }
}

function workerScriptPath(): string {
  return path.join(__dirname, 'pgWorker.js');
}

export class PostgresDatabase implements AppDatabase {
  readonly dialect = 'postgres' as const;
  private readonly bridge: PgWorkerBridge;

  constructor(options: PostgresDatabaseOptions) {
    this.bridge = new PgWorkerBridge(workerScriptPath(), options.connectionString);
  }

  run(sql: string, params?: Record<string, unknown>): void {
    const { text, values } = toPgSql(sql, params);
    this.bridge.query(text, values);
  }

  get<T = unknown>(sql: string, params?: Record<string, unknown>): T | undefined {
    const { text, values } = toPgSql(sql, params);
    return this.bridge.query(text, values).rows?.[0] as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, params?: Record<string, unknown>): T[] {
    const { text, values } = toPgSql(sql, params);
    return (this.bridge.query(text, values).rows ?? []) as T[];
  }

  exec(sql: string): void {
    this.bridge.exec(sql);
  }

  withTransaction<T>(fn: (tx: DbTransaction) => T): T {
    this.bridge.begin();
    try {
      const result = fn(new PgTransaction(this.bridge));
      this.bridge.commit();
      return result;
    } catch (error) {
      try {
        this.bridge.rollback();
      } catch {
        /* ignore rollback failure */
      }
      throw error;
    }
  }

  close(): void {
    this.bridge.close();
  }
}
