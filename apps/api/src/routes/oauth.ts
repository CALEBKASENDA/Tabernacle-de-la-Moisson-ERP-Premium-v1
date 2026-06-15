import type { FastifyInstance, FastifyReply } from 'fastify';
import { getAppContext } from '../appContext';
import { signAccessToken } from '../jwt';
import {
  buildOAuthStartUrl,
  exchangeOAuthCode,
  listEnabledOAuthProviders,
  type OAuthProvider,
} from '../oauth';

function safeReturnUrl(raw: string | undefined): string {
  const fallback = process.env.OAUTH_APP_RETURN_URL?.trim() || 'http://127.0.0.1:5173/oauth/callback';
  if (!raw?.trim()) return fallback;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

function redirectWithTokens(reply: FastifyReply, returnUrl: string, data: {
  sessionId: string;
  userId: string;
  email: string;
  churchId: string;
  fullName: string;
  churchName: string;
  roles: string[];
  permissions: string[];
  fundsEnabled: boolean;
}) {
  const accessToken = signAccessToken({
    sub: data.userId,
    sessionId: data.sessionId,
    churchId: data.churchId,
    email: data.email,
  });
  const target = new URL(returnUrl);
  target.hash = new URLSearchParams({
    sessionId: data.sessionId,
    accessToken,
    userId: data.userId,
    email: data.email,
    churchId: data.churchId,
    fullName: data.fullName,
    churchName: data.churchName,
    roles: JSON.stringify(data.roles),
    permissions: JSON.stringify(data.permissions),
    fundsEnabled: String(data.fundsEnabled),
  }).toString();
  return reply.redirect(target.toString());
}

export async function oauthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/oauth/providers', async () => ({
    data: listEnabledOAuthProviders(),
  }));

  for (const provider of ['google', 'microsoft'] as OAuthProvider[]) {
    app.get(`/oauth/${provider}/start`, async (req, reply) => {
      const q = req.query as { returnUrl?: string };
      try {
        const url = buildOAuthStartUrl(provider, safeReturnUrl(q.returnUrl));
        return reply.redirect(url);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OAuth indisponible';
        return reply.status(503).send({ error: message });
      }
    });

    app.get(`/oauth/callback/${provider}`, async (req, reply) => {
      const q = req.query as { code?: string; state?: string; error?: string };
      if (q.error) {
        return reply.status(400).send({ error: q.error });
      }
      if (!q.code || !q.state) {
        return reply.status(400).send({ error: 'Paramètres OAuth manquants' });
      }

      try {
        const { email, subject, returnUrl } = await exchangeOAuthCode(provider, q.code, q.state);
        const { security } = getAppContext();
        const session = security.loginWithOAuth({
          email,
          provider,
          providerSubject: subject,
        });
        return redirectWithTokens(reply, returnUrl, session);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connexion OAuth échouée';
        return reply.status(401).send({ error: message });
      }
    });
  }
}
