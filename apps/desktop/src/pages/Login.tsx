import { FormEvent, useState } from 'react';
import { APP_NAME } from '../constants/branding';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useHorloge } from '../hooks/useHorloge';

const COURRIEL_KEY = 'tabernacle_dernier_courriel';

export function Login() {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem(COURRIEL_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const horloge = useHorloge();

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
        <p className="login-hint">
          Mode local-first — données sur cet ordinateur. Connexion chiffrée, accès réservé aux utilisateurs autorisés.
        </p>
      </div>
    </div>
  );
}
