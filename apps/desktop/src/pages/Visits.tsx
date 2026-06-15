import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';

type Visit = {
  visit_id: string;
  visitor_name: string;
  visit_date: string;
  visit_type: string;
  notes: string | null;
};

export function Visits() {
  const churchId = useChurchScope();
  const [items, setItems] = useState<Visit[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    visitorName: '',
    visitDate: new Date().toISOString().slice(0, 10),
    visitType: 'domicile',
    notes: '',
  });

  const load = () => api.getVisits().then((r) => setItems(r.data)).catch((e) => setError(e.message));

  useEffect(() => {
    if (churchId) load();
  }, [churchId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createVisit(form);
      setForm({ visitorName: '', visitDate: new Date().toISOString().slice(0, 10), visitType: 'domicile', notes: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header"><h2>Visites pastorales</h2></div>
      {error && <div className="error-msg">{error}</div>}
      <div className="panel">
        <form onSubmit={handleCreate} className="form-grid">
          <div className="form-group"><label>Personne visitée</label><input value={form.visitorName} onChange={(e) => setForm({ ...form, visitorName: e.target.value })} required /></div>
          <div className="form-group"><label>Date</label><input type="date" value={form.visitDate} onChange={(e) => setForm({ ...form, visitDate: e.target.value })} required /></div>
          <div className="form-group"><label>Type</label>
            <select value={form.visitType} onChange={(e) => setForm({ ...form, visitType: e.target.value })}>
              <option value="domicile">Domicile</option>
              <option value="hopital">Hôpital</option>
              <option value="prison">Prison</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <button type="submit" className="btn btn-primary">Enregistrer</button>
        </form>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Date</th><th>Personne</th><th>Type</th><th>Notes</th></tr></thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.visit_id}><td>{v.visit_date}</td><td>{v.visitor_name}</td><td>{v.visit_type}</td><td>{v.notes ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
