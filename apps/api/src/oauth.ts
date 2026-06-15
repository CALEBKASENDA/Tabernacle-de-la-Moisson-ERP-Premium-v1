import crypto from 'node:crypto';

export type OAuthProvider = 'google' | 'microsoft';

type ProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
};

const pendingStates = new Map<string, { provider: OAuthProvider; returnUrl: string; expires: number }>();

function cleanupStates(): void {
  const now = Date.now();
  for (const [k, v] of pendingStates) {
    if (v.expires < now) pendingStates.delete(k);
  }
}

export function isOAuthEnabled(provider: OAuthProvider): boolean {
  const cfg = getProviderConfig(provider);
  return !!(cfg?.clientId && cfg.clientSecret);
}

export function listEnabledOAuthProviders(): OAuthProvider[] {
  const out: OAuthProvider[] = [];
  if (isOAuthEnabled('google')) out.push('google');
  if (isOAuthEnabled('microsoft')) out.push('microsoft');
  return out;
}

function getProviderConfig(provider: OAuthProvider): ProviderConfig | null {
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['openid', 'email', 'profile'],
    };
  }
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? '';
  if (!clientId || !clientSecret) return null;
  const tenant = process.env.MICROSOFT_TENANT_ID?.trim() || 'common';
  return {
    clientId,
    clientSecret,
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scopes: ['openid', 'email', 'profile', 'User.Read'],
  };
}

function redirectBase(): string {
  return (process.env.OAUTH_REDIRECT_BASE ?? process.env.PUBLIC_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3847}`).replace(
    /\/$/,
    ''
  );
}

export function buildOAuthStartUrl(provider: OAuthProvider, returnUrl: string): string {
  const cfg = getProviderConfig(provider);
  if (!cfg) throw new Error(`OAuth ${provider} non configuré`);

  cleanupStates();
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, { provider, returnUrl, expires: Date.now() + 10 * 60 * 1000 });

  const redirectUri = `${redirectBase()}/api/v1/oauth/callback/${provider}`;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${cfg.authorizeUrl}?${params}`;
}

export async function exchangeOAuthCode(
  provider: OAuthProvider,
  code: string,
  state: string
): Promise<{ email: string; subject: string; returnUrl: string }> {
  cleanupStates();
  const pending = pendingStates.get(state);
  pendingStates.delete(state);
  if (!pending || pending.provider !== provider) {
    throw new Error('État OAuth invalide ou expiré');
  }

  const cfg = getProviderConfig(provider);
  if (!cfg) throw new Error(`OAuth ${provider} non configuré`);

  const redirectUri = `${redirectBase()}/api/v1/oauth/callback/${provider}`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    id_token?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error ?? 'Échange OAuth échoué');
  }

  let email = '';
  let subject = '';

  if (provider === 'google') {
    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const user = (await userRes.json()) as { email?: string; sub?: string };
    email = user.email?.trim().toLowerCase() ?? '';
    subject = user.sub ?? '';
  } else {
    const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const user = (await userRes.json()) as { mail?: string; userPrincipalName?: string; id?: string };
    email = (user.mail ?? user.userPrincipalName ?? '').trim().toLowerCase();
    subject = user.id ?? '';
  }

  if (!email) throw new Error('Courriel non fourni par le fournisseur OAuth');
  return { email, subject, returnUrl: pending.returnUrl };
}
