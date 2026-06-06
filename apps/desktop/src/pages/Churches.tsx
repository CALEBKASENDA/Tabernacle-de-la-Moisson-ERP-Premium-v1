import { FormEvent, useEffect, useState } from 'react';
import { api, type Church } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { libellerStatut } from '../i18n/fr';
import { useChurchScope } from '../hooks/useChurchScope';
import { useNavigate } from 'react-router-dom';

export function Churches() {
  const churchId = useChurchScope();
  const navigate = useNavigate();
  const { hasPermission, user, refresh, switchChurch, isSuperAdmin } = useAuth();
  const [churches, setChurches] = useState<Church[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const isSuperAdminUser = isSuperAdmin();

  const load = () => {
    api.getChurches().then((r) => setChurches(r.data)).catch((e) => setError(e.message));
  };

  useEffect(() => {
    if (churchId) load();
  }, [churchId]);

  if (!hasPermission('admin:churches:administrer')) {
    return <div className="error-msg">Accès refusé — permission administration des églises requise.</div>;
  }

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createChurch(name.trim());
      setName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const toggleFunds = async (c: Church, enabled: boolean) => {
    setSavingId(c.church_id);
    setError('');
    try {
      await api.updateChurch(c.church_id, { fundsEnabled: enabled });
      load();
      if (c.church_id === user?.churchId) await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingId(null);
    }
  };

  const openChurch = async (c: Church) => {
    if (c.church_id === user?.churchId) {
      navigate('/');
      return;
    }
    setOpeningId(c.church_id);
    setError('');
    try {
      await switchChurch(c.church_id);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Gestion des églises</h2>
        <p className="page-subtitle">La répartition par fonds est une option facultative, activable par église.</p>
      </div>
      {error && <div className="error-msg">{error}</div>}

      {isSuperAdminUser && (
        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <h3>Ajouter une église</h3>
          <form onSubmit={onCreate} className="inline-form">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de l'église" />
            <button type="submit" className="btn btn-primary">Créer</button>
          </form>
        </div>
      )}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Statut</th>
              <th>Répartition par fonds</th>
              <th>Créée le</th>
              {isSuperAdminUser && <th></th>}
            </tr>
          </thead>
          <tbody>
            {churches.map((c) => (
              <tr key={c.church_id} className={c.church_id === user?.churchId ? 'row-active' : undefined}>
                <td>{c.name}</td>
                <td>
                  <span className={`badge ${c.status === 'active' ? 'badge-success' : 'badge-muted'}`}>
                    {libellerStatut(c.status)}
                  </span>
                </td>
                <td>
                  <label className="user-access-role-chip" style={{ cursor: savingId === c.church_id ? 'wait' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!c.funds_enabled}
                      disabled={savingId === c.church_id}
                      onChange={(e) => toggleFunds(c, e.target.checked)}
                    />
                    {c.funds_enabled ? 'Activée' : 'Désactivée'}
                  </label>
                </td>
                <td>{c.created_at.slice(0, 10)}</td>
                {isSuperAdminUser && (
                  <td className="table-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={openingId === c.church_id}
                      onClick={() => openChurch(c)}
                    >
                      {c.church_id === user?.churchId
                        ? 'Église active'
                        : openingId === c.church_id
                          ? 'Ouverture…'
                          : 'Ouvrir'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {churches.length === 0 && (
              <tr><td colSpan={isSuperAdminUser ? 5 : 4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune église</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
