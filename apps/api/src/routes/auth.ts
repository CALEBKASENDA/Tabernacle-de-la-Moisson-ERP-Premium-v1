import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getAppContext } from '../appContext';
import { requireAuth, type RequestWithAuth } from '../middleware/auth';
import { rateLimitLogin, clearLoginAttempts } from '../middleware/rateLimit';
import { signAccessToken } from '../jwt';

function withAccessToken(data: {
  sessionId: string;
  userId: string;
  email: string;
  churchId: string;
  [key: string]: unknown;
}) {
  return {
    ...data,
    accessToken: signAccessToken({
      sub: data.userId,
      sessionId: data.sessionId,
      churchId: data.churchId,
      email: data.email,
    }),
    tokenType: 'Bearer',
    expiresIn: 60 * 60 * 24 * 7,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { security } = getAppContext();

  const loginHandler = async (
    req: FastifyRequest,
    reply: FastifyReply
  ) => {
    const body = req.body as { email: string; password: string; churchId?: string };
    try {
      const data = security.login({
        email: body.email,
        password: body.password,
        churchId: body.churchId,
      });
      clearLoginAttempts(req);
      return { data: withAccessToken(data) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connexion impossible';
      const lower = message.toLowerCase();
      if (lower.includes('identifiants') || lower.includes('authentification') || lower.includes('session')) {
        return reply.status(401).send({ error: message });
      }
      if (lower.includes('interdit') || lower.includes('refusé') || lower.includes('permission')) {
        return reply.status(403).send({ error: message });
      }
      throw err;
    }
  };

  app.post('/auth/login', { preHandler: rateLimitLogin }, loginHandler);
  app.post('/auth/token', { preHandler: rateLimitLogin }, loginHandler);

  app.post('/auth/logout', { preHandler: requireAuth }, async (req) => {
    const auth = (req as RequestWithAuth).auth;
    security.logout(auth.sessionId);
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (req) => {
    const auth = (req as RequestWithAuth).auth;
    const churches = security.users.getAccessibleChurches(auth.userId);
    return {
      data: {
        userId: auth.userId,
        fullName: auth.fullName,
        email: auth.email,
        churchId: auth.churchId,
        roles: auth.roles,
        permissions: auth.permissions,
        churches,
        fundsEnabled: security.churches.isFundsEnabled(auth.churchId),
        isSuperAdmin: security.users.isSuperAdmin(auth.userId),
      },
    };
  });

  app.post('/auth/change-password', { preHandler: requireAuth }, async (req) => {
    const auth = (req as RequestWithAuth).auth;
    const body = req.body as { currentPassword: string; newPassword: string };
    security.changePassword({
      userId: auth.userId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
    return { ok: true };
  });

  app.post('/auth/switch-church', { preHandler: requireAuth }, async (req) => {
    const auth = (req as RequestWithAuth).auth;
    const body = req.body as { churchId: string };
    const switched = security.switchChurch({ sessionId: auth.sessionId, churchId: body.churchId });
    return {
      data: withAccessToken({
        ...switched,
        userId: auth.userId,
        sessionId: auth.sessionId,
        email: auth.email,
      }),
    };
  });
}
