import { useEffect, useState } from 'react';
import { api, type ChurchMember } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';

export function Members() {
  const churchId = useChurchScope();
  const [items, setItems] = useState<ChurchMember[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    birthDate: '',
    gender: '',
    notes: '',
  });

  const load = async () => {
    const [listRes, dashRes] = await Promise.all([
      api.getMembers(search ? { q: search } : undefined),
      api.getPastoralMembersDashboard(),
    ]);
    setItems(listRes.data);
    setTotal(dashRes.data.totalMembers);
  };

  useEffect(() => {
    if (!churchId) return;
    load().catch((e) => setError(e instanceof Error ? e.message : 'Erreur'));
  }, [churchId, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) return;
    try {
      await api.createMember({
        fullName: form.fullName,
        phone: form.phone || undefined,
        email: form.email || undefined,
        birthDate: form.birthDate || undefined,
        gender: form.gender || undefined,
        notes: form.notes || undefined,
      });
      setForm({ fullName: '', phone: '', email: '', birthDate: '', gender: '', notes: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Membres</h2>
        <p className="page-subtitle">Registre pastoral des membres de l&apos;église ({total} actifs).</p>
      </div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h3>Nouveau membre</h3>
        <form onSubmit={handleCreate} className="form-grid">
          <div className="form-group">
            <label>Nom complet</label>
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Téléphone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Courriel</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Date de naissance</label>
            <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Genre</label>
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">—</option>
              <option value="M">Homme</option>
              <option value="F">Femme</option>
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <button type="submit" className="btn btn-primary">Enregistrer</button>
        </form>
      </div>

      <div className="panel">
        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label>Rechercher</label>
          <input
            type="search"
            placeholder="Nom, téléphone ou courriel…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Téléphone</th>
              <th>Courriel</th>
              <th>Naissance</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.member_id}>
                <td>{m.full_name}</td>
                <td>{m.phone ?? '—'}</td>
                <td>{m.email ?? '—'}</td>
                <td>{m.birth_date ?? '—'}</td>
                <td><span className="badge badge-muted">{m.status}</span></td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                  Aucun membre enregistré
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
