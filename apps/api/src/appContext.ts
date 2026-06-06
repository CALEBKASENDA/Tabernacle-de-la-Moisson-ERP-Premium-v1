import path from 'node:path';
import fs from 'node:fs';
import { FinanceModule, SecurityModule, type TenantContext } from '@tabernacle/erp-premium-db';
import { openAppDatabase } from './database';
export type AuthenticatedSession = {
  sessionId: string;
  userId: string;
  churchId: string;
  workstationId: string;
  fullName: string;
  email: string;
  roles: string[];
  permissions: string[];
};

export type AppContext = {
  db: import('@tabernacle/erp-premium-db').SqliteDatabase;
  finance: FinanceModule;
  security: SecurityModule;
  defaultChurchId: string;
};

let ctx: AppContext | null = null;

export function getAppContext(): AppContext {
  if (!ctx) throw new Error('Application not initialized');
  return ctx;
}

export function initAppContext(): AppContext {
  const dataDir = process.env.TABERNACLE_DATA_DIR ?? path.join(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'tabernacle-finance.sqlite');
  console.log(`[Tabernacle] Local-first — base SQLite : ${dbPath}`);

  const db = openAppDatabase(dataDir);

  const defaultChurchId = process.env.TABERNACLE_CHURCH_ID ?? 'church_default';
  const churchName = process.env.TABERNACLE_CHURCH_NAME ?? 'Tabernacle de la Moisson';
  const finance = FinanceModule.bootstrap(db, defaultChurchId, churchName, dataDir);
  const security = SecurityModule.bootstrap(db, defaultChurchId);

  ctx = { db, finance, security, defaultChurchId };
  return ctx;
}

function headerValue(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = headers[key] ?? headers[key.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

export function resolveSession(headers: Record<string, string | string[] | undefined>): AuthenticatedSession | null {
  const sessionId = headerValue(headers, 'x-session-id');
  if (!sessionId) return null;
  const app = getAppContext();
  return app.security.validateSession(sessionId);
}

export function resolveTenantContext(
  headers: Record<string, string | string[] | undefined>,
  session?: AuthenticatedSession | null
): TenantContext {
  const app = getAppContext();
  if (session) {
    return {
      churchId: session.churchId,
      userId: session.userId,
      sessionId: session.sessionId,
      workstationId: session.workstationId,
      siteId: headerValue(headers, 'x-site-id') ?? null,
    };
  }

  return {
    churchId: headerValue(headers, 'x-church-id') ?? app.defaultChurchId,
    userId: headerValue(headers, 'x-user-id') ?? 'user_system',
    sessionId: headerValue(headers, 'x-session-id') ?? 'session_anonymous',
    workstationId: headerValue(headers, 'x-workstation-id') ?? 'workstation_local',
    siteId: headerValue(headers, 'x-site-id') ?? null,
  };
}
