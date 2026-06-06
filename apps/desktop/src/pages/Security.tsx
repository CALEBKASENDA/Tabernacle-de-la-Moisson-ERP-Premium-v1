import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { libellerPermission, libellerRole } from '../i18n/fr';

export function Security() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  if (!user) return null;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    if (newPassword !== confirmPassword) {
      setPwdError('Les mots de passe ne correspondent pas');
      return;
    }
    if (newPassword.length < 8) {
      setPwdError('Le nouveau mot de passe doit contenir au moins 8 caractères');
      return;
    }
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwdSuccess('Mot de passe modifié avec succès');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Sécurité et session</h2>
      </div>

      <div className="cards" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="card-label">Utilisateur connecté</div>
          <div className="card-value" style={{ fontSize: '1rem' }}>{user.fullName}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>{user.email}</div>
        </div>
        <div className="card">
          <div className="card-label">Église active</div>
          <div className="card-value" style={{ fontSize: '1rem' }}>{user.churchName ?? user.churchId}</div>
        </div>
        <div className="card">
          <div className="card-label">Rôles</div>
          <div className="card-value" style={{ fontSize: '0.9rem' }}>
            {user.roles.map(libellerRole).join(', ') || '—'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Identifiant de session</div>
          <div className="card-value" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{user.sessionId}</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '1.5rem' }}>
        <h3>Changer le mot de passe</h3>
        {pwdError && <div className="error-msg">{pwdError}</div>}
        {pwdSuccess && <div className="success-msg">{pwdSuccess}</div>}
        <form onSubmit={handleChangePassword} className="form-grid" style={{ maxWidth: 480 }}>
          <div className="form-group">
            <label>Mot de passe actuel</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <div className="form-group">
            <label>Nouveau mot de passe</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoComplete="new-password" />
          </div>
          <div className="form-group">
            <label>Confirmer le nouveau mot de passe</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
          </div>
          <button type="submit" className="btn btn-primary">Mettre à jour le mot de passe</button>
        </form>
      </div>

      <div className="panel">
        <h3>Droits et permissions</h3>
        <ul className="perm-list">
          {user.permissions.map((p) => (
            <li key={p}>{libellerPermission(p)}</li>
          ))}
          {user.permissions.length === 0 && (
            <li style={{ color: 'var(--muted)' }}>Aucune permission attribuée</li>
          )}
        </ul>
      </div>

      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <h3>Contrôles de sécurité actifs</h3>
        <ul className="security-checklist">
          <li>Authentification par courriel et mot de passe sécurisé</li>
          <li>Sessions serveur avec traçabilité dans le journal d&apos;audit</li>
          <li>Gestion des droits par rôles et permissions par église</li>
          <li>Accès protégé — connexion obligatoire pour toutes les opérations financières</li>
          <li>Isolation des données entre églises</li>
        </ul>
      </div>
    </>
  );
}
