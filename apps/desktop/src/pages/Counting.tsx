import { useEffect, useState } from 'react';
import { api, type Category, type CountingSession, type Fund } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';
import { useFundsEnabled } from '../hooks/useFundsEnabled';
import { FundSelect } from '../components/FundSelect';
import { fmtMontant } from '../utils/format';

export function Counting() {
  const churchId = useChurchScope();
  const fundsEnabled = useFundsEnabled();
  const [sessions, setSessions] = useState<CountingSession[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [error, setError] = useState('');
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState({ countingDate: new Date().toISOString().slice(0, 10), teamName: '' });
  const [lineForm, setLineForm] = useState({ categoryId: '', fundId: '', amountCdf: '0', amountUsd: '0' });

  const load = () => {
    Promise.all([
      api.getCountingSessions(),
      api.getCategories(),
      fundsEnabled ? api.getFunds() : Promise.resolve({ data: [] as Fund[] }),
    ])
      .then(([s, c, f]) => {
        setSessions(s.data);
        setCategories(c.data);
        setFunds(f.data);
        if (!lineForm.categoryId && c.data[0]) setLineForm((p) => ({ ...p, categoryId: c.data[0].category_id }));
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => { if (churchId) load(); }, [churchId, fundsEnabled]);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.openCountingSession(openForm);
      setActiveSession(r.data.countingSessionId);
      setOpenForm((p) => ({ ...p, teamName: '' }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    try {
      await api.addCountingLine(activeSession, { ...lineForm, fundId: lineForm.fundId || null });
      setLineForm((p) => ({ ...p, amountCdf: '0', amountUsd: '0' }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleValidate = async (sessionId: string) => {
    if (!confirm('Valider cette séance ? Des opérations seront générées.')) return;
    try {
      await api.validateCountingSession(sessionId);
      if (activeSession === sessionId) setActiveSession(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header"><h2>Comptage des offrandes</h2></div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h3>Ouvrir une séance</h3>
        <form onSubmit={handleOpen} className="inline-form">
          <label>
            Date
            <input type="date" value={openForm.countingDate} onChange={(e) => setOpenForm({ ...openForm, countingDate: e.target.value })} required />
          </label>
          <label>
            Équipe
            <input value={openForm.teamName} onChange={(e) => setOpenForm({ ...openForm, teamName: e.target.value })} placeholder="Équipe de comptage" required />
          </label>
          <button type="submit" className="btn btn-primary">Ouvrir</button>
        </form>
      </div>

      {activeSession && (
        <div className="panel">
          <h3>Ajouter une ligne — séance active</h3>
          <form onSubmit={handleAddLine} className="form-grid">
            <div className="form-group">
              <label>Rubrique</label>
              <select value={lineForm.categoryId} onChange={(e) => setLineForm({ ...lineForm, categoryId: e.target.value })} required>
                {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
              </select>
            </div>
            {fundsEnabled && (
            <div className="form-group">
              <label>Fonds dédié <span className="field-hint">(facultatif)</span></label>
              <FundSelect funds={funds} value={lineForm.fundId} onChange={(fundId) => setLineForm({ ...lineForm, fundId })} />
            </div>
            )}
            <div className="form-group">
              <label>Montant CDF</label>
              <input type="number" step="0.01" min="0" value={lineForm.amountCdf} onChange={(e) => setLineForm({ ...lineForm, amountCdf: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Montant USD</label>
              <input type="number" step="0.01" min="0" value={lineForm.amountUsd} onChange={(e) => setLineForm({ ...lineForm, amountUsd: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary">Ajouter la ligne</button>
          </form>
        </div>
      )}

      <div className="panel table-scroll">
        <table>
          <thead>
            <tr><th>Date</th><th>Équipe</th><th>Statut</th><th>Lignes</th><th>Total CDF</th><th>Total USD</th><th></th></tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.counting_session_id}>
                <td>{s.counting_date}</td>
                <td>{s.team_name}</td>
                <td>
                  <span className={`badge ${s.status === 'validated' ? 'badge-success' : 'badge-muted'}`}>
                    {s.status === 'validated' ? 'Validée' : 'Ouverte'}
                  </span>
                </td>
                <td>{s.nb_lignes}</td>
                <td>{fmtMontant(s.total_cdf ?? 0)}</td>
                <td>{fmtMontant(s.total_usd ?? 0)}</td>
                <td>
                  {s.status !== 'validated' && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => setActiveSession(s.counting_session_id)}>Sélectionner</button>
                      <button className="btn btn-primary btn-sm" onClick={() => handleValidate(s.counting_session_id)}>Valider</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune séance</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
