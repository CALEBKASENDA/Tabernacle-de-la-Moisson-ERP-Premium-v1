import { useAuth } from '../context/AuthContext';

/** Identifiant d'église actif — à inclure dans les dépendances useEffect pour recharger les données. */
export function useChurchScope(): string | undefined {
  const { user } = useAuth();
  return user?.churchId;
}
