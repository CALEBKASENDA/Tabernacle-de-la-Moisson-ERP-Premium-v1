import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, type TauxDuJour } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useHorloge } from '../hooks/useHorloge';
import { useCanManageFundsOption, useFundsEnabled } from '../hooks/useFundsEnabled';
import { libellerRole } from '../i18n/fr';

type NavItem = {
  to: string;
  label: string;
  icon: string;
  perm?: string;
  perms?: string[];
  superAdminOnly?: boolean;
  fundsFeature?: boolean;
};

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Pastoral',
    items: [
      { to: '/membres', label: 'Membres', icon: 'users', perm: 'pastoral:members:voir' },
      { to: '/cellules', label: 'Cellules', icon: 'church', perm: 'pastoral:cells:voir' },
      { to: '/visites', label: 'Visites', icon: 'ops', perm: 'pastoral:visits:voir' },
      { to: '/formations', label: 'Formations', icon: 'report', perm: 'pastoral:trainings:voir' },
    ],
  },
  {
    title: 'Pilotage',
    items: [
      { to: '/', label: 'Tableau de bord', icon: 'dash', perms: ['finance:reports:voir', 'finance:operations:voir'] },
      { to: '/pastoral', label: 'Dashboard pastoral', icon: 'pastoral', perm: 'finance:reports:voir' },
      { to: '/rapports', label: 'Rapports', icon: 'report', perm: 'finance:reports:voir' },
    ],
  },
  {
    title: 'Opérations',
    items: [
      { to: '/operations', label: 'Opérations', icon: 'ops', perm: 'finance:operations:voir' },
      { to: '/enveloppes', label: 'Enveloppes', icon: 'cat', perm: 'finance:operations:voir' },
      { to: '/promesses', label: 'Promesses de foi', icon: 'fund', perm: 'finance:operations:voir' },
      { to: '/comptage', label: 'Comptage', icon: 'ops', perm: 'finance:operations:voir' },
      { to: '/caisse', label: 'Caisse', icon: 'fund', perm: 'finance:operations:voir' },
      { to: '/banque', label: 'Banque', icon: 'fund', perm: 'finance:operations:voir' },
    ],
  },
  {
    title: 'Paramétrage',
    items: [
      { to: '/rubriques', label: 'Rubriques', icon: 'cat', perms: ['finance:operations:voir', 'finance:operations:modifier'] },
      { to: '/fonds', label: 'Fonds dédiés', icon: 'fund', fundsFeature: true, perm: 'finance:operations:voir' },
      { to: '/evenements', label: 'Événements', icon: 'ops', perm: 'finance:operations:voir' },
      { to: '/taux', label: 'Taux de change', icon: 'fx', perms: ['finance:exchange-rates:modifier', 'finance:operations:voir'] },
      { to: '/budgets', label: 'Budgets', icon: 'chart', perm: 'finance:reports:voir' },
      { to: '/clotures', label: 'Clôtures', icon: 'lock', perm: 'finance:operations:modifier' },
      { to: '/syntheses', label: 'Synthèses', icon: 'chart', perm: 'finance:reports:voir' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/eglises', label: 'Églises', icon: 'church', perm: 'admin:churches:administrer' },
      { to: '/utilisateurs', label: 'Utilisateurs', icon: 'users', perm: 'admin:users:administrer' },
      { to: '/securite', label: 'Sécurité', icon: 'lock' },
      { to: '/cloud', label: 'Cloud', icon: 'chart', superAdminOnly: true },
      { to: '/corbeille', label: 'Corbeille', icon: 'trash', perm: 'finance:operations:restaurer' },
      { to: '/audit', label: 'Audit', icon: 'audit', perm: 'finance:audit:voir' },
      { to: '/aide', label: 'Aide', icon: 'report' },
    ],
  },
];

