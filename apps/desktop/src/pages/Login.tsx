import { FormEvent, useEffect, useState } from 'react';
import { APP_NAME } from '../constants/branding';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useHorloge } from '../hooks/useHorloge';
import { api } from '../api/client';

const COURRIEL_KEY = 'tabernacle_dernier_courriel';

export function Login() {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem(COURRIEL_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);
  const horloge = useHorloge();

  useEffect(() => {
    api.getOAuthProviders().then((r) => setOauthProviders(r.data)).catch(() => setOauthProviders([]));
  }, []);

  if (!loading && user) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      localStorage.setItem(COURRIEL_KEY, email.trim().toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const startOAuth = (provider: string) => {
    const returnUrl = `${window.location.origin}/oauth/callback`;
    window.location.href = `/api/v1/oauth/${provider}/start?returnUrl=${encodeURIComponent(returnUrl)}`;
  };

  return (
    <div className="login-page">
      <div className="login-backdrop" />
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark brand-mark-lg">TM</div>
          <div>
            <h1>{APP_NAME}</h1>
            <p>Portail financier sécurisé</p>
          </div>
        </div>
        <p className="login-datetime">{horloge}</p>
        <form onSubmit={onSubmit} className="login-form">
          <label>
            Courriel professionnel
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="votre@courriel.com"
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </label>
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Authentification…' : 'Accéder à l\'espace financier'}
          </button>
        </form>

        {oauthProviders.length > 0 && (
          <div className="oauth-buttons" style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', textAlign: 'center' }}>Ou connectez-vous avec</p>
            {oauthProviders.includes('google') && (
              <button type="button" className="btn btn-ghost btn-block" onClick={() => startOAuth('google')}>
                Google
              </button>
            )}
            {oauthProviders.includes('microsoft') && (
              <button type="button" className="btn btn-ghost btn-block" onClick={() => startOAuth('microsoft')}>
                Microsoft
              </button>
            )}
          </div>
        )}

        <p className="login-hint">
          Mode local-first — données sur cet ordinateur. Connexion chiffrée, accès réservé aux utilisateurs autorisés.
        </p>
      </div>
    </div>
  );
}
