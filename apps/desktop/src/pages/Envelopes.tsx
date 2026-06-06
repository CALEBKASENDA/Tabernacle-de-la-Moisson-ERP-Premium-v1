import { useEffect, useState } from 'react';
import { api, type Category, type Envelope, type Fund } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';
import { useFundsEnabled } from '../hooks/useFundsEnabled';
import { FundSelect } from '../components/FundSelect';
import { fmtMontant } from '../utils/format';

export function Envelopes() {
  const churchId = useChurchScope();
  const fundsEnabled = useFundsEnabled();
  const [items, setItems] = useState<Envelope[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    categoryId: '',
    fundId: '',
    amountMin: '',
    amountMax: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    follower: '',
    envelopeDate: new Date().toISOString().slice(0, 10),
    categoryId: '',
    fundId: '',
    amountCdf: '0',
    amountUsd: '0',
    observation: '',
  });

  const load = (override?: Partial<typeof filters & { q?: string }>) => {
    const q = override?.q ?? search.trim();
    const f = { ...filters, ...override };
    const params = {
      ...(q ? { q } : {}),
      ...(f.dateFrom ? { dateFrom: f.dateFrom } : {}),
      ...(f.dateTo ? { dateTo: f.dateTo } : {}),
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.fundId ? { fundId: f.fundId } : {}),
      ...(f.amountMin ? { amountMin: f.amountMin } : {}),
      ...(f.amountMax ? { amountMax: f.amountMax } : {}),
    };
    Promise.all([
      api.getEnvelopes(Object.keys(params).length ? params : undefined),
      api.getCategories(),
      fundsEnabled ? api.getFunds() : Promise.resolve({ data: [] as Fund[] }),
    ])
      .then(([env, cat, fnd]) => {
        setItems(env.data);
        setCategories(cat.data);
        setFunds(fnd.data);
        if (!form.categoryId && cat.data[0]) setForm((p) => ({ ...p, categoryId: cat.data[0].category_id }));
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => { if (churchId) load(); }, [churchId, fundsEnabled]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const r = await api.createEnvelope({ ...form, fundId: form.fundId || null });
      setSuccess(`Enveloppe créée : ${r.data.envelopeNumber}`);
      setForm((p) => ({ ...p, follower: '', amountCdf: '0', amountUsd: '0', observation: '' }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header"><h2>Enveloppes</h2></div>
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="panel">
        <h3>Recherche avancée</h3>
        <form onSubmit={handleSearch} className="form-grid">
          <label>
            Fidèle ou numéro
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" />
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
            Rubrique
            <select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}>
              <option value="">Toutes</option>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          </label>
          {fundsEnabled && (
            <label>
              Fonds
              <select value={filters.fundId} onChange={(e) => setFilters({ ...filters, fundId: e.target.value })}>
                <option value="">Tous</option>
                {funds.map((f) => <option key={f.fund_id} value={f.fund_id}>{f.name}</option>)}
              </select>
            </label>
          )}
          <label>
            Montant min (CDF)
            <input type="number" step="0.01" value={filters.amountMin} onChange={(e) => setFilters({ ...filters, amountMin: e.target.value })} />
          </label>
          <label>
            Montant max (CDF)
            <input type="number" step="0.01" value={filters.amountMax} onChange={(e) => setFilters({ ...filters, amountMax: e.target.value })} />
          </label>
          <div style={{ alignSelf: 'end', display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary">Rechercher</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setSearch(''); setFilters({ dateFrom: '', dateTo: '', categoryId: '', fundId: '', amountMin: '', amountMax: '' }); load({ q: '', dateFrom: '', dateTo: '', categoryId: '', fundId: '', amountMin: '', amountMax: '' }); }}>Réinitialiser</button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h3>Nouvelle enveloppe</h3>
        <form onSubmit={handleCreate} className="form-grid">
          <div className="form-group">
            <label>Fidèle</label>
            <input value={form.follower} onChange={(e) => setForm({ ...form, follower: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.envelopeDate} onChange={(e) => setForm({ ...form, envelopeDate: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Rubrique</label>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          </div>
          {fundsEnabled && (
          <div className="form-group">
            <label>Fonds dédié <span className="field-hint">(facultatif)</span></label>
            <FundSelect funds={funds} value={form.fundId} onChange={(fundId) => setForm({ ...form, fundId })} />
          </div>
          )}
          <div className="form-group">
            <label>Montant CDF</label>
            <input type="number" step="0.01" min="0" value={form.amountCdf} onChange={(e) => setForm({ ...form, amountCdf: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Montant USD</label>
            <input type="number" step="0.01" min="0" value={form.amountUsd} onChange={(e) => setForm({ ...form, amountUsd: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Observation</label>
            <input value={form.observation} onChange={(e) => setForm({ ...form, observation: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary">Enregistrer</button>
        </form>
      </div>

      <div className="panel table-scroll">
        <table>
          <thead>
            <tr><th>Numéro</th><th>Date</th><th>Fidèle</th><th>Montant CDF</th><th>USD conv.</th><th>USD</th></tr>
          </thead>
          <tbody>
            {items.map((env) => (
              <tr key={env.envelope_id}>
                <td><code>{env.envelope_number}</code></td>
                <td>{env.envelope_date}</td>
                <td>{env.follower}</td>
                <td>{fmtMontant(env.amount_cdf)}</td>
                <td>{env.amount_usd_converted}</td>
                <td>{env.amount_usd ?? '0'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune enveloppe</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
