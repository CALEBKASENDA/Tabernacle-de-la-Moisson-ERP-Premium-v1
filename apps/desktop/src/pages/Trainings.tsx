import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';

type Training = {
  training_id: string;
  title: string;
  training_date: string;
  trainer: string | null;
  location: string | null;
};

export function Trainings() {
  const churchId = useChurchScope();
  const [items, setItems] = useState<Training[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    trainingDate: new Date().toISOString().slice(0, 10),
    trainer: '',
    location: '',
    description: '',
  });

  const load = () => api.getTrainings().then((r) => setItems(r.data)).catch((e) => setError(e.message));

  useEffect(() => {
    if (churchId) load();
  }, [churchId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createTraining(form);
      setForm({ title: '', trainingDate: new Date().toISOString().slice(0, 10), trainer: '', location: '', description: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header"><h2>Formations</h2></div>
      {error && <div className="error-msg">{error}</div>}
      <div className="panel">
        <form onSubmit={handleCreate} className="form-grid">
          <div className="form-group"><label>Titre</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
          <div className="form-group"><label>Date</label><input type="date" value={form.trainingDate} onChange={(e) => setForm({ ...form, trainingDate: e.target.value })} required /></div>
          <div className="form-group"><label>Formateur</label><input value={form.trainer} onChange={(e) => setForm({ ...form, trainer: e.target.value })} /></div>
          <div className="form-group"><label>Lieu</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <button type="submit" className="btn btn-primary">Planifier</button>
        </form>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Date</th><th>Titre</th><th>Formateur</th><th>Lieu</th></tr></thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.training_id}><td>{t.training_date}</td><td>{t.title}</td><td>{t.trainer ?? '—'}</td><td>{t.location ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
