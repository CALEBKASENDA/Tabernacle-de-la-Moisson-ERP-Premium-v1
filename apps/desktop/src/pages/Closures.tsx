import { useEffect, useState } from 'react';
import { api, type FinancialClosure } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';

export function Closures() {
  const churchId = useChurchScope();
  const [items, setItems] = useState<FinancialClosure[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    closureType: 'MONTH' as 'MONTH' | 'QUARTER' | 'YEAR',
    periodStart: '',
    periodEnd: '',
    notes: '',
  });

  const load = () => api.getClosures().then((r) => setItems(r.data)).catch((e) => setError(e.message));
  useEffect(() => { if (churchId) load(); }, [churchId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.periodStart || !form.periodEnd) return;
    if (!confirm('Confirmer la clôture de cette période ? Les modifications seront bloquées.')) return;
    try {
      await api.createClosure({
        closureType: form.closureType,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        notes: form.notes || undefined,
      });
      setForm((p) => ({ ...p, notes: '' }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const typeLabel: Record<string, string> = {
    MONTH: 'Mensuelle',
    QUARTER: 'Trimestrielle',
    YEAR: 'Annuelle',
  };

  return (
    <>
      <div className="page-header"><h2>Clôtures financières</h2></div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h3>Nouvelle clôture</h3>
        <form onSubmit={handleCreate} className="form-grid">
          <div className="form-group">
            <label>Type</label>
            <select value={form.closureType} onChange={(e) => setForm({ ...form, closureType: e.target.value as typeof form.closureType })}>
              <option value="MONTH">Mensuelle</option>
              <option value="QUARTER">Trimestrielle</option>
              <option value="YEAR">Annuelle</option>
            </select>
          </div>
          <div className="form-group">
            <label>Début de période</label>
            <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Fin de période</label>
            <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary">Clôturer la période</button>
        </form>
      </div>

      <div className="panel table-scroll">
        <h3>Historique</h3>
        <table>
          <thead>
            <tr><th>Type</th><th>Période</th><th>Statut</th><th>Clôturée le</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.closure_id}>
                <td>{typeLabel[c.closure_type] ?? c.closure_type}</td>
                <td>{c.period_start} → {c.period_end}</td>
                <td><span className="badge badge-success">{c.status}</span></td>
                <td>{c.closed_at?.slice(0, 10)}</td>
                <td>{c.notes ?? '—'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune clôture</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
