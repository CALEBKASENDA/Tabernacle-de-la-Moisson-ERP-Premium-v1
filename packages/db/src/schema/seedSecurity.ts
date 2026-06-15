import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import { newId } from '@tabernacle/erp-premium-domain';
import { hashPassword } from '../security/password';
import { seedSuperAdmin } from './initFinanceSchema';

const SYSTEM_ROLES = [
  'SUPER_ADMIN',
  'ADMIN_CHURCH',
  'TREASURER',
  'ACCOUNTANT',
  'DATA_ENTRY_OPERATOR',
  'AUDITOR',
  'READ_ONLY',
] as const;

export const PERMISSION_CODES = [
  'finance:operations:voir',
  'finance:operations:ajouter',
  'finance:operations:modifier',
  'finance:operations:supprimer',
  'finance:operations:restaurer',
  'finance:exchange-rates:modifier',
  'finance:reports:voir',
  'finance:audit:voir',
  'admin:churches:administrer',
  'admin:users:administrer',
  'admin:security:administrer',
  'pastoral:members:voir',
  'pastoral:members:modifier',
  'pastoral:cells:voir',
  'pastoral:cells:modifier',
  'pastoral:visits:voir',
  'pastoral:visits:modifier',
  'pastoral:trainings:voir',
  'pastoral:trainings:modifier',
] as const;

const ROLE_PERMISSIONS: Record<(typeof SYSTEM_ROLES)[number], readonly string[]> = {
  SUPER_ADMIN: PERMISSION_CODES,
  ADMIN_CHURCH: PERMISSION_CODES.filter((p) => !p.startsWith('admin:churches')),
  TREASURER: [
    'finance:operations:voir',
    'finance:operations:ajouter',
    'finance:operations:modifier',
    'finance:operations:supprimer',
    'finance:operations:restaurer',
    'finance:exchange-rates:modifier',
    'finance:reports:voir',
    'admin:users:administrer',
    'pastoral:members:voir',
    'pastoral:members:modifier',
    'pastoral:cells:voir',
    'pastoral:cells:modifier',
    'pastoral:visits:voir',
    'pastoral:visits:modifier',
    'pastoral:trainings:voir',
    'pastoral:trainings:modifier',
  ],
  ACCOUNTANT: [
    'finance:operations:voir',
    'finance:operations:ajouter',
    'finance:operations:modifier',
    'finance:reports:voir',
    'pastoral:members:voir',
    'pastoral:visits:voir',
  ],
  DATA_ENTRY_OPERATOR: ['finance:operations:voir', 'finance:operations:ajouter'],
  AUDITOR: ['finance:operations:voir', 'finance:reports:voir', 'finance:audit:voir'],
  READ_ONLY: [
    'finance:operations:voir',
    'finance:reports:voir',
    'pastoral:members:voir',
    'pastoral:cells:voir',
    'pastoral:visits:voir',
    'pastoral:trainings:voir',
  ],
};

function resolveBootstrapAccounts(): Array<{ email: string; fullName: string; password: string }> {
  const email = process.env.TABERNACLE_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.TABERNACLE_BOOTSTRAP_PASSWORD;
  const fullName = process.env.TABERNACLE_BOOTSTRAP_NAME?.trim() || 'Administrateur';

  if (email && password) {
    return [{ email, fullName, password }];
  }

  if (process.env.NODE_ENV === 'production' && process.env.TABERNACLE_DATA_DIR) {
    console.warn(
      '[Tabernacle] TABERNACLE_BOOTSTRAP_EMAIL et TABERNACLE_BOOTSTRAP_PASSWORD requis — aucun compte créé automatiquement.'
    );
    return [];
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[Tabernacle] TABERNACLE_BOOTSTRAP_EMAIL et TABERNACLE_BOOTSTRAP_PASSWORD requis en production — aucun compte créé.'
    );
    return [];
  }

  return [
    {
      email: 'admin@local.dev',
      fullName: 'Admin développement',
      password: 'ChangeMe123!',
    },
  ];
}

export function seedSecurityDefaults(db: SqliteDatabase, defaultChurchId: string): void {
  const now = new Date().toISOString();

  for (const code of PERMISSION_CODES) {
    const id = `perm_${code.replace(/[:]/g, '_')}`;
    db.run(
      `INSERT OR IGNORE INTO permission (permission_id, code, description) VALUES (@id, @code, @code)`,
      { id, code }
    );
  }

  const roleIds: Record<string, string> = {};
  for (const name of SYSTEM_ROLES) {
    const roleId = `role_${name}`;
    roleIds[name] = roleId;
    db.run(
      `INSERT OR IGNORE INTO role (role_id, church_id, name, is_system_role, status, created_at, updated_at)
       VALUES (@id, NULL, @name, 1, 'active', @now, @now)`,
      { id: roleId, name, now }
    );
  }

  const allPerms = db.all<{ permission_id: string; code: string }>(`SELECT permission_id, code FROM permission`);
  const permByCode = Object.fromEntries(allPerms.map((p) => [p.code, p.permission_id]));

  for (const [roleName, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIds[roleName];
    if (!roleId) continue;
    for (const code of codes) {
      const pid = permByCode[code];
      if (!pid) continue;
      db.run(
        `INSERT OR IGNORE INTO role_permission (role_id, permission_id) VALUES (@role_id, @perm_id)`,
        { role_id: roleId, perm_id: pid }
      );
    }
  }

  const legacyAdmin = db.get<{ user_id: string }>(
    `SELECT user_id FROM app_user WHERE email='admin@tabernacle.local'`
  );
  if (legacyAdmin) {
    db.run(`DELETE FROM user_role WHERE user_id=@id`, { id: legacyAdmin.user_id });
    db.run(`DELETE FROM church_user WHERE user_id=@id`, { id: legacyAdmin.user_id });
    db.run(`DELETE FROM user_permission WHERE user_id=@id`, { id: legacyAdmin.user_id });
    db.run(
      `UPDATE user_session SET ended_at=@now WHERE user_id=@id AND ended_at IS NULL`,
      { id: legacyAdmin.user_id, now }
    );
    db.run(`DELETE FROM app_user WHERE user_id=@id`, { id: legacyAdmin.user_id });
  }

  for (const account of resolveBootstrapAccounts()) {
    const passwordHash = hashPassword(account.password);
    const existing = db.get<{ user_id: string }>(
      `SELECT user_id FROM app_user WHERE email=@email`,
      { email: account.email }
    );

    let userId: string;
    const resetPassword = process.env.TABERNACLE_BOOTSTRAP_RESET === 'true';
    if (existing) {
      userId = existing.user_id;
      if (resetPassword) {
        db.run(
          `UPDATE app_user SET full_name=@name, password_hash=@hash, is_active=1, updated_at=@now WHERE user_id=@id`,
          { name: account.fullName, hash: passwordHash, now, id: userId }
        );
      } else {
        db.run(
          `UPDATE app_user SET full_name=@name, is_active=1, updated_at=@now WHERE user_id=@id`,
          { name: account.fullName, now, id: userId }
        );
      }
    } else {
      userId = seedSuperAdmin(db, {
        churchId: defaultChurchId,
        email: account.email,
        fullName: account.fullName,
        passwordHash,
      });
    }

    db.run(
      `INSERT OR IGNORE INTO user_role (church_id, user_id, role_id, status, created_at)
       VALUES (@church_id, @user_id, @role_id, 'active', @now)`,
      { church_id: defaultChurchId, user_id: userId, role_id: roleIds.SUPER_ADMIN, now }
    );
  }
}
