import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';

type Cell = {
  cell_id: string;
  name: string;
  meeting_day: string | null;
  meeting_time: string | null;
  location: string | null;
  status: string;
};

export function Cells() {
  const churchId = useChurchScope();
  const [items, setItems] = useState<Cell[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', meetingDay: '', meetingTime: '', location: '' });

  const load = () => api.getCells().then((r) => setItems(r.data)).catch((e) => setError(e.message));

  useEffect(() => {
    if (churchId) load();
  }, [churchId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCell(form);
      setForm({ name: '', meetingDay: '', meetingTime: '', location: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header"><h2>Cellules de maison</h2></div>
      {error && <div className="error-msg">{error}</div>}
      <div className="panel">
        <h3>Nouvelle cellule</h3>
        <form onSubmit={handleCreate} className="form-grid">
          <div className="form-group"><label>Nom</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="form-group"><label>Jour de réunion</label><input value={form.meetingDay} onChange={(e) => setForm({ ...form, meetingDay: e.target.value })} placeholder="Mercredi" /></div>
          <div className="form-group"><label>Heure</label><input value={form.meetingTime} onChange={(e) => setForm({ ...form, meetingTime: e.target.value })} placeholder="18:00" /></div>
          <div className="form-group"><label>Lieu</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <button type="submit" className="btn btn-primary">Enregistrer</button>
        </form>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Nom</th><th>Jour</th><th>Heure</th><th>Lieu</th></tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.cell_id}><td>{c.name}</td><td>{c.meeting_day ?? '—'}</td><td>{c.meeting_time ?? '—'}</td><td>{c.location ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
