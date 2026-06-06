import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading" style={{ padding: '2rem' }}>Vérification de la session…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
