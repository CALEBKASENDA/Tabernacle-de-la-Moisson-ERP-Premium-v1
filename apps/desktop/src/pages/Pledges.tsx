import { useEffect, useState } from 'react';
import { api, type Category, type Fund, type Pledge, type PledgeBalance, type PledgePayment } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';
import { useFundsEnabled } from '../hooks/useFundsEnabled';
import { FundSelect } from '../components/FundSelect';
import { fmtMontant } from '../utils/format';

export function Pledges() {
  const churchId = useChurchScope();
  const fundsEnabled = useFundsEnabled();
  const [items, setItems] = useState<Pledge[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [error, setError] = useState('');
  const [showPledgeForm, setShowPledgeForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailBalance, setDetailBalance] = useState<PledgeBalance | null>(null);
  const [detailPayments, setDetailPayments] = useState<PledgePayment[]>([]);
  const [pledgeForm, setPledgeForm] = useState({
    follower: '',
    pledgeAmountCdf: '0',
    pledgeAmountUsd: '0',
    startDate: '',
    endDate: '',
  });
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    amountCdf: '0',
    amountUsd: '0',
    categoryId: '',
    fundId: '',
    observation: '',
  });

  const load = () => {
    Promise.all([
      api.getPledges(),
      api.getCategories(),
      fundsEnabled ? api.getFunds() : Promise.resolve({ data: [] as Fund[] }),
    ])
      .then(([p, c, f]) => {
        setItems(p.data);
        setCategories(c.data);
        setFunds(f.data);
        if (!paymentForm.categoryId && c.data[0]) setPaymentForm((prev) => ({ ...prev, categoryId: c.data[0].category_id }));
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => { if (churchId) load(); }, [churchId, fundsEnabled]);

  const handleCreatePledge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createPledge({
        follower: pledgeForm.follower,
        pledgeAmountCdf: pledgeForm.pledgeAmountCdf,
        pledgeAmountUsd: pledgeForm.pledgeAmountUsd,
        startDate: pledgeForm.startDate || undefined,
        endDate: pledgeForm.endDate || undefined,
      });
      setShowPledgeForm(false);
      setPledgeForm({ follower: '', pledgeAmountCdf: '0', pledgeAmountUsd: '0', startDate: '', endDate: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const openDetail = async (pledgeId: string) => {
    setDetailId(pledgeId);
    try {
      const [bal, pays] = await Promise.all([
        api.getPledgeBalance(pledgeId),
        api.getPledgePayments(pledgeId),
      ]);
      setDetailBalance(bal.data);
      setDetailPayments(pays.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handlePayment = async (e: React.FormEvent, pledgeId: string) => {
    e.preventDefault();
    try {
      await api.addPledgePayment(pledgeId, { ...paymentForm, fundId: paymentForm.fundId || null });
      setShowPaymentForm(null);
      setPaymentForm((p) => ({ ...p, amountCdf: '0', amountUsd: '0', observation: '' }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Promesses de foi</h2>
        <button className="btn btn-primary" onClick={() => setShowPledgeForm(!showPledgeForm)}>
          {showPledgeForm ? 'Annuler' : '+ Nouvelle promesse'}
        </button>
      </div>
      {error && <div className="error-msg">{error}</div>}

      {showPledgeForm && (
        <div className="panel">
          <h3>Nouvelle promesse</h3>
          <form onSubmit={handleCreatePledge} className="form-grid">
            <div className="form-group">
              <label>Fidèle</label>
              <input value={pledgeForm.follower} onChange={(e) => setPledgeForm({ ...pledgeForm, follower: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Montant promis (CDF)</label>
              <input type="number" step="0.01" min="0" value={pledgeForm.pledgeAmountCdf} onChange={(e) => setPledgeForm({ ...pledgeForm, pledgeAmountCdf: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Montant promis (USD)</label>
              <input type="number" step="0.01" min="0" value={pledgeForm.pledgeAmountUsd} onChange={(e) => setPledgeForm({ ...pledgeForm, pledgeAmountUsd: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Début</label>
              <input type="date" value={pledgeForm.startDate} onChange={(e) => setPledgeForm({ ...pledgeForm, startDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Fin</label>
              <input type="date" value={pledgeForm.endDate} onChange={(e) => setPledgeForm({ ...pledgeForm, endDate: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary">Enregistrer</button>
          </form>
        </div>
      )}

      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fidèle</th>
              <th>Promis CDF</th>
              <th>Promis USD</th>
              <th>Versé CDF</th>
              <th>Versé USD</th>
              <th>Solde CDF</th>
              <th>Solde USD</th>
              <th>Période</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const promis = Number(p.pledge_amount_cdf);
              const promisUsd = Number(p.pledge_amount_usd ?? 0);
              const verse = Number(p.verse_cdf ?? 0);
              const verseUsd = Number(p.verse_usd ?? 0);
              const solde = promis - verse;
              const soldeUsd = promisUsd - verseUsd;
              return (
                <tr key={p.pledge_id}>
                  <td>{p.follower}</td>
                  <td>{fmtMontant(promis)}</td>
                  <td>{fmtMontant(promisUsd)}</td>
                  <td className="positive">{fmtMontant(verse)}</td>
                  <td className="positive">{fmtMontant(verseUsd)}</td>
                  <td className={solde > 0 ? 'negative' : 'positive'}>{fmtMontant(solde)}</td>
                  <td className={soldeUsd > 0 ? 'negative' : 'positive'}>{fmtMontant(soldeUsd)}</td>
                  <td>{p.start_date ?? '—'} → {p.end_date ?? '—'}</td>
                  <td className="actions-cell">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openDetail(p.pledge_id)}>Détail</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowPaymentForm(showPaymentForm === p.pledge_id ? null : p.pledge_id)}>
                      Versement
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune promesse</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showPaymentForm && (
        <div className="panel">
          <h3>Enregistrer un versement</h3>
          <form onSubmit={(e) => handlePayment(e, showPaymentForm)} className="form-grid">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Montant CDF</label>
              <input type="number" step="0.01" min="0" value={paymentForm.amountCdf} onChange={(e) => setPaymentForm({ ...paymentForm, amountCdf: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Montant USD</label>
              <input type="number" step="0.01" min="0" value={paymentForm.amountUsd} onChange={(e) => setPaymentForm({ ...paymentForm, amountUsd: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Rubrique</label>
              <select value={paymentForm.categoryId} onChange={(e) => setPaymentForm({ ...paymentForm, categoryId: e.target.value })} required>
                {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
              </select>
            </div>
            {fundsEnabled && (
            <div className="form-group">
              <label>Fonds dédié <span className="field-hint">(facultatif)</span></label>
              <FundSelect funds={funds} value={paymentForm.fundId} onChange={(fundId) => setPaymentForm({ ...paymentForm, fundId })} />
            </div>
            )}
            <button type="submit" className="btn btn-primary">Enregistrer le versement</button>
          </form>
        </div>
      )}

      {detailId && detailBalance && (
        <div className="modal-overlay" onClick={() => setDetailId(null)}>
          <div className="modal-panel modal-panel-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Détail promesse — {detailBalance.follower}</h3>
            <div className="cards" style={{ marginBottom: '1rem' }}>
              <div className="card">
                <div className="card-label">Promis (CDF)</div>
                <div className="card-value">{fmtMontant(Number(detailBalance.montantPromisCdf) / 1_000_000)}</div>
              </div>
              <div className="card">
                <div className="card-label">Versé (CDF)</div>
                <div className="card-value positive">{fmtMontant(Number(detailBalance.montantVerseCdf) / 1_000_000)}</div>
              </div>
              <div className="card">
                <div className="card-label">Reste (CDF)</div>
                <div className="card-value">{fmtMontant(Number(detailBalance.soldeRestantCdf) / 1_000_000)}</div>
              </div>
            </div>
            <h4>Historique des versements</h4>
            <table>
              <thead>
                <tr><th>Date</th><th>CDF</th><th>USD</th><th>Observation</th></tr>
              </thead>
              <tbody>
                {detailPayments.map((pay) => (
                  <tr key={pay.payment_id}>
                    <td>{pay.payment_date}</td>
                    <td>{fmtMontant(pay.amount_cdf)}</td>
                    <td>{fmtMontant(pay.amount_usd)}</td>
                    <td>{pay.observation ?? '—'}</td>
                  </tr>
                ))}
                {detailPayments.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucun versement</td></tr>
                )}
              </tbody>
            </table>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setDetailId(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
