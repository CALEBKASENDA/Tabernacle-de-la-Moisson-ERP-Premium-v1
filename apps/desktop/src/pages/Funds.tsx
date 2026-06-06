import { useEffect, useState } from 'react';
import { api, type Fund, type Operation } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useChurchScope } from '../hooks/useChurchScope';
import { useCanManageFundsOption, useFundsEnabled } from '../hooks/useFundsEnabled';
import { fmtMontant } from '../utils/format';

function fmtMicro(micro: string): string {
  return (Number(micro) / 1_000_000).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
}

export function Funds() {
  const churchId = useChurchScope();
  const { refresh, hasPermission } = useAuth();
  const fundsEnabled = useFundsEnabled();
  const canManageOption = useCanManageFundsOption();
  const [items, setItems] = useState<Fund[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [activating, setActivating] = useState(false);
  const [historyFundId, setHistoryFundId] = useState('');
  const [history, setHistory] = useState<Operation[]>([]);
  const [editingFund, setEditingFund] = useState<Fund | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteFundId, setDeleteFundId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const canEdit = hasPermission('finance:operations:modifier');
  const canDelete = hasPermission('finance:operations:supprimer');

  const load = () => {
    if (!fundsEnabled) return;
    api.getFunds().then((r) => setItems(r.data)).catch((e) => setError(e.message));
  };

  useEffect(() => {
    if (churchId && fundsEnabled) load();
    else setItems([]);
  }, [churchId, fundsEnabled]);

  const loadHistory = (fundId: string) => {
    setHistoryFundId(fundId);
    api.getOperations({ fundId }).then((r) => setHistory(r.data)).catch((e) => setError(e.message));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createFund(name.trim());
      setName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const enableFunds = async () => {
    setActivating(true);
    setError('');
    try {
      await api.updateChurchSettings({ fundsEnabled: true });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setActivating(false);
    }
  };

  const disableFunds = async () => {
    if (!window.confirm('Désactiver la répartition par fonds ? Les fonds existants seront conservés mais masqués dans l\'interface.')) {
      return;
    }
    setActivating(true);
    setError('');
    try {
      await api.updateChurchSettings({ fundsEnabled: false });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setActivating(false);
    }
  };

  if (!fundsEnabled) {
    return (
      <>
        <div className="page-header">
          <h2>Répartition par fonds</h2>
          <p className="page-subtitle">Option facultative — activez-la si votre église suit plusieurs fonds dédiés.</p>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="panel">
          <h3>Fonctionnalité non activée</h3>
          <p className="section-hint" style={{ marginBottom: '1rem' }}>
            Sans cette option, les opérations ne demandent pas de fonds et les tableaux de bord n&apos;affichent pas la répartition par fonds.
            Vous pourrez créer et gérer vos fonds dédiés après activation.
          </p>
          {canManageOption ? (
            <button type="button" className="btn btn-primary" onClick={enableFunds} disabled={activating}>
              {activating ? 'Activation…' : 'Activer la répartition par fonds'}
            </button>
          ) : (
            <p style={{ color: 'var(--muted)' }}>
              Contactez un administrateur pour activer cette option.
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h2>Fonds dédiés</h2>
        {canManageOption && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={disableFunds} disabled={activating}>
            Désactiver l&apos;option
          </button>
        )}
      </div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h3>Ajouter un fonds</h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.75rem' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du fonds" style={{ flex: 1 }} />
          <button type="submit" className="btn btn-primary">Ajouter</button>
        </form>
      </div>

      <div className="cards">
        {items.map((f) => (
          <div className="card" key={f.fund_id}>
            <div className="card-label">{f.name}</div>
            <div className={`card-value ${Number(f.balanceUsdMicro) >= 0 ? 'positive' : 'negative'}`}>
              {fmtMicro(f.balanceUsdMicro)} USD
            </div>
            <div className="actions-cell" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadHistory(f.fund_id)}>Historique</button>
              {canEdit && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingFund(f); setEditName(f.name); }}>Renommer</button>
              )}
              {canDelete && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDeleteFundId(f.fund_id); setDeleteReason(''); }}>Supprimer</button>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>Aucun fonds — ajoutez-en un ci-dessus.</p>
        )}
      </div>

      {historyFundId && (
        <div className="panel table-scroll" style={{ marginTop: '1rem' }}>
          <h3>Historique des opérations — {items.find((f) => f.fund_id === historyFundId)?.name}</h3>
          <table>
            <thead>
              <tr><th>Date</th><th>Pièce</th><th>Libellé</th><th>Rec. CDF</th><th>Dép. CDF</th></tr>
            </thead>
            <tbody>
              {history.map((op) => (
                <tr key={op.operation_id}>
                  <td>{op.op_date}</td>
                  <td>{op.piece_number}</td>
                  <td>{op.label}</td>
                  <td>{fmtMontant(op.receipts_cdf)}</td>
                  <td>{fmtMontant(op.expenses_cdf)}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune opération pour ce fonds</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingFund && (
        <div className="modal-overlay" onClick={() => setEditingFund(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Renommer le fonds</h3>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} />
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditingFund(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" onClick={async () => {
                try {
                  await api.updateFund(editingFund.fund_id, { name: editName.trim() });
                  setEditingFund(null);
                  load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Erreur');
                }
              }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {deleteFundId && (
        <div className="modal-overlay" onClick={() => setDeleteFundId(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer le fonds</h3>
            <textarea rows={3} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="Motif obligatoire" />
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteFundId(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" disabled={!deleteReason.trim()} onClick={async () => {
                try {
                  await api.deleteFund(deleteFundId, deleteReason.trim());
                  setDeleteFundId(null);
                  load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Erreur');
                }
              }}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
