import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { traduireErreur } from '../i18n/fr';

export type AuthUser = {
  userId: string;
  fullName: string;
  email: string;
  churchId: string;
  churchName?: string;
  roles: string[];
  permissions: string[];
  fundsEnabled?: boolean;
  sessionId: string;
  accessToken?: string;
  churches?: Array<{ church_id: string; name: string }>;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, churchId?: string) => Promise<void>;
  logout: () => Promise<void>;
  switchChurch: (churchId: string) => Promise<void>;
  hasPermission: (code: string) => boolean;
  isSuperAdmin: () => boolean;
  refresh: () => Promise<void>;
};

const STORAGE_KEY = 'tabernacle_auth';

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStored(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function saveStored(user: AuthUser | null): void {
  if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const user = loadStored();
  if (!user) return {};
  const headers: Record<string, string> = {
    'x-session-id': user.sessionId,
    'x-church-id': user.churchId,
    'x-user-id': user.userId,
    'x-workstation-id': 'workstation_local',
  };
  if (user.accessToken) {
    headers.Authorization = `Bearer ${user.accessToken}`;
  }
  return headers;
}

async function authRequest<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...options?.headers,
      },
    });
  } catch {
    throw new Error('Impossible de joindre l\'API. Vérifiez que l\'application est démarrée (icône ou raccourci Tabernacle).');
  }
  const text = await res.text();
  if (!text) {
    if (res.status === 502 || res.status === 504 || res.status === 0) {
      throw new Error('Serveur API indisponible. Relancez Tabernacle de la Moisson ERP.');
    }
    throw new Error(`Réponse vide du serveur (HTTP ${res.status})`);
  }
  let json: { error?: string } & T;
  try {
    json = JSON.parse(text) as { error?: string } & T;
  } catch {
    throw new Error(res.ok ? 'Réponse serveur invalide' : `Erreur serveur (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const msg = json.error?.trim();
    throw new Error(traduireErreur(msg && msg !== 'Internal Server Error' ? msg : `Erreur HTTP ${res.status}`));
  }
  return json;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadStored);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const stored = loadStored();
    if (!stored?.sessionId) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await authRequest<{ data: Omit<AuthUser, 'sessionId'> & { churches: AuthUser['churches'] } }>(
        '/auth/me'
      );
      const next: AuthUser = {
        ...res.data,
        sessionId: stored.sessionId,
        churchName: res.data.churches?.find((c) => c.church_id === res.data.churchId)?.name,
      };
      setUser(next);
      saveStored(next);
    } catch {
      setUser(null);
      saveStored(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (email: string, password: string, churchId?: string) => {
    const res = await authRequest<{
      data: {
        sessionId: string;
        userId: string;
        fullName: string;
        email: string;
        churchId: string;
        churchName: string;
        roles: string[];
        permissions: string[];
        accessToken?: string;
      };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, churchId }),
    });
    const next: AuthUser = { ...res.data };
    setUser(next);
    saveStored(next);
    await refresh();
  };

  const logout = async () => {
    try {
      await authRequest('/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      /* session may already be invalid */
    }
    setUser(null);
    saveStored(null);
  };

  const switchChurch = async (churchId: string) => {
    const res = await authRequest<{
      data: {
        churchId: string;
        churchName: string;
        roles: string[];
        permissions: string[];
        fundsEnabled: boolean;
        accessToken?: string;
        sessionId?: string;
        userId?: string;
        email?: string;
      };
    }>('/auth/switch-church', {
      method: 'POST',
      body: JSON.stringify({ churchId }),
    });
    if (!user) return;
    const next: AuthUser = {
      ...user,
      churchId: res.data.churchId,
      churchName: res.data.churchName,
      roles: res.data.roles,
      permissions: res.data.permissions,
      fundsEnabled: res.data.fundsEnabled,
      accessToken: res.data.accessToken ?? user.accessToken,
      sessionId: res.data.sessionId ?? user.sessionId,
    };
    setUser(next);
    saveStored(next);
  };

  const hasPermission = (code: string) => user?.permissions.includes(code) ?? false;
  const isSuperAdmin = () => user?.roles.includes('SUPER_ADMIN') ?? false;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchChurch, hasPermission, isSuperAdmin, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
