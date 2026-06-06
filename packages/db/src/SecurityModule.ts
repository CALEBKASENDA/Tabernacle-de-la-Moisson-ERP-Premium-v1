import type { SqliteDatabase } from './sqlite/sqliteDatabase';

import { newId } from '@tabernacle/erp-premium-domain';

import { ChurchRepository } from './repositories/churchRepository';

import { UserRepository } from './repositories/userRepository';

import { hashPassword, verifyPassword } from './security/password';

import { seedSecurityDefaults } from './schema/seedSecurity';



export class SecurityModule {

  readonly churches: ChurchRepository;

  readonly users: UserRepository;



  private constructor(private readonly db: SqliteDatabase) {

    this.churches = new ChurchRepository(db);

    this.users = new UserRepository(db);

  }



  static bootstrap(db: SqliteDatabase, defaultChurchId: string): SecurityModule {

    seedSecurityDefaults(db, defaultChurchId);

    return new SecurityModule(db);

  }



  private superAdminPermissions(): string[] {

    const role = this.db.get<{ role_id: string }>(

      `SELECT role_id FROM role WHERE name='SUPER_ADMIN' AND status='active' LIMIT 1`

    );

    if (!role) return [];

    return this.users.getRolePermissionCodes(role.role_id);

  }



  private resolveRolesAndPermissions(

    churchId: string,

    userId: string

  ): { roles: string[]; permissions: string[] } {

    if (this.users.isSuperAdmin(userId)) {

      return { roles: ['SUPER_ADMIN'], permissions: this.superAdminPermissions() };

    }

    const roles = this.users.getUserRoles(churchId, userId);

    const roleRows = this.db.all<{ role_id: string }>(

      `SELECT role_id FROM user_role WHERE church_id=@church_id AND user_id=@user_id AND status='active'`,

      { church_id: churchId, user_id: userId }

    );

    const permissions = this.users.getEffectivePermissionCodes(

      churchId,

      userId,

      roleRows.map((r) => r.role_id)

    );

    return { roles, permissions };

  }



  login(params: {

    email: string;

    password: string;

    churchId?: string;

    workstationId?: string;

  }): {

    sessionId: string;

    userId: string;

    fullName: string;

    email: string;

    churchId: string;

    churchName: string;

    roles: string[];

    permissions: string[];

    fundsEnabled: boolean;

  } {

    const user = this.users.getByEmail(params.email.trim().toLowerCase());

    if (!user || !user.is_active) throw new Error('Identifiants invalides');

    if (!user.password_hash || !verifyPassword(params.password, user.password_hash)) {

      throw new Error('Identifiants invalides');

    }



    const churches = this.users.getAccessibleChurches(user.user_id);

    if (churches.length === 0) throw new Error('Aucune église associée à ce compte');



    let church = churches[0]!;

    if (params.churchId) {

      const found = churches.find((c) => c.church_id === params.churchId);

      if (!found) throw new Error('Accès refusé à cette église');

      church = found;

    }



    const { roles, permissions } = this.resolveRolesAndPermissions(church.church_id, user.user_id);

    const sessionId = newId('session');

    const now = new Date().toISOString();

    const workstationId = params.workstationId ?? 'workstation_local';



    this.db.run(

      `INSERT INTO user_session (session_id, church_id, user_id, workstation_id, started_at)

       VALUES (@session_id, @church_id, @user_id, @workstation_id, @now)`,

      {

        session_id: sessionId,

        church_id: church.church_id,

        user_id: user.user_id,

        workstation_id: workstationId,

        now,

      }

    );



    return {

      sessionId,

      userId: user.user_id,

      fullName: user.full_name,

      email: user.email ?? params.email,

      churchId: church.church_id,

      churchName: church.name,

      roles,

      permissions,

      fundsEnabled: this.churches.isFundsEnabled(church.church_id),

    };

  }



  validateSession(sessionId: string): {

    sessionId: string;

    userId: string;

    churchId: string;

    workstationId: string;

    fullName: string;

    email: string;

    roles: string[];

    permissions: string[];

  } | null {

    const row = this.db.get<{

      session_id: string;

      church_id: string;

      user_id: string;

      workstation_id: string;

      ended_at: string | null;

    }>(

      `SELECT session_id, church_id, user_id, workstation_id, ended_at FROM user_session WHERE session_id=@id`,

      { id: sessionId }

    );

    if (!row || row.ended_at) return null;



    const user = this.users.getById(row.user_id);

    if (!user || !user.is_active) return null;



    const { roles, permissions } = this.resolveRolesAndPermissions(row.church_id, row.user_id);



    return {

      sessionId: row.session_id,

      userId: row.user_id,

      churchId: row.church_id,

      workstationId: row.workstation_id,

      fullName: user.full_name,

      email: user.email ?? '',

      roles,

      permissions,

    };

  }



  logout(sessionId: string): void {

    this.db.run(

      `UPDATE user_session SET ended_at=@now WHERE session_id=@id AND ended_at IS NULL`,

      { now: new Date().toISOString(), id: sessionId }

    );

  }



  switchChurch(params: { sessionId: string; churchId: string }): {

    churchId: string;

    churchName: string;

    roles: string[];

    permissions: string[];

    fundsEnabled: boolean;

  } {

    const row = this.db.get<{

      session_id: string;

      user_id: string;

      ended_at: string | null;

    }>(

      `SELECT session_id, user_id, ended_at FROM user_session WHERE session_id=@id`,

      { id: params.sessionId }

    );

    if (!row || row.ended_at) throw new Error('Session expirée');



    const churches = this.users.getAccessibleChurches(row.user_id);

    const church = churches.find((c) => c.church_id === params.churchId);

    if (!church) throw new Error('Accès refusé à cette église');



    this.db.run(

      `UPDATE user_session SET church_id=@church_id WHERE session_id=@session_id`,

      { church_id: params.churchId, session_id: params.sessionId }

    );



    const { roles, permissions } = this.resolveRolesAndPermissions(church.church_id, row.user_id);



    return {

      churchId: church.church_id,

      churchName: church.name,

      roles,

      permissions,

      fundsEnabled: this.churches.isFundsEnabled(church.church_id),

    };

  }



  getUserPermissions(churchId: string, userId: string): string[] {

    return this.resolveRolesAndPermissions(churchId, userId).permissions;

  }



  hasPermission(churchId: string, userId: string, code: string): boolean {

    return this.getUserPermissions(churchId, userId).includes(code);

  }



  changePassword(params: { userId: string; currentPassword: string; newPassword: string }): void {

    const user = this.users.getById(params.userId);

    if (!user) throw new Error('Utilisateur introuvable');

    const full = this.db.get<{ password_hash: string | null }>(

      `SELECT password_hash FROM app_user WHERE user_id=@id`,

      { id: params.userId }

    );

    if (!full?.password_hash || !verifyPassword(params.currentPassword, full.password_hash)) {

      throw new Error('Mot de passe actuel incorrect');

    }

    this.users.update({

      userId: params.userId,

      passwordHash: hashPassword(params.newPassword),

    });

  }

}


