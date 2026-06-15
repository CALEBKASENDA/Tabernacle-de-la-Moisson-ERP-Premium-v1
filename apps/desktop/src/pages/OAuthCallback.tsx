import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthUser } from '../context/AuthContext';

const STORAGE_KEY = 'tabernacle_auth';

export function OAuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const sessionId = params.get('sessionId');
    const accessToken = params.get('accessToken');
    if (!sessionId || !accessToken) {
      setError('Réponse OAuth incomplète');
      return;
    }
    try {
      const user: AuthUser = {
        sessionId,
        accessToken,
        userId: params.get('userId') ?? '',
        email: params.get('email') ?? '',
        fullName: params.get('fullName') ?? '',
        churchId: params.get('churchId') ?? '',
        churchName: params.get('churchName') ?? '',
        roles: JSON.parse(params.get('roles') ?? '[]') as string[],
        permissions: JSON.parse(params.get('permissions') ?? '[]') as string[],
        fundsEnabled: params.get('fundsEnabled') === 'true',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      window.location.hash = '';
      navigate('/', { replace: true });
      window.location.reload();
    } catch {
      setError('Impossible de finaliser la connexion OAuth');
    }
  }, [navigate]);

  if (error) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="error-msg">{error}</div>
          <a href="/login" className="btn btn-primary">Retour à la connexion</a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <p style={{ color: 'var(--muted)' }}>Connexion en cours…</p>
      </div>
    </div>
  );
}
