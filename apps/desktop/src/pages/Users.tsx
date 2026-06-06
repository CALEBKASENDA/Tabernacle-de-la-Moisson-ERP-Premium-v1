import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  type AppUser,
  type Church,
  type Permission,
  type Role,
  type UserAccessAssignmentInput,
  type UserAccessProfile,
  type UserAdminOptions,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { GROUPES_PERMISSIONS, libellerPermission, libellerRole, libellerRoles } from '../i18n/fr';
import { useChurchScope } from '../hooks/useChurchScope';

type AssignmentDraft = {
  churchId: string;
  roleIds: string[];
  enabled: boolean;
  permissionCodes: string[];
  useCustomPermissions: boolean;
};

function computePermissionsFromRoles(
  roleIds: string[],
  rolePermissions: Record<string, string[]>
): string[] {
  const set = new Set<string>();
  for (const roleId of roleIds) {
    for (const code of rolePermissions[roleId] ?? []) {
      set.add(code);
    }
  }
  return [...set].sort();
}

function buildDrafts(
  churches: Church[],
  defaultRoleId: string,
  rolePermissions: Record<string, string[]>,
  activeChurchId?: string,
  profile?: UserAccessProfile | null
): AssignmentDraft[] {
  return churches.map((c) => {
    const existing = profile?.assignments.find((a) => a.churchId === c.church_id);
    if (existing) {
      return {
        churchId: c.church_id,
        enabled: true,
        roleIds: [...existing.roleIds],
        useCustomPermissions: existing.customPermissions,
        permissionCodes: existing.customPermissions
          ? [...existing.permissionCodes]
          : computePermissionsFromRoles(existing.roleIds, rolePermissions),
      };
    }
    const enabled = profile
      ? false
      : churches.length === 1 || c.church_id === activeChurchId;
    const roleIds = defaultRoleId ? [defaultRoleId] : [];
    return {
      churchId: c.church_id,
      enabled,
      roleIds,
      useCustomPermissions: false,
      permissionCodes: computePermissionsFromRoles(roleIds, rolePermissions),
    };
  });
}

function churchFromAuth(authUser: NonNullable<ReturnType<typeof useAuth>['user']>): Church {
  const name =
    authUser.churchName ??
    authUser.churches?.find((c) => c.church_id === authUser.churchId)?.name ??
    'Église active';
  return {
    church_id: authUser.churchId,
    name,
    status: 'active',
    funds_enabled: 0,
    created_at: '',
    updated_at: '',
  };
}

async function loadAdminOptions(
  authUser: ReturnType<typeof useAuth>['user'],
  isSuperAdmin: boolean
): Promise<UserAdminOptions> {
  try {
    return (await api.getUserAdminOptions()).data;
  } catch {
    const roles = (await api.getRoles()).data;
    let churches: Church[] = [];
    if (isSuperAdmin) {
      try {
        churches = (await api.getChurches()).data;
      } catch {
        /* pas de permission églises — on continue */
      }
    }
    if (churches.length === 0 && authUser?.churchId) {
      churches = [churchFromAuth(authUser)];
    }
    return { churches, roles, permissions: [], rolePermissions: {} };
  }
}

function draftsToInput(drafts: AssignmentDraft[]): UserAccessAssignmentInput[] {
  return drafts
    .filter((d) => d.enabled && d.roleIds.length > 0)
    .map((d) => ({
      churchId: d.churchId,
      roleIds: d.roleIds,
      ...(d.useCustomPermissions ? { permissionCodes: d.permissionCodes } : {}),
    }));
}

