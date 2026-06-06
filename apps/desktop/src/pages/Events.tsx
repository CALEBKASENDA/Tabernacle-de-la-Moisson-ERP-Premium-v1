import { useEffect, useState } from 'react';
import { api, type ChurchEvent } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';

export function Events() {
  const churchId = useChurchScope();
  const [items, setItems] = useState<ChurchEvent[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    eventType: 'CULTE',
    title: '',
    eventDate: new Date().toISOString().slice(0, 10),
  });

  const load = () => api.getEvents().then((r) => setItems(r.data)).catch((e) => setError(e.message));
  useEffect(() => { if (churchId) load(); }, [churchId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      await api.createEvent(form);
      setForm((f) => ({ ...f, title: '' }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header"><h2>Événements</h2></div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h3>Nouvel événement</h3>
        <form onSubmit={handleCreate} className="form-grid">
          <div className="form-group">
            <label>Type</label>
            <select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })}>
              <option value="CULTE">Culte</option>
              <option value="CONFERENCE">Conférence</option>
              <option value="SEMINAIRE">Séminaire</option>
              <option value="AUTRE">Autre</option>
            </select>
          </div>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} required />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Titre</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-primary">Enregistrer</button>
        </form>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr><th>Date</th><th>Type</th><th>Titre</th><th>Créé le</th></tr>
          </thead>
          <tbody>
            {items.map((ev) => (
              <tr key={ev.event_id}>
                <td>{ev.event_date}</td>
                <td><span className="badge badge-muted">{ev.event_type}</span></td>
                <td>{ev.title}</td>
                <td>{ev.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucun événement</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
