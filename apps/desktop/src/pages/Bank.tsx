import { useEffect, useState } from 'react';
import { api, type BankAccount, type BankReconciliation, type BankReconciliationMatch, type BankTransactionRow, type Category, type Fund } from '../api/client';
import { FundSelect } from '../components/FundSelect';
import { useChurchScope } from '../hooks/useChurchScope';
import { useFundsEnabled } from '../hooks/useFundsEnabled';

export function Bank() {
  const churchId = useChurchScope();
  const fundsEnabled = useFundsEnabled();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [reconciliations, setReconciliations] = useState<BankReconciliation[]>([]);
  const [recForm, setRecForm] = useState({
    bankAccountId: '',
    reconciliationDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [accountForm, setAccountForm] = useState({ name: '', iban: '', swift: '', currencyCode: 'CDF' });
  const [txForm, setTxForm] = useState({
    kind: 'DEPOT' as 'DEPOT' | 'RETRAIT' | 'VIREMENT',
    bankAccountId: '',
    toBankAccountId: '',
    txDate: new Date().toISOString().slice(0, 10),
    label: '',
    beneficiary: '',
    categoryId: '',
    fundId: '',
    amountCdf: '0',
    amountUsd: '0',
    observation: '',
  });
  const [activeRec, setActiveRec] = useState<BankReconciliation | null>(null);
  const [bankTx, setBankTx] = useState<BankTransactionRow[]>([]);
  const [matches, setMatches] = useState<BankReconciliationMatch[]>([]);
  const [matchForm, setMatchForm] = useState({
    bankTransactionId: '',
    externalStatementLineRef: '',
    matchedAmountCdf: '0',
  });

  const load = () => {
    Promise.all([
      api.getBankAccounts(),
      api.getCategories(),
      fundsEnabled ? api.getFunds() : Promise.resolve({ data: [] as Fund[] }),
      api.getBankReconciliations(),
    ])
      .then(([a, c, f, rec]) => {
        setAccounts(a.data);
        setCategories(c.data);
        setFunds(f.data);
        setReconciliations(rec.data);
        if (!txForm.bankAccountId && a.data[0]) setTxForm((p) => ({ ...p, bankAccountId: a.data[0].bank_account_id }));
        if (!recForm.bankAccountId && a.data[0]) setRecForm((p) => ({ ...p, bankAccountId: a.data[0].bank_account_id }));
        if (!txForm.categoryId && c.data[0]) setTxForm((p) => ({ ...p, categoryId: c.data[0].category_id }));
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => { if (churchId) load(); }, [churchId, fundsEnabled]);

  const openMatching = async (rec: BankReconciliation) => {
    setActiveRec(rec);
    setError('');
    try {
      const [tx, m] = await Promise.all([
        api.getBankTransactions(rec.bank_account_id),
        api.getReconciliationMatches(rec.bank_reconciliation_id),
      ]);
      setBankTx(tx.data);
      setMatches(m.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleAddMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRec) return;
    try {
      await api.addReconciliationMatch(activeRec.bank_reconciliation_id, {
        bankTransactionId: matchForm.bankTransactionId || null,
        externalStatementLineRef: matchForm.externalStatementLineRef,
        matchedAmountCdf: matchForm.matchedAmountCdf,
      });
      setMatchForm({ bankTransactionId: '', externalStatementLineRef: '', matchedAmountCdf: '0' });
      openMatching(activeRec);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createBankAccount({
        name: accountForm.name,
        iban: accountForm.iban || undefined,
        swift: accountForm.swift || undefined,
        currencyCode: accountForm.currencyCode,
      });
      setAccountForm({ name: '', iban: '', swift: '', currencyCode: 'CDF' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleTx = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const r = await api.createBankTransaction({
        ...txForm,
        fundId: txForm.fundId || null,
        beneficiary: txForm.beneficiary || undefined,
        observation: txForm.observation || undefined,
        toBankAccountId: txForm.kind === 'VIREMENT' ? txForm.toBankAccountId : undefined,
      });
      const piece = r.data.pieceNumber ?? r.data.from?.pieceNumber;
      setSuccess(`Transaction enregistrée${piece ? ` : ${piece}` : ''}`);
      setTxForm((p) => ({ ...p, label: '', beneficiary: '', amountCdf: '0', amountUsd: '0', observation: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header"><h2>Banque</h2></div>
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="panel">
        <h3>Comptes bancaires</h3>
        <table style={{ marginBottom: '1rem' }}>
          <thead>
            <tr><th>Nom</th><th>IBAN</th><th>Devise</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.bank_account_id}>
                <td>{a.name}</td>
                <td>{a.iban ?? '—'}</td>
                <td>{a.currency_code}</td>
                <td><span className={`badge ${a.is_active ? 'badge-success' : 'badge-muted'}`}>{a.is_active ? 'Actif' : 'Inactif'}</span></td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucun compte</td></tr>
            )}
          </tbody>
        </table>
        <form onSubmit={handleCreateAccount} className="form-grid">
          <div className="form-group">
            <label>Nom du compte</label>
            <input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>IBAN</label>
            <input value={accountForm.iban} onChange={(e) => setAccountForm({ ...accountForm, iban: e.target.value })} />
          </div>
          <div className="form-group">
            <label>SWIFT</label>
            <input value={accountForm.swift} onChange={(e) => setAccountForm({ ...accountForm, swift: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Devise</label>
            <select value={accountForm.currencyCode} onChange={(e) => setAccountForm({ ...accountForm, currencyCode: e.target.value })}>
              <option value="CDF">CDF</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Ajouter le compte</button>
        </form>
      </div>

      <div className="panel">
        <h3>Nouvelle transaction bancaire</h3>
        <form onSubmit={handleTx} className="form-grid">
          <div className="form-group">
            <label>Type</label>
            <select value={txForm.kind} onChange={(e) => setTxForm({ ...txForm, kind: e.target.value as typeof txForm.kind })}>
              <option value="DEPOT">Dépôt</option>
              <option value="RETRAIT">Retrait</option>
              <option value="VIREMENT">Virement</option>
            </select>
          </div>
          <div className="form-group">
            <label>Compte</label>
            <select value={txForm.bankAccountId} onChange={(e) => setTxForm({ ...txForm, bankAccountId: e.target.value })} required>
              {accounts.map((a) => <option key={a.bank_account_id} value={a.bank_account_id}>{a.name}</option>)}
            </select>
          </div>
          {txForm.kind === 'VIREMENT' && (
            <div className="form-group">
              <label>Compte destination</label>
              <select value={txForm.toBankAccountId} onChange={(e) => setTxForm({ ...txForm, toBankAccountId: e.target.value })} required>
                {accounts.filter((a) => a.bank_account_id !== txForm.bankAccountId).map((a) => (
                  <option key={a.bank_account_id} value={a.bank_account_id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={txForm.txDate} onChange={(e) => setTxForm({ ...txForm, txDate: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Libellé</label>
            <input value={txForm.label} onChange={(e) => setTxForm({ ...txForm, label: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Bénéficiaire</label>
            <input value={txForm.beneficiary} onChange={(e) => setTxForm({ ...txForm, beneficiary: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Rubrique</label>
            <select value={txForm.categoryId} onChange={(e) => setTxForm({ ...txForm, categoryId: e.target.value })} required>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          </div>
          {fundsEnabled && (
          <div className="form-group">
            <label>Fonds dédié <span className="field-hint">(facultatif)</span></label>
            <FundSelect funds={funds} value={txForm.fundId} onChange={(fundId) => setTxForm({ ...txForm, fundId })} />
          </div>
          )}
          <div className="form-group">
            <label>Montant CDF</label>
            <input type="number" step="0.01" min="0" value={txForm.amountCdf} onChange={(e) => setTxForm({ ...txForm, amountCdf: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Montant USD</label>
            <input type="number" step="0.01" min="0" value={txForm.amountUsd} onChange={(e) => setTxForm({ ...txForm, amountUsd: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary">Enregistrer</button>
        </form>
      </div>

      <div className="panel">
        <h3>Rapprochement bancaire</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.createBankReconciliation(recForm);
              setRecForm((p) => ({ ...p, notes: '' }));
              load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur');
            }
          }}
          className="form-grid"
        >
          <div className="form-group">
            <label>Compte</label>
            <select value={recForm.bankAccountId} onChange={(e) => setRecForm({ ...recForm, bankAccountId: e.target.value })} required>
              {accounts.map((a) => <option key={a.bank_account_id} value={a.bank_account_id}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Date de rapprochement</label>
            <input type="date" value={recForm.reconciliationDate} onChange={(e) => setRecForm({ ...recForm, reconciliationDate: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input value={recForm.notes} onChange={(e) => setRecForm({ ...recForm, notes: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary">Ouvrir un rapprochement</button>
        </form>
        <table style={{ marginTop: '1rem' }}>
          <thead>
            <tr><th>Date</th><th>Compte</th><th>Statut</th><th></th></tr>
          </thead>
          <tbody>
            {reconciliations.map((r) => (
              <tr key={r.bank_reconciliation_id}>
                <td>{r.reconciliation_date}</td>
                <td>{r.bank_account_name}</td>
                <td>
                  <span className={`badge ${r.status === 'validated' ? 'badge-success' : 'badge-muted'}`}>
                    {r.status === 'validated' ? 'Validé' : 'Ouvert'}
                  </span>
                </td>
                <td className="actions-cell">
                  {r.status !== 'validated' && (
                    <>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openMatching(r)}>Matcher</button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          try {
                            await api.validateBankReconciliation(r.bank_reconciliation_id);
                            if (activeRec?.bank_reconciliation_id === r.bank_reconciliation_id) setActiveRec(null);
                            load();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Erreur');
                          }
                        }}
                      >
                        Valider
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {reconciliations.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucun rapprochement</td></tr>
            )}
          </tbody>
        </table>

        {activeRec && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <h4>Matching — {activeRec.bank_account_name} ({activeRec.reconciliation_date})</h4>
            <form onSubmit={handleAddMatch} className="form-grid" style={{ marginTop: '0.75rem' }}>
              <div className="form-group">
                <label>Transaction ERP</label>
                <select value={matchForm.bankTransactionId} onChange={(e) => setMatchForm({ ...matchForm, bankTransactionId: e.target.value })}>
                  <option value="">— Ligne relevé seule —</option>
                  {bankTx.map((t) => (
                    <option key={t.bank_transaction_id} value={t.bank_transaction_id}>
                      {t.tx_date} — {t.piece_number} — {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Réf. ligne relevé</label>
                <input value={matchForm.externalStatementLineRef} onChange={(e) => setMatchForm({ ...matchForm, externalStatementLineRef: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Montant CDF rapproché</label>
                <input type="number" step="0.01" value={matchForm.matchedAmountCdf} onChange={(e) => setMatchForm({ ...matchForm, matchedAmountCdf: e.target.value })} required />
              </div>
              <button type="submit" className="btn btn-primary">Ajouter le rapprochement</button>
            </form>
            <table style={{ marginTop: '1rem' }}>
              <thead>
                <tr><th>Relevé</th><th>Pièce ERP</th><th>Date</th><th>Libellé</th><th>Montant CDF</th></tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.match_id}>
                    <td>{m.external_statement_line_ref}</td>
                    <td>{m.piece_number ?? '—'}</td>
                    <td>{m.tx_date ?? '—'}</td>
                    <td>{m.label ?? '—'}</td>
                    <td>{m.matched_amount_cdf}</td>
                  </tr>
                ))}
                {matches.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucun rapprochement enregistré</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
