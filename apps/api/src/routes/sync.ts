import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { getAppContext } from '../appContext';

import { ingestSyncEventsBatch } from '../syncService';



function resolveSyncToken(): string {

  return process.env.TABERNACLE_SYNC_TOKEN?.trim() ?? '';

}



function resolveAllowedChurchId(): string | null {

  return process.env.TABERNACLE_SYNC_CHURCH_ID?.trim() || getAppContext().defaultChurchId || null;

}



async function requireSyncToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {

  const expected = resolveSyncToken();

  if (!expected) {

    return reply.status(503).send({ error: 'Synchronisation non configurée (TABERNACLE_SYNC_TOKEN)' });

  }

  const header = req.headers['x-sync-token'];

  const token = typeof header === 'string' ? header : Array.isArray(header) ? header[0] : '';

  if (token !== expected) {

    return reply.status(401).send({ error: 'Token de synchronisation invalide' });

  }

}



export async function syncRoutes(app: FastifyInstance): Promise<void> {

  app.post('/sync/ingest', { preHandler: requireSyncToken }, async (req, reply) => {

    const body = req.body as {

      schemaVersion?: number;

      events?: Array<{

        eventId: string;

        churchId: string;

        entityType: string;

        operation: string;

        entityId: string;

        payloadJson: string;

        createdAt: string;

      }>;

    };



    if (!body.events?.length) {

      return reply.status(400).send({ error: 'Aucun événement' });

    }



    const allowedChurch = resolveAllowedChurchId();

    if (allowedChurch) {

      const invalid = body.events.filter((e) => e.churchId !== allowedChurch);

      if (invalid.length > 0) {

        return reply.status(403).send({ error: `Événements refusés pour churchId ≠ ${allowedChurch}` });

      }

    }



    const result = await ingestSyncEventsBatch(body.events);

    return {
      data: {
        accepted: result.accepted,
        conflicts: result.conflicts,
        total: body.events.length,
        applied: result.conflicts.length === 0,
      },
    };

  });

}

