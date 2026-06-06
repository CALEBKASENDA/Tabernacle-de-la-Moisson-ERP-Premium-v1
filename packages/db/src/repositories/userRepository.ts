import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import { newId } from '@tabernacle/erp-premium-domain';

export type UserRow = {
  user_id: string;
  email: string | null;
  full_name: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type UserAccessAssignment = {
  churchId: string;
  churchName: string;
  membershipStatus: string;
  roleIds: string[];
  roleNames: string[];
  permissionCodes: string[];
  customPermissions: boolean;
};

export type UserAccessProfile = {
  userId: string;
  email: string | null;
  fullName: string;
  isActive: boolean;
  assignments: UserAccessAssignment[];
};

export class UserRepository {
  constructor(private readonly db: SqliteDatabase) {}

  listByChurch(churchId: string): Array<UserRow & { roles: string; churches: string }> {
    return this.db.all<UserRow & { roles: string; churches: string }>(
      `SELECT u.user_id, u.email, u.full_name, u.is_active, u.created_at, u.updated_at,
              COALESCE(GROUP_CONCAT(DISTINCT r.name), '') as roles,
              COALESCE(GROUP_CONCAT(DISTINCT c.name), '') as churches
       FROM app_user u
       INNER JOIN church_user cu ON cu.user_id = u.user_id AND cu.church_id=@church_id AND cu.status='active'
       INNER JOIN church c ON c.church_id = cu.church_id
       LEFT JOIN user_role ur ON ur.user_id = u.user_id AND ur.church_id=@church_id AND ur.status='active'
       LEFT JOIN role r ON r.role_id = ur.role_id
       GROUP BY u.user_id
       ORDER BY u.full_name`,
      { church_id: churchId }
    );
  }

  listAll(): Array<UserRow & { roles: string; churches: string }> {
    return this.db.all<UserRow & { roles: string; churches: string }>(
      `SELECT u.user_id, u.email, u.full_name, u.is_active, u.created_at, u.updated_at,
              COALESCE((
                SELECT GROUP_CONCAT(d.name, ', ')
                FROM (
                  SELECT DISTINCT r2.name AS name
                  FROM user_role ur2
                  INNER JOIN role r2 ON r2.role_id = ur2.role_id
                  WHERE ur2.user_id = u.user_id AND ur2.status = 'active'
                ) d
              ), '') AS roles,
              COALESCE((
                SELECT GROUP_CONCAT(d.name, ', ')
                FROM (
                  SELECT DISTINCT c2.name AS name
                  FROM church_user cu2
                  INNER JOIN church c2 ON c2.church_id = cu2.church_id
                  WHERE cu2.user_id = u.user_id AND cu2.status = 'active'
                ) d
              ), '') AS churches
       FROM app_user u
       ORDER BY u.full_name`
    );
  }

  getByEmail(email: string): (UserRow & { password_hash: string | null }) | null {
    return (
      this.db.get<UserRow & { password_hash: string | null }>(
        `SELECT user_id, email, full_name, password_hash, is_active, created_at, updated_at
         FROM app_user WHERE email=@email`,
        { email }
      ) ?? null
    );
  }

  getById(userId: string): UserRow | null {
    return (
      this.db.get<UserRow>(
        `SELECT user_id, email, full_name, is_active, created_at, updated_at FROM app_user WHERE user_id=@id`,
        { id: userId }
      ) ?? null
    );
  }

  create(params: {
    churchId: string;
    email: string;
    fullName: string;
    passwordHash: string;
    roleId: string;
  }): string {
    return this.createWithAccess({
      email: params.email,
      fullName: params.fullName,
      passwordHash: params.passwordHash,
      assignments: [{ churchId: params.churchId, roleIds: [params.roleId] }],
    });
  }

  createWithAccess(params: {
    email: string;
    fullName: string;
    passwordHash: string;
    assignments: Array<{ churchId: string; roleIds: string[]; permissionCodes?: string[] }>;
  }): string {
    if (params.assignments.length === 0) {
      throw new Error('Au moins une église et un rôle sont requis');
    }
    for (const a of params.assignments) {
      if (a.roleIds.length === 0) {
        throw new Error('Chaque église doit avoir au moins un rôle');
      }
    }

    const existing = this.getByEmail(params.email.trim().toLowerCase());
    if (existing) throw new Error('Un utilisateur avec ce courriel existe déjà');

    const now = new Date().toISOString();
    const userId = newId('user');
    this.db.withTransaction(() => {
      this.db.run(
        `INSERT INTO app_user (user_id, email, full_name, password_hash, is_active, created_at, updated_at)
         VALUES (@id, @email, @name, @hash, 1, @now, @now)`,
        { id: userId, email: params.email.trim().toLowerCase(), name: params.fullName, hash: params.passwordHash, now }
      );
      this.applyAccessInternal(userId, params.assignments, now);
    });
    return userId;
  }

  update(params: {
    userId: string;
    fullName?: string;
    email?: string;
    isActive?: boolean;
    passwordHash?: string;
  }): void {
    const row = this.getById(params.userId);
    if (!row) throw new Error('Utilisateur introuvable');
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE app_user SET full_name=@name, email=@email, is_active=@active,
        password_hash=COALESCE(@hash, password_hash), updated_at=@now WHERE user_id=@id`,
      {
        name: params.fullName ?? row.full_name,
        email: params.email ?? row.email,
        active: params.isActive !== undefined ? (params.isActive ? 1 : 0) : row.is_active,
        hash: params.passwordHash ?? null,
        now,
        id: params.userId,
      }
    );
  }

  getUserRoles(churchId: string, userId: string): string[] {
    const rows = this.db.all<{ name: string }>(
      `SELECT r.name FROM user_role ur
       INNER JOIN role r ON r.role_id = ur.role_id
       WHERE ur.church_id=@church_id AND ur.user_id=@user_id AND ur.status='active'`,
      { church_id: churchId, user_id: userId }
    );
    return rows.map((r) => r.name);
  }

  getUserChurches(userId: string): ChurchRow[] {
    return this.db.all<ChurchRow>(
      `SELECT c.church_id, c.name, c.status, c.funds_enabled, c.created_at, c.updated_at
       FROM church c
       INNER JOIN church_user cu ON cu.church_id = c.church_id
       WHERE cu.user_id=@user_id AND cu.status='active' AND c.status='active'
       ORDER BY c.name`,
      { user_id: userId }
    );
  }

  isSuperAdmin(userId: string): boolean {
    const row = this.db.get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM user_role ur
       INNER JOIN role r ON r.role_id = ur.role_id
       WHERE ur.user_id=@user_id AND ur.status='active' AND r.name='SUPER_ADMIN'`,
      { user_id: userId }
    );
    return (row?.c ?? 0) > 0;
  }

  /** Toutes les églises actives pour le super admin, sinon églises rattachées au compte. */
  getAccessibleChurches(userId: string): ChurchRow[] {
    if (this.isSuperAdmin(userId)) {
      return this.db.all<ChurchRow>(
        `SELECT church_id, name, status, funds_enabled, created_at, updated_at
         FROM church WHERE status='active' ORDER BY name`
      );
    }
    return this.getUserChurches(userId);
  }

  listRoles(churchId?: string): Array<{ role_id: string; name: string; is_system_role: number }> {
    return this.db.all(
      `SELECT role_id, name, is_system_role FROM role
       WHERE status='active' AND (church_id IS NULL OR church_id=@church_id)
       ORDER BY name`,
      { church_id: churchId ?? null }
    );
  }

  listPermissions(): Array<{ permission_id: string; code: string }> {
    return this.db.all(
      `SELECT permission_id, code FROM permission ORDER BY code`
    );
  }

  getRolePermissionCodes(roleId: string): string[] {
    const rows = this.db.all<{ code: string }>(
      `SELECT p.code FROM role_permission rp
       INNER JOIN permission p ON p.permission_id = rp.permission_id
       WHERE rp.role_id=@role_id
       ORDER BY p.code`,
      { role_id: roleId }
    );
    return rows.map((r) => r.code);
  }

  getRolePermissionsMap(): Record<string, string[]> {
    const roles = this.listRoles();
    const map: Record<string, string[]> = {};
    for (const role of roles) {
      map[role.role_id] = this.getRolePermissionCodes(role.role_id);
    }
    return map;
  }

  getUserPermissionCodes(churchId: string, userId: string): string[] {
    const rows = this.db.all<{ code: string }>(
      `SELECT p.code FROM user_permission up
       INNER JOIN permission p ON p.permission_id = up.permission_id
       WHERE up.church_id=@church_id AND up.user_id=@user_id
       ORDER BY p.code`,
      { church_id: churchId, user_id: userId }
    );
    return rows.map((r) => r.code);
  }

  getEffectivePermissionCodes(churchId: string, userId: string, roleIds: string[]): string[] {
    const custom = this.getUserPermissionCodes(churchId, userId);
    if (custom.length > 0) return custom;
    const set = new Set<string>();
    for (const roleId of roleIds) {
      for (const code of this.getRolePermissionCodes(roleId)) {
        set.add(code);
      }
    }
    return [...set].sort();
  }

  getUserAccess(userId: string): UserAccessProfile | null {
    const user = this.getById(userId);
    if (!user) return null;

    const rows = this.db.all<{
      church_id: string;
      church_name: string;
      membership_status: string;
      role_id: string | null;
      role_name: string | null;
    }>(
      `SELECT c.church_id, c.name AS church_name, cu.status AS membership_status,
              r.role_id, r.name AS role_name
       FROM church_user cu
       INNER JOIN church c ON c.church_id = cu.church_id
       LEFT JOIN user_role ur ON ur.church_id = cu.church_id AND ur.user_id = cu.user_id AND ur.status = 'active'
       LEFT JOIN role r ON r.role_id = ur.role_id
       WHERE cu.user_id = @user_id
       ORDER BY c.name, r.name`,
      { user_id: userId }
    );

    const byChurch = new Map<string, UserAccessAssignment>();
    for (const row of rows) {
      let entry = byChurch.get(row.church_id);
      if (!entry) {
        const customCount = this.db.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM user_permission WHERE church_id=@church_id AND user_id=@user_id`,
          { church_id: row.church_id, user_id: userId }
        );
        entry = {
          churchId: row.church_id,
          churchName: row.church_name,
          membershipStatus: row.membership_status,
          roleIds: [],
          roleNames: [],
          permissionCodes: [],
          customPermissions: (customCount?.n ?? 0) > 0,
        };
        byChurch.set(row.church_id, entry);
      }
      if (row.role_id && !entry.roleIds.includes(row.role_id)) {
        entry.roleIds.push(row.role_id);
        entry.roleNames.push(row.role_name ?? row.role_id);
      }
    }

    for (const entry of byChurch.values()) {
      entry.permissionCodes = this.getEffectivePermissionCodes(
        entry.churchId,
        userId,
        entry.roleIds
      );
    }

    return {
      userId: user.user_id,
      email: user.email,
      fullName: user.full_name,
      isActive: user.is_active === 1,
      assignments: [...byChurch.values()],
    };
  }

  setUserAccess(
    userId: string,
    assignments: Array<{ churchId: string; roleIds: string[]; permissionCodes?: string[] | null }>,
    options?: { scopeChurchIds?: string[] }
  ): void {
    if (!this.getById(userId)) throw new Error('Utilisateur introuvable');
    if (assignments.length === 0) {
      throw new Error('Au moins une église et un rôle sont requis');
    }

    const scope = options?.scopeChurchIds;
    const normalized = assignments.map((a) => ({
      churchId: a.churchId,
      roleIds: [...new Set(a.roleIds)],
      permissionCodes: a.permissionCodes,
    }));

    for (const a of normalized) {
      if (a.roleIds.length === 0) {
        throw new Error('Chaque église doit avoir au moins un rôle');
      }
      if (scope && !scope.includes(a.churchId)) {
        throw new Error('Accès refusé à cette église');
      }
      const church = this.db.get<{ church_id: string }>(
        `SELECT church_id FROM church WHERE church_id=@id AND status='active'`,
        { id: a.churchId }
      );
      if (!church) throw new Error(`Église introuvable : ${a.churchId}`);

      for (const roleId of a.roleIds) {
        const role = this.db.get<{ role_id: string }>(
          `SELECT role_id FROM role WHERE role_id=@id AND status='active'`,
          { id: roleId }
        );
        if (!role) throw new Error('Rôle introuvable');
      }
      if (a.permissionCodes) {
        for (const code of a.permissionCodes) {
          const perm = this.db.get<{ permission_id: string }>(
            `SELECT permission_id FROM permission WHERE code=@code`,
            { code }
          );
          if (!perm) throw new Error(`Permission inconnue : ${code}`);
        }
      }
    }

    const now = new Date().toISOString();
    this.db.withTransaction(() => {
      if (scope) {
        const existing = this.db.all<{ church_id: string }>(
          `SELECT church_id FROM church_user WHERE user_id=@user_id AND status='active'`,
          { user_id: userId }
        );
        const merged = new Map<string, { churchId: string; roleIds: string[]; permissionCodes?: string[] | null }>();
        for (const row of existing) {
          if (!scope.includes(row.church_id)) {
            const profile = this.getUserAccess(userId);
            const kept = profile?.assignments.find((a) => a.churchId === row.church_id);
            if (kept) {
              merged.set(row.church_id, {
                churchId: row.church_id,
                roleIds: kept.roleIds,
                permissionCodes: kept.customPermissions ? kept.permissionCodes : undefined,
              });
            }
          }
        }
        for (const a of normalized) {
          merged.set(a.churchId, a);
        }
        this.applyAccessInternal(userId, [...merged.values()], now, scope);
      } else {
        this.applyAccessInternal(userId, normalized, now);
      }
    });
  }

  private applyAccessInternal(
    userId: string,
    assignments: Array<{ churchId: string; roleIds: string[]; permissionCodes?: string[] | null }>,
    now: string,
    scopeChurchIds?: string[]
  ): void {
    const targetChurchIds = assignments.map((a) => a.churchId);

    if (scopeChurchIds) {
      for (const churchId of scopeChurchIds) {
        if (!targetChurchIds.includes(churchId)) {
          this.db.run(
            `DELETE FROM user_role WHERE user_id=@user_id AND church_id=@church_id`,
            { user_id: userId, church_id: churchId }
          );
          this.db.run(
            `DELETE FROM church_user WHERE user_id=@user_id AND church_id=@church_id`,
            { user_id: userId, church_id: churchId }
          );
        }
      }
    } else {
      const allChurches = this.db.all<{ church_id: string }>(
        `SELECT church_id FROM church_user WHERE user_id=@user_id`,
        { user_id: userId }
      );
      for (const row of allChurches) {
        if (!targetChurchIds.includes(row.church_id)) {
          this.db.run(`DELETE FROM user_role WHERE user_id=@user_id AND church_id=@church_id`, {
            user_id: userId,
            church_id: row.church_id,
          });
          this.db.run(`DELETE FROM church_user WHERE user_id=@user_id AND church_id=@church_id`, {
            user_id: userId,
            church_id: row.church_id,
          });
        }
      }
    }

    for (const assignment of assignments) {
      this.db.run(
        `INSERT INTO church_user (church_id, user_id, status, created_at)
         VALUES (@church_id, @user_id, 'active', @now)
         ON CONFLICT(church_id, user_id) DO UPDATE SET status='active'`,
        { church_id: assignment.churchId, user_id: userId, now }
      );

      this.db.run(
        `DELETE FROM user_role WHERE user_id=@user_id AND church_id=@church_id`,
        { user_id: userId, church_id: assignment.churchId }
      );

      for (const roleId of assignment.roleIds) {
        this.db.run(
          `INSERT INTO user_role (church_id, user_id, role_id, status, created_at)
           VALUES (@church_id, @user_id, @role_id, 'active', @now)`,
          { church_id: assignment.churchId, user_id: userId, role_id: roleId, now }
        );
      }

      this.db.run(
        `DELETE FROM user_permission WHERE user_id=@user_id AND church_id=@church_id`,
        { user_id: userId, church_id: assignment.churchId }
      );
      if (assignment.permissionCodes && assignment.permissionCodes.length > 0) {
        for (const code of assignment.permissionCodes) {
          const perm = this.db.get<{ permission_id: string }>(
            `SELECT permission_id FROM permission WHERE code=@code`,
            { code }
          );
          if (!perm) continue;
          this.db.run(
            `INSERT INTO user_permission (church_id, user_id, permission_id, created_at)
             VALUES (@church_id, @user_id, @perm_id, @now)`,
            {
              church_id: assignment.churchId,
              user_id: userId,
              perm_id: perm.permission_id,
              now,
            }
          );
        }
      }
    }
  }

  createCustomRole(params: {
    churchId: string;
    name: string;
    permissionCodes: string[];
  }): string {
    const now = new Date().toISOString();
    const roleId = newId('role');
    const code = params.name.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 40);
    if (!code) throw new Error('Nom de rôle requis');
    const exists = this.db.get<{ role_id: string }>(
      `SELECT role_id FROM role WHERE name=@name AND (church_id=@church_id OR church_id IS NULL)`,
      { name: code, church_id: params.churchId }
    );
    if (exists) throw new Error('Ce rôle existe déjà');

    this.db.run(
      `INSERT INTO role (role_id, church_id, name, is_system_role, status, created_at, updated_at)
       VALUES (@id, @church_id, @name, 0, 'active', @now, @now)`,
      { id: roleId, church_id: params.churchId, name: code, now }
    );

    for (const permCode of params.permissionCodes) {
      const perm = this.db.get<{ permission_id: string }>(
        `SELECT permission_id FROM permission WHERE code=@code`,
        { code: permCode }
      );
      if (!perm) continue;
      this.db.run(
        `INSERT OR IGNORE INTO role_permission (role_id, permission_id) VALUES (@role_id, @perm_id)`,
        { role_id: roleId, perm_id: perm.permission_id }
      );
    }

    return roleId;
  }

  updateCustomRole(params: {
    roleId: string;
    churchId: string;
    name?: string;
    permissionCodes?: string[];
  }): void {
    const row = this.db.get<{ role_id: string; is_system_role: number; church_id: string | null }>(
      `SELECT role_id, is_system_role, church_id FROM role WHERE role_id=@id`,
      { id: params.roleId }
    );
    if (!row || row.is_system_role) throw new Error('Rôle système non modifiable');
    if (row.church_id && row.church_id !== params.churchId) throw new Error('Accès refusé');

    const now = new Date().toISOString();
    if (params.name?.trim()) {
      const code = params.name.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 40);
      this.db.run(`UPDATE role SET name=@name, updated_at=@now WHERE role_id=@id`, {
        id: params.roleId,
        name: code,
        now,
      });
    }

    if (params.permissionCodes) {
      this.db.run(`DELETE FROM role_permission WHERE role_id=@id`, { id: params.roleId });
      for (const permCode of params.permissionCodes) {
        const perm = this.db.get<{ permission_id: string }>(
          `SELECT permission_id FROM permission WHERE code=@code`,
          { code: permCode }
        );
        if (!perm) continue;
        this.db.run(
          `INSERT OR IGNORE INTO role_permission (role_id, permission_id) VALUES (@role_id, @perm_id)`,
          { role_id: params.roleId, perm_id: perm.permission_id }
        );
      }
    }
  }

  deleteCustomRole(params: { roleId: string; churchId: string }): void {
    const row = this.db.get<{ role_id: string; is_system_role: number; church_id: string | null }>(
      `SELECT role_id, is_system_role, church_id FROM role WHERE role_id=@id`,
      { id: params.roleId }
    );
    if (!row || row.is_system_role) throw new Error('Rôle système non supprimable');
    if (row.church_id && row.church_id !== params.churchId) throw new Error('Accès refusé');

    const used = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM user_role WHERE role_id=@id`,
      { id: params.roleId }
    );
    if ((used?.n ?? 0) > 0) throw new Error('Rôle encore assigné à des utilisateurs');

    this.db.run(`DELETE FROM role_permission WHERE role_id=@id`, { id: params.roleId });
    this.db.run(`DELETE FROM role WHERE role_id=@id`, { id: params.roleId });
  }
}

type ChurchRow = {
  church_id: string;
  name: string;
  status: string;
  funds_enabled: number;
  created_at: string;
  updated_at: string;
};
