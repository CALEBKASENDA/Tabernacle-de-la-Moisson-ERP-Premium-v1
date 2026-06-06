import type { FastifyRequest, FastifyReply } from 'fastify';

const attempts = new Map<string, { count: number; resetAt: number }>();

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export async function rateLimitLogin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return reply.status(429).send({
      error: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
    });
  }

  entry.count += 1;
}

export function clearLoginAttempts(req: FastifyRequest): void {
  const ip = req.ip || 'unknown';
  attempts.delete(ip);
}
