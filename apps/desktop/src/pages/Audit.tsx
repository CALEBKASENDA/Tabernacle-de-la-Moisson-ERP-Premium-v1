import { useEffect, useState } from 'react';
import { api, type AuditEntry } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';

export function Audit() {
  const churchId = useChurchScope();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    dateFrom: '',
    dateTo: '',
    actorUserId: '',
  });

  const load = () => {
    const params = {
      limit: 200,
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
      ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
      ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
    };
    api.getAudit(params).then((r) => setEntries(r.data)).catch((e) => setError(e.message));
  };

  useEffect(() => { if (churchId) load(); }, [churchId]);

  return (
    <>
      <div className="page-header"><h2>Journal d&apos;audit</h2></div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h3>Filtres</h3>
        <form
          onSubmit={(e) => { e.preventDefault(); load(); }}
          className="form-grid"
        >
          <label>
            Action
            <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
              <option value="">Toutes</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="RESTORE">RESTORE</option>
            </select>
          </label>
          <label>
            Type d&apos;entité
            <input value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })} placeholder="financial_operation…" />
          </label>
          <label>
            Du
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
          </label>
          <label>
            Au
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
          </label>
          <label>
            Utilisateur (ID)
            <input value={filters.actorUserId} onChange={(e) => setFilters({ ...filters, actorUserId: e.target.value })} />
          </label>
          <div style={{ alignSelf: 'end', display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary">Filtrer</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setFilters({ action: '', entityType: '', dateFrom: '', dateTo: '', actorUserId: '' }); setTimeout(load, 0); }}>Réinitialiser</button>
          </div>
        </form>
      </div>

      <div className="panel table-scroll">
        <table>
          <thead>
            <tr><th>Date</th><th>Action</th><th>Entité</th><th>ID</th><th>Utilisateur</th></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.audit_id}>
                <td>{new Date(e.changed_at).toLocaleString('fr-FR')}</td>
                <td><code>{e.action}</code></td>
                <td>{e.entity_type}</td>
                <td style={{ fontSize: '0.75rem' }}>{e.entity_id.slice(0, 24)}{e.entity_id.length > 24 ? '…' : ''}</td>
                <td>{e.actor_user_id}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune entrée</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