function UserAccessEditor({
  title,
  churches,
  roles,
  permissions,
  rolePermissions,
  drafts,
  onChange,
  onSave,
  onCancel,
  saving,
  churchFilter,
  onChurchFilterChange,
  showActions = true,
}: {
  title: string;
  churches: Church[];
  roles: Role[];
  permissions: Permission[];
  rolePermissions: Record<string, string[]>;
  drafts: AssignmentDraft[];
  onChange: (drafts: AssignmentDraft[]) => void;
  onSave?: () => void;
  onCancel?: () => void;
  saving?: boolean;
  churchFilter: string;
  onChurchFilterChange: (v: string) => void;
  showActions?: boolean;
}) {
  const permissionCodesAvailable = useMemo(
    () => new Set(permissions.map((p) => p.code)),
    [permissions]
  );

  const filteredChurches = useMemo(() => {
    const q = churchFilter.trim().toLowerCase();
    if (!q) return churches;
    return churches.filter((c) => c.name.toLowerCase().includes(q));
  }, [churches, churchFilter]);

  const mergeDrafts = (nextPartial: AssignmentDraft[]) => {
    onChange(
      drafts.map((d) => nextPartial.find((n) => n.churchId === d.churchId) ?? d)
    );
  };

  const toggleChurch = (churchId: string, enabled: boolean) => {
    mergeDrafts(
      drafts.map((d) => (d.churchId === churchId ? { ...d, enabled } : d))
    );
  };

  const toggleRole = (churchId: string, roleId: string, checked: boolean) => {
    mergeDrafts(
      drafts.map((d) => {
        if (d.churchId !== churchId) return d;
        const roleIds = checked
          ? [...new Set([...d.roleIds, roleId])]
          : d.roleIds.filter((id) => id !== roleId);
        const next: AssignmentDraft = {
          ...d,
          roleIds,
          enabled: roleIds.length > 0 || d.enabled,
        };
        if (!d.useCustomPermissions) {
          next.permissionCodes = computePermissionsFromRoles(roleIds, rolePermissions);
        }
        return next;
      })
    );
  };

  const togglePermission = (churchId: string, code: string, checked: boolean) => {
    mergeDrafts(
      drafts.map((d) => {
        if (d.churchId !== churchId) return d;
        const permissionCodes = checked
          ? [...new Set([...d.permissionCodes, code])].sort()
          : d.permissionCodes.filter((c) => c !== code);
        return { ...d, useCustomPermissions: true, permissionCodes };
      })
    );
  };

  const resetToRoleDefaults = (churchId: string) => {
    mergeDrafts(
      drafts.map((d) => {
        if (d.churchId !== churchId) return d;
        return {
          ...d,
          useCustomPermissions: false,
          permissionCodes: computePermissionsFromRoles(d.roleIds, rolePermissions),
        };
      })
    );
  };

  return (
    <div className="user-access-block">
      <div className="user-access-editor-header">
        <h3>{title}</h3>
        {churches.length > 4 && (
          <input
            type="search"
            className="user-access-search"
            placeholder="Filtrer les églises…"
            value={churchFilter}
            onChange={(e) => onChurchFilterChange(e.target.value)}
          />
        )}
      </div>
      <p className="section-hint">
        Cochez les églises accessibles, assignez les rôles puis ajustez les fonctionnalités si besoin.
        Par défaut, les permissions suivent les rôles ; vous pouvez les personnaliser par église.
      </p>
      <div className="user-access-grid">
        {filteredChurches.map((church) => {
          const draft = drafts.find((d) => d.churchId === church.church_id);
          if (!draft) return null;
          return (
            <div
              key={church.church_id}
              className={`user-access-card${draft.enabled ? ' enabled' : ''}`}
            >
              <label className="user-access-church-toggle">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => toggleChurch(church.church_id, e.target.checked)}
                />
                <strong>{church.name}</strong>
              </label>
              {draft.enabled && (
                <>
                  <div className="user-access-roles">
                    {roles.map((role) => (
                      <label key={role.role_id} className="user-access-role-chip">
                        <input
                          type="checkbox"
                          checked={draft.roleIds.includes(role.role_id)}
                          onChange={(e) => toggleRole(church.church_id, role.role_id, e.target.checked)}
                        />
                        {libellerRole(role.name)}
                      </label>
                    ))}
                  </div>
                  {draft.roleIds.length > 0 && permissionCodesAvailable.size > 0 && (
                    <div className="user-access-permissions">
                      <div className="user-access-permissions-header">
                        <strong>Fonctionnalités</strong>
                        {draft.useCustomPermissions && (
                          <span className="badge badge-info">Personnalisé</span>
                        )}
                        {draft.useCustomPermissions && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => resetToRoleDefaults(church.church_id)}
                          >
                            Réinitialiser selon les rôles
                          </button>
                        )}
                      </div>
                      {GROUPES_PERMISSIONS.map((group) => {
                        const codes = group.codes.filter((c) => permissionCodesAvailable.has(c));
                        if (codes.length === 0) return null;
                        return (
                          <div key={group.titre} className="user-access-permission-group">
                            <span className="user-access-permission-group-title">{group.titre}</span>
                            <div className="user-access-permission-list">
                              {codes.map((code) => (
                                <label key={code} className="user-access-permission-chip">
                                  <input
                                    type="checkbox"
                                    checked={draft.permissionCodes.includes(code)}
                                    onChange={(e) =>
                                      togglePermission(church.church_id, code, e.target.checked)
                                    }
                                  />
                                  {libellerPermission(code)}
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {filteredChurches.length === 0 && churches.length === 0 && (
          <p className="error-msg" style={{ margin: 0 }}>
            Aucune église disponible. Vérifiez que l&apos;API est à jour et relancez l&apos;application.
          </p>
        )}
        {filteredChurches.length === 0 && churches.length > 0 && (
          <p style={{ color: 'var(--muted)' }}>Aucune église ne correspond au filtre.</p>
        )}
      </div>
      {showActions && onSave && (
        <div className="cloud-actions-row" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer les accès'}
          </button>
          {onCancel && (
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
              Annuler
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CustomRolePanel({
  churches,
  permissions,
  isSuperAdmin,
  defaultChurchId,
  onCreated,
}: {
  churches: Church[];
  permissions: Permission[];
  isSuperAdmin: boolean;
  defaultChurchId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [churchId, setChurchId] = useState(defaultChurchId);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const permissionCodesAvailable = useMemo(
    () => new Set(permissions.map((p) => p.code)),
    [permissions]
  );

  const toggleCode = (code: string, checked: boolean) => {
    setSelected((prev) =>
      checked ? [...new Set([...prev, code])].sort() : prev.filter((c) => c !== code)
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selected.length === 0) {
      setError('Nom et au moins une permission requis');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.createCustomRole({
        name: name.trim(),
        permissionCodes: selected,
        ...(isSuperAdmin && churchId ? { churchId } : {}),
      });
      setName('');
      setSelected([]);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  if (permissionCodesAvailable.size === 0) return null;

  return (
    <div className="panel" style={{ marginBottom: '1.5rem' }}>
      <h3>Créer un rôle personnalisé</h3>
      <p className="section-hint">
        Définissez un rôle sur mesure avec un ensemble de fonctionnalités spécifiques à votre église.
      </p>
      {error && <div className="error-msg">{error}</div>}
      <form onSubmit={onSubmit}>
        <div className="form-grid" style={{ marginBottom: '1rem' }}>
          <label>
            Nom du rôle
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          {isSuperAdmin && churches.length > 1 && (
            <label>
              Église
              <select value={churchId} onChange={(e) => setChurchId(e.target.value)}>
                {churches.map((c) => (
                  <option key={c.church_id} value={c.church_id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="user-access-permissions">
          {GROUPES_PERMISSIONS.map((group) => {
            const codes = group.codes.filter((c) => permissionCodesAvailable.has(c));
            if (codes.length === 0) return null;
            return (
              <div key={group.titre} className="user-access-permission-group">
                <span className="user-access-permission-group-title">{group.titre}</span>
                <div className="user-access-permission-list">
                  {codes.map((code) => (
                    <label key={code} className="user-access-permission-chip">
                      <input
                        type="checkbox"
                        checked={selected.includes(code)}
                        onChange={(e) => toggleCode(code, e.target.checked)}
                      />
                      {libellerPermission(code)}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={saving}>
          {saving ? 'Création…' : 'Créer le rôle'}
        </button>
      </form>
    </div>
  );
}

export function Users() {
  const churchId = useChurchScope();
  const { hasPermission, user: authUser } = useAuth();
  const isSuperAdmin = authUser?.roles.includes('SUPER_ADMIN') ?? false;

  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [churches, setChurches] = useState<Church[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState({ email: '', fullName: '', password: '' });
  const [createDrafts, setCreateDrafts] = useState<AssignmentDraft[]>([]);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<AssignmentDraft[]>([]);
  const [churchFilter, setChurchFilter] = useState('');
  const [editChurchFilter, setEditChurchFilter] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const manageableChurches = isSuperAdmin
    ? churches
    : churches.filter((c) => c.church_id === churchId);

  const defaultRoleId = roles[0]?.role_id ?? '';

  const load = useCallback(async () => {
    setError('');
    try {
      const opts = await loadAdminOptions(authUser, isSuperAdmin);
      setRoles(opts.roles);
      setChurches(opts.churches);
      setPermissions(opts.permissions ?? []);
      setRolePermissions(opts.rolePermissions ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement des églises');
    }
    try {
      const u = await api.getUsers();
      setUsers(u.data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur de chargement des utilisateurs';
      setError((prev) => prev || msg);
    }
  }, [authUser, isSuperAdmin]);

  useEffect(() => {
    if (churchId) load();
  }, [churchId, load]);

  useEffect(() => {
    if (!manageableChurches.length || !defaultRoleId) return;
    setCreateDrafts((prev) => {
      if (prev.length === manageableChurches.length && prev.some((d) => d.enabled)) return prev;
      const activeId = isSuperAdmin ? undefined : churchId;
      return buildDrafts(manageableChurches, defaultRoleId, rolePermissions, activeId);
    });
  }, [manageableChurches, defaultRoleId, churchId, isSuperAdmin, rolePermissions]);

  if (!hasPermission('admin:users:administrer')) {
    return <div className="error-msg">Accès refusé — permission administration des utilisateurs requise.</div>;
  }

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const assignments = draftsToInput(createDrafts);
    if (assignments.length === 0) {
      setError('Sélectionnez au moins une église et un rôle');
      return;
    }
    try {
      await api.createUser({ ...form, assignments });
      setForm({ email: '', fullName: '', password: '' });
      setCreateDrafts(
        buildDrafts(manageableChurches, defaultRoleId, rolePermissions, isSuperAdmin ? undefined : churchId)
      );
      setSuccess('Utilisateur créé');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const openEdit = async (userId: string) => {
    setError('');
    setSuccess('');
    try {
      const res = await api.getUserAccess(userId);
      setEditUserId(userId);
      setEditDrafts(buildDrafts(manageableChurches, defaultRoleId, rolePermissions, undefined, res.data));
      setEditChurchFilter('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const saveEdit = async () => {
    if (!editUserId) return;
    const assignments = draftsToInput(editDrafts);
    if (assignments.length === 0) {
      setError('Au moins une église et un rôle sont requis');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.setUserAccess(editUserId, assignments);
      setSuccess('Accès mis à jour — l\'utilisateur ne verra que ses églises assignées');
      setEditUserId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: AppUser) => {
    try {
      await api.updateUser(u.user_id, { isActive: !u.is_active });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handlePasswordReset = async () => {
    if (!resetUserId || resetPassword.length < 8) return;
    setResetting(true);
    setError('');
    try {
      await api.updateUser(resetUserId, { password: resetPassword });
      setSuccess('Mot de passe réinitialisé');
      setResetUserId(null);
      setResetPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setResetting(false);
    }
  };

  const editingUser = users.find((u) => u.user_id === editUserId);
  const resettingUser = users.find((u) => u.user_id === resetUserId);

  return (
    <>
      <div className="page-header">
        <h2>Gestion des utilisateurs</h2>
        <p className="page-subtitle">
          Attribuez les églises, les rôles et les fonctionnalités — chaque utilisateur n&apos;accède qu&apos;à ce qui lui est assigné.
        </p>
      </div>
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="panel" style={{ marginBottom: '1.5rem' }}>
        <h3>Ajouter un utilisateur</h3>
        <form onSubmit={onCreate}>
          <div className="form-grid" style={{ marginBottom: '1.25rem' }}>
            <label>
              Nom complet
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            </label>
            <label>
              Courriel
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label>
              Mot de passe
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </label>
          </div>

          <UserAccessEditor
            title="Accès par église, rôle et fonctionnalités"
            churches={manageableChurches}
            roles={roles}
            permissions={permissions}
            rolePermissions={rolePermissions}
            drafts={createDrafts}
            onChange={setCreateDrafts}
            churchFilter={churchFilter}
            onChurchFilterChange={setChurchFilter}
            showActions={false}
          />
          <div style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary">Créer l&apos;utilisateur</button>
          </div>
        </form>
      </div>

      <CustomRolePanel
        churches={manageableChurches}
        permissions={permissions}
        isSuperAdmin={isSuperAdmin}
        defaultChurchId={churchId ?? manageableChurches[0]?.church_id ?? ''}
        onCreated={() => {
          setSuccess('Rôle personnalisé créé');
          load();
        }}
      />

      {editUserId && editingUser && (
        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <UserAccessEditor
            title={`Accès — ${editingUser.full_name}`}
            churches={manageableChurches}
            roles={roles}
            permissions={permissions}
            rolePermissions={rolePermissions}
            drafts={editDrafts}
            onChange={setEditDrafts}
            onSave={saveEdit}
            onCancel={() => setEditUserId(null)}
            saving={saving}
            churchFilter={editChurchFilter}
            onChurchFilterChange={setEditChurchFilter}
          />
        </div>
      )}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Églises</th>
              <th>Rôles</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id} className={editUserId === u.user_id ? 'row-active' : undefined}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td>{u.churches?.trim() || '—'}</td>
                <td>{libellerRoles(u.roles)}</td>
                <td>
                  <span className={`badge ${u.is_active ? 'badge-success' : 'badge-muted'}`}>
                    {u.is_active ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="table-actions">
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => openEdit(u.user_id)}>
                    Accès & fonctionnalités
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setResetUserId(u.user_id); setResetPassword(''); }}>
                    Mot de passe
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => toggleActive(u)}>
                    {u.is_active ? 'Désactiver' : 'Activer'}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucun utilisateur</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {resetUserId && resettingUser && (
        <div className="modal-overlay" onClick={() => setResetUserId(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Réinitialiser le mot de passe</h3>
            <p className="form-hint">Utilisateur : {resettingUser.full_name} ({resettingUser.email})</p>
            <div className="form-group">
              <label>Nouveau mot de passe (8 caractères minimum)</label>
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                minLength={8}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setResetUserId(null)}>Annuler</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={resetPassword.length < 8 || resetting}
                onClick={handlePasswordReset}
              >
                {resetting ? 'Enregistrement…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
