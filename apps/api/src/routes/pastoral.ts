import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getAppContext } from '../appContext';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth';

export async function pastoralRoutes(app: FastifyInstance): Promise<void> {
  const { pastoral } = getAppContext();
  const ctx = (req: FastifyRequest) => (req as RequestWithAuth).tenant;

  app.get('/pastoral/dashboard', { preHandler: requirePermission('pastoral:members:voir') }, async (req) => {
    return { data: pastoral.getDashboard(ctx(req)) };
  });

  // ─── Membres ─────────────────────────────────────────────────────────
  app.get('/pastoral/members', { preHandler: requirePermission('pastoral:members:voir') }, async (req) => {
    const q = req.query as { q?: string; status?: string };
    return { data: pastoral.members.list(ctx(req), { q: q.q, status: q.status }) };
  });

  app.post('/pastoral/members', { preHandler: requirePermission('pastoral:members:modifier') }, async (req) => {
    const body = req.body as {
      fullName: string;
      phone?: string;
      email?: string;
      birthDate?: string;
      gender?: string;
      notes?: string;
    };
    if (!body.fullName?.trim()) throw new Error('Nom complet requis');
    const memberId = pastoral.members.create({ ctx: ctx(req), ...body });
    return { data: { memberId } };
  });

  app.patch('/pastoral/members/:id', { preHandler: requirePermission('pastoral:members:modifier') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    pastoral.members.update({ ctx: ctx(req), memberId: id, patch: body as never });
    return { ok: true };
  });

  app.post('/pastoral/members/:id/delete', { preHandler: requirePermission('pastoral:members:modifier') }, async (req) => {
    const { id } = req.params as { id: string };
    pastoral.members.softDelete(ctx(req), id);
    return { ok: true };
  });

  // ─── Cellules ────────────────────────────────────────────────────────
  app.get('/pastoral/cells', { preHandler: requirePermission('pastoral:cells:voir') }, async (req) => {
    return { data: pastoral.cells.list(ctx(req)) };
  });

  app.post('/pastoral/cells', { preHandler: requirePermission('pastoral:cells:modifier') }, async (req) => {
    const body = req.body as {
      name: string;
      leaderMemberId?: string;
      meetingDay?: string;
      meetingTime?: string;
      location?: string;
      notes?: string;
    };
    if (!body.name?.trim()) throw new Error('Nom de cellule requis');
    const cellId = pastoral.cells.create({ ctx: ctx(req), ...body });
    return { data: { cellId } };
  });

  app.patch('/pastoral/cells/:id', { preHandler: requirePermission('pastoral:cells:modifier') }, async (req) => {
    const { id } = req.params as { id: string };
    pastoral.cells.update({ ctx: ctx(req), cellId: id, patch: req.body as never });
    return { ok: true };
  });

  app.post('/pastoral/cells/:id/delete', { preHandler: requirePermission('pastoral:cells:modifier') }, async (req) => {
    pastoral.cells.softDelete(ctx(req), (req.params as { id: string }).id);
    return { ok: true };
  });

  // ─── Visites ─────────────────────────────────────────────────────────
  app.get('/pastoral/visits', { preHandler: requirePermission('pastoral:visits:voir') }, async (req) => {
    const q = req.query as { dateFrom?: string; dateTo?: string };
    return { data: pastoral.visits.list(ctx(req), q) };
  });

  app.post('/pastoral/visits', { preHandler: requirePermission('pastoral:visits:modifier') }, async (req) => {
    const body = req.body as {
      visitorName: string;
      visitDate: string;
      visitType?: string;
      memberId?: string;
      notes?: string;
    };
    if (!body.visitorName?.trim()) throw new Error('Nom du visiteur requis');
    const visitId = pastoral.visits.create({ ctx: ctx(req), ...body });
    return { data: { visitId } };
  });

  app.post('/pastoral/visits/:id/delete', { preHandler: requirePermission('pastoral:visits:modifier') }, async (req) => {
    pastoral.visits.softDelete(ctx(req), (req.params as { id: string }).id);
    return { ok: true };
  });

  // ─── Formations ──────────────────────────────────────────────────────
  app.get('/pastoral/trainings', { preHandler: requirePermission('pastoral:trainings:voir') }, async (req) => {
    return { data: pastoral.trainings.list(ctx(req)) };
  });

  app.post('/pastoral/trainings', { preHandler: requirePermission('pastoral:trainings:modifier') }, async (req) => {
    const body = req.body as {
      title: string;
      trainingDate: string;
      trainer?: string;
      location?: string;
      description?: string;
    };
    if (!body.title?.trim()) throw new Error('Titre requis');
    const trainingId = pastoral.trainings.create({ ctx: ctx(req), ...body });
    return { data: { trainingId } };
  });

  app.patch('/pastoral/trainings/:id', { preHandler: requirePermission('pastoral:trainings:modifier') }, async (req) => {
    pastoral.trainings.update({
      ctx: ctx(req),
      trainingId: (req.params as { id: string }).id,
      patch: req.body as never,
    });
    return { ok: true };
  });

  app.post('/pastoral/trainings/:id/delete', { preHandler: requirePermission('pastoral:trainings:modifier') }, async (req) => {
    pastoral.trainings.softDelete(ctx(req), (req.params as { id: string }).id);
    return { ok: true };
  });
}
