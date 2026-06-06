import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function PermissionRoute({
  perm,
  perms,
  superAdminOnly,
  children,
}: {
  perm?: string;
  perms?: string[];
  superAdminOnly?: boolean;
  children?: React.ReactNode;
}) {
  const { hasPermission, isSuperAdmin } = useAuth();

  if (superAdminOnly && !isSuperAdmin()) {
    return <div className="error-msg">Accès refusé — réservé à l&apos;administrateur principal.</div>;
  }
  if (perms && !perms.some((p) => hasPermission(p))) {
    return <div className="error-msg">Accès refusé — permission insuffisante.</div>;
  }
  if (perm && !hasPermission(perm)) {
    return <div className="error-msg">Accès refusé — permission insuffisante.</div>;
  }

  return children ? <>{children}</> : <Outlet />;
}

export function AuthOrRedirect({ to = '/login' }: { to?: string }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Chargement…</div>;
  if (!user) return <Navigate to={to} replace />;
  return <Outlet />;
}
