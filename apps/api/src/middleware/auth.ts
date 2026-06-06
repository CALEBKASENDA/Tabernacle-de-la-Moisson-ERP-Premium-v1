import type { FastifyRequest, FastifyReply } from 'fastify';
import { resolveSession, type AuthenticatedSession } from '../appContext';

export type RequestWithAuth = FastifyRequest & {
  auth: AuthenticatedSession;
  tenant: ReturnType<typeof import('../appContext').resolveTenantContext>;
};

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = resolveSession(req.headers as Record<string, string | string[] | undefined>);
  if (!session) {
    return reply.status(401).send({ error: 'Authentification requise' });
  }
  const { resolveTenantContext } = await import('../appContext');
  (req as RequestWithAuth).auth = session;
  (req as RequestWithAuth).tenant = resolveTenantContext(
    req.headers as Record<string, string | string[] | undefined>,
    session
  );
}

export function requirePermission(code: string) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = (req as RequestWithAuth).auth;
    if (!auth?.permissions.includes(code)) {
      return reply.status(403).send({ error: 'Permission refusée' });
    }
  };
}

export function requireAnyPermission(...codes: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = (req as RequestWithAuth).auth;
    if (!auth || !codes.some((c) => auth.permissions.includes(c))) {
      return reply.status(403).send({ error: 'Permission refusée' });
    }
  };
}

export function requireSuperAdminOrPermission(code: string) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = (req as RequestWithAuth).auth;
    if (!auth) {
      return reply.status(403).send({ error: 'Permission refusée' });
    }
    if (auth.roles.includes('SUPER_ADMIN') || auth.permissions.includes(code)) {
      return;
    }
    return reply.status(403).send({ error: 'Permission refusée' });
  };
}

export function requireSuperAdmin() {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = (req as RequestWithAuth).auth;
    if (!auth?.roles.includes('SUPER_ADMIN')) {
      return reply.status(403).send({ error: 'Réservé à l\'administrateur principal' });
    }
  };
}
