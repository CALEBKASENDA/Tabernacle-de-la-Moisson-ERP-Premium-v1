import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  'http://127.0.0.1:3847/api/v1';

const AUTH_KEY = 'tabernacle_mobile_auth';

export type AuthSession = {
  sessionId: string;
  accessToken: string;
  churchId: string;
  userId: string;
  fullName: string;
  email: string;
};

export async function loadSession(): Promise<AuthSession | null> {
  const raw = await AsyncStorage.getItem(AUTH_KEY);
  return raw ? (JSON.parse(raw) as AuthSession) : null;
}

export async function saveSession(session: AuthSession | null): Promise<void> {
  if (session) await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(session));
  else await AsyncStorage.removeItem(AUTH_KEY);
}

async function request<T>(path: string, options?: RequestInit, session?: AuthSession | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  if (session?.sessionId) headers['x-session-id'] = session.sessionId;
  if (session?.churchId) headers['x-church-id'] = session.churchId;
  if (session?.userId) headers['x-user-id'] = session.userId;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...options?.headers } });
  const json = (await res.json()) as { error?: string } & T;
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export const mobileApi = {
  login: (email: string, password: string) =>
    request<{
      data: AuthSession & {
        roles: string[];
        permissions: string[];
        churchName: string;
      };
    }>('/auth/token', { method: 'POST', body: JSON.stringify({ email, password }) }),

  getDashboard: (session: AuthSession) =>
    request<{ data: { soldeGlobalUsd: string; recettesJourUsd: string; depensesJourUsd: string } }>(
      '/finance/dashboard',
      undefined,
      session
    ),

  getOperations: (session: AuthSession) =>
    request<{ data: Array<{ operation_id: string; label: string; op_date: string; piece_number: string }> }>(
      '/finance/operations?dateFrom=' + new Date().toISOString().slice(0, 10),
      undefined,
      session
    ),

  getPastoralDashboard: (session: AuthSession) =>
    request<{ data: { totalMembers: number; cellsCount: number; visitsThisMonth: number } }>(
      '/pastoral/dashboard',
      undefined,
      session
    ),
};
