import crypto from 'node:crypto';

export type JwtClaims = {
  sub: string;
  sessionId: string;
  churchId: string;
  email: string;
  type: 'access';
};

const DEFAULT_TTL_SEC = 60 * 60 * 24 * 7; // 7 jours

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function resolveSecret(): string {
  const secret = process.env.TABERNACLE_JWT_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    console.warn('[Tabernacle] TABERNACLE_JWT_SECRET non défini — secret de secours (définissez-le en production).');
  }
  return 'tabernacle-dev-jwt-secret-change-me';
}

export function signAccessToken(claims: Omit<JwtClaims, 'type'>, ttlSec = DEFAULT_TTL_SEC): string {
  const secret = resolveSecret();
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      ...claims,
      type: 'access',
      iat: now,
      exp: now + ttlSec,
    } satisfies JwtClaims & { iat: number; exp: number })
  );
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyAccessToken(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const secret = resolveSecret();
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  if (sig !== expected) return null;

  try {
    const body = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as JwtClaims & {
      exp?: number;
    };
    if (body.type !== 'access' || !body.sub || !body.sessionId) return null;
    if (body.exp != null && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export function extractBearerToken(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers.authorization ?? headers.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.startsWith('Bearer ')) return null;
  return value.slice('Bearer '.length).trim() || null;
}