export function Layout() {
  const { user, hasPermission, isSuperAdmin, switchChurch, logout } = useAuth();
  const fundsEnabled = useFundsEnabled();
  const canManageFundsOption = useCanManageFundsOption();
  const [taux, setTaux] = useState<TauxDuJour | null | undefined>(undefined);
  const [switchingChurch, setSwitchingChurch] = useState(false);
  const [notifications, setNotifications] = useState<import('../api/client').AppNotification[]>([]);
  const [updateBanner, setUpdateBanner] = useState('');
  const horloge = useHorloge();

  const egliseNom = user?.churchName ?? user?.churches?.find((c) => c.church_id === user.churchId)?.name ?? 'Église';
  const rolePrincipal = user?.roles[0] ? libellerRole(user.roles[0]) : '';
  const churchOptions = user?.churches ?? [];
  const showChurchPicker = !!user && (isSuperAdmin() || churchOptions.length > 1);

  const handleChurchChange = async (churchId: string) => {
    if (!user || churchId === user.churchId || switchingChurch) return;
    setSwitchingChurch(true);
    try {
      await switchChurch(churchId);
    } finally {
      setSwitchingChurch(false);
    }
  };

  useEffect(() => {
    setTaux(undefined);
    api.getTauxDuJour().then((r) => setTaux(r.data)).catch(() => setTaux(null));
    api.getNotifications().then((r) => setNotifications(r.data)).catch(() => setNotifications([]));
    api.getAppVersion().then((r) => {
      const v = r.data;
      if (v.updateUrl) {
        setUpdateBanner(`Mise à jour disponible — consultez ${v.updateUrl}`);
      }
    }).catch(() => undefined);
    const iv = setInterval(() => {
      api.getTauxDuJour().then((r) => setTaux(r.data)).catch(() => setTaux(null));
    }, 60_000);
    return () => clearInterval(iv);
  }, [user?.churchId]);

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((n) => {
      if (n.superAdminOnly && !isSuperAdmin()) return false;
      if (n.fundsFeature && !fundsEnabled && !canManageFundsOption) return false;
      if (n.perms && !n.perms.some((p) => hasPermission(p))) return false;
      if (n.perm && !hasPermission(n.perm)) return false;
      return true;
    }),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>TM</div>
          <div>
            <h1>{egliseNom}</h1>
            <p>Gestion financière institutionnelle</p>
          </div>
        </div>
        {user && (
          <div className="user-bar">
            <div className="user-name">{user.fullName}</div>
            <div className="user-role">{rolePrincipal}</div>
            {showChurchPicker ? (
              <select
                className="church-select"
                value={user.churchId}
                disabled={switchingChurch}
                onChange={(e) => handleChurchChange(e.target.value)}
                title="Changer d'église active"
              >
                {churchOptions.map((c) => (
                  <option key={c.church_id} value={c.church_id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <div className="church-name">{egliseNom}</div>
            )}
            {isSuperAdmin() && churchOptions.length > 1 && (
              <div className="church-admin-hint">Accès à toutes les églises</div>
            )}
            <button type="button" className="btn-logout" onClick={() => logout()}>
              Déconnexion
            </button>
          </div>
        )}
        <nav className="sidebar-nav">
          {visibleSections.map((section) => (
            <div key={section.title} className="nav-section">
              <div className="nav-section-title">{section.title}</div>
              {section.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <span className={`nav-icon nav-icon-${n.icon}`} aria-hidden />
                  {n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-date">{horloge}</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="top-bar">
          <div className="top-bar-left">
            {showChurchPicker && (
              <label className="top-bar-church">
                <span className="top-bar-label">Église active</span>
                <select
                  className="top-bar-church-select"
                  value={user?.churchId ?? ''}
                  disabled={switchingChurch}
                  onChange={(e) => handleChurchChange(e.target.value)}
                >
                  {churchOptions.map((c) => (
                    <option key={c.church_id} value={c.church_id}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
            <span className="top-bar-label">Marché des changes</span>
            {taux === undefined ? (
              <span className="no-rate">Chargement du taux…</span>
            ) : taux ? (
              <span className="top-bar-rate">
                <strong>{taux.display}</strong>
                <span className="rate-sep">|</span>
                <span>{taux.inverseDisplay}</span>
                <span className="rate-date">({taux.effectiveDate})</span>
              </span>
            ) : (
              <span className="no-rate">Taux non défini pour aujourd&apos;hui</span>
            )}
          </div>
          <div className="top-bar-right">
            <span className="session-badge">Session active</span>
            <span className="top-user">{user?.email}</span>
          </div>
        </header>
        <main className="main">
          {notifications.length > 0 && (
            <div className="notifications-bar">
              {notifications.map((n) => (
                <div key={n.id} className={`notification-item notification-${n.severity}`}>
                  <strong>{n.title}</strong>
                  <span>{n.message}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.markNotificationRead(n.id).then(() => setNotifications((prev) => prev.filter((x) => x.id !== n.id)))}>OK</button>
                </div>
              ))}
            </div>
          )}
          {updateBanner && <div className="update-banner">{updateBanner}</div>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
