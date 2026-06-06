import type { FastifyInstance, FastifyReply } from 'fastify';
import { getAppContext } from '../appContext';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth';
import { hashPassword } from '@tabernacle/erp-premium-db';

function isSuperAdmin(auth: RequestWithAuth['auth']): boolean {
  return auth.roles.includes('SUPER_ADMIN');
}

function manageableChurchIds(auth: RequestWithAuth['auth'], allChurches: { church_id: string }[]): string[] {
  if (isSuperAdmin(auth)) return allChurches.map((c) => c.church_id);
  return [auth.churchId];
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const { security } = getAppContext();

  app.addHook('preHandler', requireAuth);

  // ─── ÉGLISES ──────────────────────────────────────────────────────────
  app.get('/admin/churches', { preHandler: requirePermission('admin:churches:administrer') }, async (req) => {
    const auth = (req as RequestWithAuth).auth;
    if (isSuperAdmin(auth)) {
      return { data: security.churches.list() };
    }
    const church = security.churches.getById(auth.churchId);
    return { data: church ? [church] : [] };
  });

  app.post('/admin/churches', { preHandler: requirePermission('admin:churches:administrer') }, async (req, reply) => {
    const auth = (req as RequestWithAuth).auth;
    if (!isSuperAdmin(auth)) {
      return reply.status(403).send({ error: 'Seul le super administrateur peut créer une église' });
    }
    const body = req.body as { name: string };
    const churchId = security.churches.create({ name: body.name });
    return { data: { churchId } };
  });

  app.patch('/admin/churches/:id', { preHandler: requirePermission('admin:churches:administrer') }, async (req, reply) => {
    const auth = (req as RequestWithAuth).auth;
    const { id } = req.params as { id: string };
    if (!isSuperAdmin(auth) && id !== auth.churchId) {
      return reply.status(403).send({ error: 'Accès refusé' });
    }
    const body = req.body as { name?: string; status?: string; fundsEnabled?: boolean };
    if (body.status !== undefined && !isSuperAdmin(auth)) {
      return reply.status(403).send({ error: 'Seul le super administrateur peut modifier le statut' });
    }
    security.churches.update({ churchId: id, ...body });
    const church = security.churches.getById(id);
    return { ok: true, data: church };
  });

  app.patch('/admin/church-settings', { preHandler: requireAuth }, async (req, reply) => {
    const auth = (req as RequestWithAuth).auth;
    const body = req.body as { fundsEnabled?: boolean };
    if (body.fundsEnabled === undefined) {
      return reply.status(400).send({ error: 'Paramètre fundsEnabled requis' });
    }
    const canToggle =
      isSuperAdmin(auth) ||
      auth.permissions.includes('admin:churches:administrer') ||
      auth.permissions.includes('admin:users:administrer');
    if (!canToggle) {
      return reply.status(403).send({ error: 'Permission insuffisante pour modifier cette option' });
    }
    security.churches.update({ churchId: auth.churchId, fundsEnabled: body.fundsEnabled });
    return { ok: true, data: { fundsEnabled: body.fundsEnabled } };
  });

  // ─── UTILISATEURS ─────────────────────────────────────────────────────
  // Routes statiques AVANT les routes paramétrées (/admin/users/:id/…)
  const userOptionsHandler = async (req: RequestWithAuth) => {
    const auth = req.auth;
    const churches = isSuperAdmin(auth)
      ? security.churches.list()
      : (() => {
          const church = security.churches.getById(auth.churchId);
          return church ? [church] : [];
        })();
    const roles = security.users.listRoles(isSuperAdmin(auth) ? undefined : auth.churchId);
    const permissions = security.users.listPermissions();
    const rolePermissions = security.users.getRolePermissionsMap();
    return { data: { churches, roles, permissions, rolePermissions } };
  };

  app.get('/admin/user-options', { preHandler: requirePermission('admin:users:administrer') }, async (req) =>
    userOptionsHandler(req as RequestWithAuth)
  );
  app.get('/admin/users/options', { preHandler: requirePermission('admin:users:administrer') }, async (req) =>
    userOptionsHandler(req as RequestWithAuth)
  );

  app.get('/admin/roles', { preHandler: requirePermission('admin:users:administrer') }, async (req) => {
    const auth = (req as RequestWithAuth).auth;
    return { data: security.users.listRoles(isSuperAdmin(auth) ? undefined : auth.churchId) };
  });

  app.post('/admin/roles', { preHandler: requirePermission('admin:users:administrer') }, async (req, reply) => {
    const auth = (req as RequestWithAuth).auth;
    const body = req.body as { name: string; permissionCodes: string[]; churchId?: string };
    const churchId = isSuperAdmin(auth) && body.churchId ? body.churchId : auth.churchId;
    try {
      const roleId = security.users.createCustomRole({
        churchId,
        name: body.name,
        permissionCodes: body.permissionCodes ?? [],
      });
      return { data: { roleId } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Création impossible';
      return reply.status(400).send({ error: message });
    }
  });

  app.patch('/admin/roles/:id', { preHandler: requirePermission('admin:users:administrer') }, async (req, reply) => {
    const auth = (req as RequestWithAuth).auth;
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; permissionCodes?: string[] };
    const churchId = isSuperAdmin(auth) ? (body as { churchId?: string }).churchId ?? auth.churchId : auth.churchId;
    try {
      security.users.updateCustomRole({
        roleId: id,
        churchId,
        name: body.name,
        permissionCodes: body.permissionCodes,
      });
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Mise à jour impossible' });
    }
  });

  app.delete('/admin/roles/:id', { preHandler: requirePermission('admin:users:administrer') }, async (req, reply) => {
    const auth = (req as RequestWithAuth).auth;
    const { id } = req.params as { id: string };
    try {
      security.users.deleteCustomRole({ roleId: id, churchId: auth.churchId });
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Suppression impossible' });
    }
  });

  app.get('/admin/users', { preHandler: requirePermission('admin:users:administrer') }, async (req) => {
    const auth = (req as RequestWithAuth).auth;
    const data = isSuperAdmin(auth)
      ? security.users.listAll()
      : security.users.listByChurch(auth.churchId);
    return { data };
  });

  const userAccessGetHandler = async (req: RequestWithAuth, reply: FastifyReply) => {
    const auth = req.auth;
    const userId = (req.params as { userId: string }).userId;
    const profile = security.users.getUserAccess(userId);
    if (!profile) return reply.status(404).send({ error: 'Utilisateur introuvable' });

    if (!isSuperAdmin(auth)) {
      const inChurch = profile.assignments.some((a) => a.churchId === auth.churchId);
      if (!inChurch) return reply.status(403).send({ error: 'Accès refusé' });
    }

    return { data: profile };
  };

  const userAccessPutHandler = async (req: RequestWithAuth, reply: FastifyReply) => {
    const auth = req.auth;
    const userId = (req.params as { userId: string }).userId;
    const body = req.body as {
      assignments: Array<{ churchId: string; roleIds: string[]; permissionCodes?: string[] }>;
    };

    if (!body.assignments?.length) {
      return reply.status(400).send({ error: 'Au moins une église et un rôle sont requis' });
    }

    const allChurches = isSuperAdmin(auth) ? security.churches.list() : [];
    const scope = manageableChurchIds(auth, allChurches);

    if (!isSuperAdmin(auth)) {
      const profile = security.users.getUserAccess(userId);
      if (!profile) return reply.status(404).send({ error: 'Utilisateur introuvable' });
      const inChurch = profile.assignments.some((a) => a.churchId === auth.churchId);
      if (!inChurch) return reply.status(403).send({ error: 'Accès refusé' });

      const touchesForeign = body.assignments.some((a) => a.churchId !== auth.churchId);
      if (touchesForeign) {
        return reply.status(403).send({ error: 'Vous ne pouvez gérer que votre église' });
      }
    }

    try {
      security.users.setUserAccess(userId, body.assignments, {
        scopeChurchIds: isSuperAdmin(auth) ? undefined : scope,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mise à jour impossible';
      return reply.status(400).send({ error: message });
    }

    return { data: security.users.getUserAccess(userId) };
  };

  app.get('/admin/user-access/:userId', { preHandler: requirePermission('admin:users:administrer') }, async (req, reply) =>
    userAccessGetHandler(req as RequestWithAuth, reply)
  );
  app.get('/admin/users/:id/access', { preHandler: requirePermission('admin:users:administrer') }, async (req, reply) => {
    const auth = (req as RequestWithAuth).auth;
    const userId = (req.params as { id: string }).id;
    const profile = security.users.getUserAccess(userId);
    if (!profile) return reply.status(404).send({ error: 'Utilisateur introuvable' });
    if (!isSuperAdmin(auth)) {
      const inChurch = profile.assignments.some((a) => a.churchId === auth.churchId);
      if (!inChurch) return reply.status(403).send({ error: 'Accès refusé' });
    }
    return { data: profile };
  });

  app.put('/admin/user-access/:userId', { preHandler: requirePermission('admin:users:administrer') }, async (req, reply) =>
    userAccessPutHandler(req as RequestWithAuth, reply)
  );

  app.put('/admin/users/:id/access', { preHandler: requirePermission('admin:users:administrer') }, async (req, reply) => {
    const auth = (req as RequestWithAuth).auth;
    const userId = (req.params as { id: string }).id;
    const body = req.body as { assignments: Array<{ churchId: string; roleIds: string[] }> };
    if (!body.assignments?.length) {
      return reply.status(400).send({ error: 'Au moins une église et un rôle sont requis' });
    }
    const allChurches = isSuperAdmin(auth) ? security.churches.list() : [];
    const scope = manageableChurchIds(auth, allChurches);
    if (!isSuperAdmin(auth)) {
      const profile = security.users.getUserAccess(userId);
      if (!profile) return reply.status(404).send({ error: 'Utilisateur introuvable' });
      if (!profile.assignments.some((a) => a.churchId === auth.churchId)) {
        return reply.status(403).send({ error: 'Accès refusé' });
      }
      if (body.assignments.some((a) => a.churchId !== auth.churchId)) {
        return reply.status(403).send({ error: 'Vous ne pouvez gérer que votre église' });
      }
    }
    try {
      security.users.setUserAccess(userId, body.assignments, {
        scopeChurchIds: isSuperAdmin(auth) ? undefined : scope,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mise à jour impossible';
      return reply.status(400).send({ error: message });
    }
    return { data: security.users.getUserAccess(userId) };
  });

  app.post('/admin/users', { preHandler: requirePermission('admin:users:administrer') }, async (req, reply) => {
    const auth = (req as RequestWithAuth).auth;
    const body = req.body as {
      email: string;
      fullName: string;
      password: string;
      roleId?: string;
      assignments?: Array<{ churchId: string; roleIds: string[]; permissionCodes?: string[] }>;
    };

    const allChurches = isSuperAdmin(auth) ? security.churches.list() : [];
    const scope = manageableChurchIds(auth, allChurches);

    let assignments = body.assignments ?? [];
    if (assignments.length === 0 && body.roleId) {
      assignments = [{ churchId: auth.churchId, roleIds: [body.roleId] }];
    }

    if (!isSuperAdmin(auth)) {
      if (assignments.some((a) => a.churchId !== auth.churchId)) {
        return reply.status(403).send({ error: 'Vous ne pouvez créer des utilisateurs que pour votre église' });
      }
    } else {
      for (const a of assignments) {
        if (!scope.includes(a.churchId)) {
          return reply.status(400).send({ error: 'Église invalide' });
        }
      }
    }

    try {
      const userId = security.users.createWithAccess({
        email: body.email.trim().toLowerCase(),
        fullName: body.fullName,
        passwordHash: hashPassword(body.password),
        assignments,
      });
      return { data: { userId } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Création impossible';
      return reply.status(400).send({ error: message });
    }
  });

  app.patch('/admin/users/:id', { preHandler: requirePermission('admin:users:administrer') }, async (req, reply) => {
    const auth = (req as RequestWithAuth).auth;
    const { id } = req.params as { id: string };
    const body = req.body as { fullName?: string; email?: string; isActive?: boolean; password?: string };

    if (!isSuperAdmin(auth)) {
      const profile = security.users.getUserAccess(id);
      if (!profile?.assignments.some((a) => a.churchId === auth.churchId)) {
        return reply.status(403).send({ error: 'Accès refusé' });
      }
    }

    security.users.update({
      userId: id,
      fullName: body.fullName,
      email: body.email?.trim().toLowerCase(),
      isActive: body.isActive,
      passwordHash: body.password ? hashPassword(body.password) : undefined,
    });
    return { ok: true };
  });
}
