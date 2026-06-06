import { useEffect, useState } from 'react';
import { api, type CashBox, type CashSession, type CashTransaction, type Category } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';
import { fmtMontant } from '../utils/format';

export function Cash() {
  const churchId = useChurchScope();
  const [boxes, setBoxes] = useState<CashBox[]>([]);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [openForm, setOpenForm] = useState({
    cashBoxId: '',
    openDate: new Date().toISOString().slice(0, 10),
    openingBalanceCdf: '0',
    openingBalanceUsd: '0',
  });
  const [closeForm, setCloseForm] = useState({ sessionId: '', closingBalanceCdf: '0', closingBalanceUsd: '0', notes: '' });
  const [txSessionId, setTxSessionId] = useState('');
  const [txForm, setTxForm] = useState({
    txDate: new Date().toISOString().slice(0, 10),
    label: '',
    categoryId: '',
    receiptsCdf: '0',
    receiptsUsd: '0',
    expensesCdf: '0',
    expensesUsd: '0',
  });

  const load = () => {
    Promise.all([api.getCashBoxes(), api.getCashSessions(), api.getCategories()])
      .then(([b, s, c]) => {
        setBoxes(b.data);
        setSessions(s.data);
        setCategories(c.data);
        if (!openForm.cashBoxId && b.data[0]) setOpenForm((p) => ({ ...p, cashBoxId: b.data[0].cash_box_id }));
        if (!txForm.categoryId && c.data[0]) setTxForm((p) => ({ ...p, categoryId: c.data[0].category_id }));
        const open = s.data.find((x) => x.status === 'open');
        if (open && !txSessionId) setTxSessionId(open.cash_session_id);
      })
      .catch((e) => setError(e.message));
  };

  const loadTx = (sessionId: string) => {
    if (!sessionId) { setTransactions([]); return; }
    api.getCashTransactions(sessionId).then((r) => setTransactions(r.data)).catch((e) => setError(e.message));
  };

  useEffect(() => { if (churchId) load(); }, [churchId]);
  useEffect(() => { if (txSessionId) loadTx(txSessionId); }, [txSessionId]);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.openCashSession(openForm);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closeForm.sessionId) return;
    try {
      await api.closeCashSession(closeForm.sessionId, {
        closingBalanceCdf: closeForm.closingBalanceCdf,
        closingBalanceUsd: closeForm.closingBalanceUsd,
        notes: closeForm.notes || undefined,
      });
      setCloseForm({ sessionId: '', closingBalanceCdf: '0', closingBalanceUsd: '0', notes: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txSessionId) return;
    setError('');
    setSuccess('');
    try {
      const r = await api.createCashTransaction(txSessionId, txForm);
      setSuccess(`Mouvement enregistré : ${r.data.pieceNumber}`);
      setTxForm((p) => ({ ...p, label: '', receiptsCdf: '0', receiptsUsd: '0', expensesCdf: '0', expensesUsd: '0' }));
      loadTx(txSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const boxName = (id: string) => boxes.find((b) => b.cash_box_id === id)?.name ?? id;
  const openSessions = sessions.filter((s) => s.status === 'open');

  return (
    <>
      <div className="page-header"><h2>Caisse</h2></div>
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="cards" style={{ marginBottom: '1.5rem' }}>
        {boxes.map((b) => (
          <div key={b.cash_box_id} className="card">
            <div className="card-label">Caisse</div>
            <div className="card-value" style={{ fontSize: '1rem' }}>{b.name}</div>
          </div>
        ))}
        {boxes.length === 0 && (
          <div className="card"><div className="card-label">Aucune caisse configurée</div></div>
        )}
      </div>

      <div className="panel">
        <h3>Ouvrir une session</h3>
        <form onSubmit={handleOpen} className="form-grid">
          <div className="form-group">
            <label>Caisse</label>
            <select value={openForm.cashBoxId} onChange={(e) => setOpenForm({ ...openForm, cashBoxId: e.target.value })} required>
              {boxes.map((b) => <option key={b.cash_box_id} value={b.cash_box_id}>{b.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Date d&apos;ouverture</label>
            <input type="date" value={openForm.openDate} onChange={(e) => setOpenForm({ ...openForm, openDate: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Solde d&apos;ouverture CDF</label>
            <input type="number" step="0.01" min="0" value={openForm.openingBalanceCdf} onChange={(e) => setOpenForm({ ...openForm, openingBalanceCdf: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Solde d&apos;ouverture USD</label>
            <input type="number" step="0.01" min="0" value={openForm.openingBalanceUsd} onChange={(e) => setOpenForm({ ...openForm, openingBalanceUsd: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary">Ouvrir la session</button>
        </form>
      </div>

      {openSessions.length > 0 && (
        <div className="panel">
          <h3>Mouvement de caisse (session ouverte)</h3>
          <form onSubmit={handleTx} className="form-grid">
            <div className="form-group">
              <label>Session</label>
              <select value={txSessionId} onChange={(e) => setTxSessionId(e.target.value)} required>
                {openSessions.map((s) => (
                  <option key={s.cash_session_id} value={s.cash_session_id}>
                    {boxName(s.cash_box_id)} — {s.open_date}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={txForm.txDate} onChange={(e) => setTxForm({ ...txForm, txDate: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Libellé</label>
              <input value={txForm.label} onChange={(e) => setTxForm({ ...txForm, label: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Rubrique</label>
              <select value={txForm.categoryId} onChange={(e) => setTxForm({ ...txForm, categoryId: e.target.value })} required>
                {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Recettes CDF</label>
              <input type="number" step="0.01" min="0" value={txForm.receiptsCdf} onChange={(e) => setTxForm({ ...txForm, receiptsCdf: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Recettes USD</label>
              <input type="number" step="0.01" min="0" value={txForm.receiptsUsd} onChange={(e) => setTxForm({ ...txForm, receiptsUsd: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Dépenses CDF</label>
              <input type="number" step="0.01" min="0" value={txForm.expensesCdf} onChange={(e) => setTxForm({ ...txForm, expensesCdf: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Dépenses USD</label>
              <input type="number" step="0.01" min="0" value={txForm.expensesUsd} onChange={(e) => setTxForm({ ...txForm, expensesUsd: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary">Enregistrer le mouvement</button>
          </form>
          {transactions.length > 0 && (
            <table style={{ marginTop: '1rem' }}>
              <thead>
                <tr><th>Date</th><th>Pièce</th><th>Libellé</th><th>Rec. CDF</th><th>Rec. USD</th><th>Dép. CDF</th><th>Dép. USD</th></tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.cash_transaction_id}>
                    <td>{t.op_date}</td>
                    <td><code>{t.piece_number}</code></td>
                    <td>{t.label}</td>
                    <td>{fmtMontant(t.receipts_cdf)}</td>
                    <td>{t.receipts_usd}</td>
                    <td>{fmtMontant(t.expenses_cdf)}</td>
                    <td>{t.expenses_usd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="panel">
        <h3>Clôturer une session</h3>
        <form onSubmit={handleClose} className="form-grid">
          <div className="form-group">
            <label>Session ouverte</label>
            <select value={closeForm.sessionId} onChange={(e) => setCloseForm({ ...closeForm, sessionId: e.target.value })} required>
              <option value="">— Sélectionner —</option>
              {openSessions.map((s) => (
                <option key={s.cash_session_id} value={s.cash_session_id}>
                  {boxName(s.cash_box_id)} — {s.open_date}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Solde de clôture CDF</label>
            <input type="number" step="0.01" min="0" value={closeForm.closingBalanceCdf} onChange={(e) => setCloseForm({ ...closeForm, closingBalanceCdf: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Solde de clôture USD</label>
            <input type="number" step="0.01" min="0" value={closeForm.closingBalanceUsd} onChange={(e) => setCloseForm({ ...closeForm, closingBalanceUsd: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <input value={closeForm.notes} onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary">Clôturer</button>
        </form>
      </div>

      <div className="panel table-scroll">
        <h3>Historique des sessions</h3>
        <table>
          <thead>
            <tr><th>Caisse</th><th>Ouverture</th><th>Clôture</th><th>Solde ouv. CDF</th><th>Solde ouv. USD</th><th>Solde clôt. CDF</th><th>Solde clôt. USD</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.cash_session_id}>
                <td>{boxName(s.cash_box_id)}</td>
                <td>{s.open_date}</td>
                <td>{s.close_date ?? '—'}</td>
                <td>{fmtMontant(s.opening_balance_cdf)}</td>
                <td>{fmtMontant(s.opening_balance_usd ?? 0)}</td>
                <td>{s.closing_balance_cdf ? fmtMontant(s.closing_balance_cdf) : '—'}</td>
                <td>{s.closing_balance_usd ? fmtMontant(s.closing_balance_usd) : '—'}</td>
                <td>
                  <span className={`badge ${s.status === 'closed' ? 'badge-success' : 'badge-muted'}`}>
                    {s.status === 'closed' ? 'Clôturée' : 'Ouverte'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
