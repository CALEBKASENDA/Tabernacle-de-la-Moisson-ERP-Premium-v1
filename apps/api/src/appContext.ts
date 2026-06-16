import path from 'node:path';
import fs from 'node:fs';
import { FinanceModule, SecurityModule, PastoralModule, type TenantContext, type AppDatabase } from '@tabernacle/erp-premium-db';
import { openAppDatabase } from './database';
import { extractBearerToken, verifyAccessToken } from './jwt';
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
  db: AppDatabase;
  finance: FinanceModule;
  security: SecurityModule;
  pastoral: PastoralModule;
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
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    console.log('[Tabernacle] Cloud central — PostgreSQL');
  } else {
    console.log(`[Tabernacle] Local-first — base SQLite : ${dbPath}`);
  }

  const db = openAppDatabase(dataDir);

  const defaultChurchId = process.env.TABERNACLE_CHURCH_ID ?? 'church_default';
  const churchName = process.env.TABERNACLE_CHURCH_NAME ?? 'Tabernacle de la Moisson';
  const finance = FinanceModule.bootstrap(db, defaultChurchId, churchName, dataDir);
  const security = SecurityModule.bootstrap(db, defaultChurchId);
  const pastoral = PastoralModule.bootstrap(db);

  ctx = { db, finance, security, pastoral, defaultChurchId };
  return ctx;
}

function headerValue(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = headers[key] ?? headers[key.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

export function resolveSession(headers: Record<string, string | string[] | undefined>): AuthenticatedSession | null {
  const app = getAppContext();

  const bearer = extractBearerToken(headers);
  if (bearer) {
    const claims = verifyAccessToken(bearer);
    if (claims) {
      const session = app.security.validateSession(claims.sessionId);
      if (session) return session;
    }
  }

  const sessionId = headerValue(headers, 'x-session-id');
  if (!sessionId) return null;
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
