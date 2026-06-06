import { useAuth } from '../context/AuthContext';

/** Répartition par fonds activée pour l'église courante. */
export function useFundsEnabled(): boolean {
  const { user } = useAuth();
  return user?.fundsEnabled ?? false;
}

/** Peut activer/désactiver l'option répartition par fonds. */
export function useCanManageFundsOption(): boolean {
  const { hasPermission, isSuperAdmin } = useAuth();
  return (
    isSuperAdmin() ||
    hasPermission('admin:churches:administrer') ||
    hasPermission('admin:users:administrer')
  );
}
