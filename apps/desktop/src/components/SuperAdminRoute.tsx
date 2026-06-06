import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Routes réservées à l'administrateur principal (SUPER_ADMIN). */
export function SuperAdminRoute() {
  const { user, isSuperAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin()) {
    return (
      <div className="error-msg" style={{ margin: '1.5rem' }}>
        Accès refusé — réservé à l&apos;administrateur principal.
      </div>
    );
  }
  return <Outlet />;
}
