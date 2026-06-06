import { useEffect, useMemo, useState } from 'react';
import { api, type Category, type ChurchEvent, type Fund, type Operation, type OperationAttachment } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useChurchScope } from '../hooks/useChurchScope';
import { useFundsEnabled } from '../hooks/useFundsEnabled';
import { FundSelect } from '../components/FundSelect';
import { fmtMontant } from '../utils/format';
import { imprimerOperation } from '../utils/printOperation';

function newEmptyForm(categoryId = '') {
  return {
    pieceType: 'REC' as 'REC' | 'DEP' | 'CAI' | 'BAN',
    opDate: new Date().toISOString().slice(0, 10),
    label: '',
    beneficiary: '',
    categoryId,
    fundId: '',
    eventId: '',
    receiptsCdf: '0',
    receiptsUsd: '0',
    expensesCdf: '0',
    expensesUsd: '0',
    observation: '',
  };
}

export function Operations() {
  const churchId = useChurchScope();
  const fundsEnabled = useFundsEnabled();
  const { hasPermission, user } = useAuth();
  const [ops, setOps] = useState<Operation[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(() => newEmptyForm());
  const [attachments, setAttachments] = useState<OperationAttachment[]>([]);
  const [editLocked, setEditLocked] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const canAdd = hasPermission('finance:operations:ajouter');
  const canEdit = hasPermission('finance:operations:modifier');
  const canDelete = hasPermission('finance:operations:supprimer');
  const canPrint = hasPermission('finance:operations:voir');
  const eglise = user?.churchName;

  const load = () => {
    const filters = dateFrom || dateTo ? { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined } : undefined;
    Promise.all([
      api.getOperations(filters),
      api.getCategories(),
      fundsEnabled ? api.getFunds() : Promise.resolve({ data: [] as Fund[] }),
      api.getEvents(),
    ])
      .then(([o, c, f, ev]) => {
        setOps(o.data);
        setCategories(c.data);
        setFunds(f.data);
        setEvents(ev.data);
        if (!form.categoryId && c.data[0]) setForm((prev) => ({ ...prev, categoryId: c.data[0].category_id }));
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => { if (churchId) load(); }, [churchId, fundsEnabled]);

  const filtered = useMemo(() => {
    if (!search.trim()) return ops;
    const q = search.toLowerCase();
    return ops.filter(
      (op) =>
        op.label.toLowerCase().includes(q) ||
        op.piece_number.toLowerCase().includes(q) ||
        (op.beneficiary ?? '').toLowerCase().includes(q) ||
        (op.category_name ?? '').toLowerCase().includes(q)
    );
  }, [ops, search]);

  const resetForm = () => {
    setForm(newEmptyForm(categories[0]?.category_id ?? ''));
    setEditingId(null);
    setShowForm(false);
    setAttachments([]);
    setEditLocked(false);
  };

  const loadAttachments = (operationId: string) => {
    api.getOperationAttachments(operationId).then((r) => setAttachments(r.data)).catch(() => setAttachments([]));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.label.trim()) {
      setError('Le libellé est obligatoire.');
      return;
    }
    if (!form.categoryId) {
      setError('Choisissez une rubrique.');
      return;
    }
    const hasAmount =
      Number(form.receiptsCdf) > 0 ||
      Number(form.receiptsUsd) > 0 ||
      Number(form.expensesCdf) > 0 ||
      Number(form.expensesUsd) > 0;
    if (!hasAmount) {
      setError('Saisissez au moins un montant (recette ou dépense).');
      return;
    }

    try {
      if (!editingId) {
        const taux = await api.getTauxDuJour();
        if (!taux.data) {
          setError('Aucun taux USD/CDF enregistré. Allez dans « Taux de change » avant de saisir une opération.');
          return;
        }
      }

      const body = {
        ...form,
        fundId: form.fundId || null,
        eventId: form.eventId || undefined,
        beneficiary: form.beneficiary || undefined,
      };
      if (editingId) {
        await api.updateOperation(editingId, body);
        setSuccess('Opération mise à jour');
      } else {
        const result = await api.createOperation(body);
        setSuccess(`Opération créée : ${result.data.pieceNumber}`);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const startEdit = (op: Operation) => {
    const locked = !!op.is_locked_by_closure;
    setEditingId(op.operation_id);
    setEditLocked(locked);
    setShowForm(true);
    loadAttachments(op.operation_id);
    setForm({
      pieceType: op.piece_type as typeof form.pieceType,
      opDate: op.op_date,
      label: op.label,
      beneficiary: op.beneficiary ?? '',
      categoryId: categories.find((c) => c.name === op.category_name)?.category_id ?? categories[0]?.category_id ?? '',
      fundId: op.fund_id ?? funds.find((f) => f.name === op.fund_name)?.fund_id ?? '',
      eventId: '',
      receiptsCdf: String(op.receipts_cdf),
      receiptsUsd: String(op.receipts_usd ?? '0'),
      expensesCdf: String(op.expenses_cdf),
      expensesUsd: String(op.expenses_usd),
      observation: op.observation ?? '',
    });
  };

  const handleDelete = async () => {
    if (!deleteId || !deleteReason.trim()) return;
    try {
      await api.deleteOperation(deleteId, deleteReason.trim());
      setDeleteId(null);
      setDeleteReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingId) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const contentBase64 = (reader.result as string).split(',')[1] ?? '';
      try {
        await api.addOperationAttachment(editingId, {
          fileName: file.name,
          mimeType: file.type || undefined,
          contentBase64,
        });
        loadAttachments(editingId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur pièce jointe');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const downloadAttachment = async (attachmentId: string) => {
    try {
      const res = await api.getAttachmentContent(attachmentId);
      const link = document.createElement('a');
      link.href = `data:${res.data.mimeType ?? 'application/octet-stream'};base64,${res.data.contentBase64}`;
      link.download = res.data.fileName;
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur téléchargement');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Opérations financières</h2>
        {canAdd && (
          <button className="btn btn-primary" onClick={() => {
            if (showForm) resetForm();
            else {
              setForm(newEmptyForm(categories[0]?.category_id ?? ''));
              setAttachments([]);
              setEditLocked(false);
              setShowForm(true);
            }
          }}>
            {showForm ? 'Annuler' : '+ Nouvelle opération'}
          </button>
        )}
      </div>
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="panel">
        <h3>Filtres et recherche</h3>
        <div className="inline-form">
          <label>
            Du
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            Au
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label>
            Recherche
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Libellé, pièce, bénéficiaire…" />
          </label>
          <button type="button" className="btn btn-primary" onClick={load}>Appliquer</button>
          <button type="button" className="btn btn-ghost" onClick={() => api.exportOperationsCsv({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }).catch((e) => setError(e.message))}>Exporter CSV</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setDateFrom(''); setDateTo(''); setSearch(''); }}>Réinitialiser</button>
        </div>
      </div>

      {showForm && (canAdd || canEdit) && (
        <div className="panel">
          <h3>{editingId ? 'Modifier l\'opération' : 'Nouvelle opération'}</h3>
          {editLocked && (
            <div className="error-msg" style={{ marginBottom: '1rem' }}>
              Période clôturée — cette opération est verrouillée et ne peut plus être modifiée.
            </div>
          )}
          <form onSubmit={handleCreate} className="form-grid">
            <fieldset disabled={editLocked} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
            {!editingId && (
              <div className="form-group">
                <label>Type de pièce</label>
                <select value={form.pieceType} onChange={(e) => setForm({ ...form, pieceType: e.target.value as typeof form.pieceType })}>
                  <option value="REC">REC — Recette</option>
                  <option value="DEP">DEP — Dépense</option>
                  <option value="CAI">CAI — Caisse</option>
                  <option value="BAN">BAN — Banque</option>
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={form.opDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setForm({ ...form, opDate: e.target.value })}
                required
              />
              <p className="form-hint">Utilisez la date du jour sauf exception. Un taux de change doit exister pour cette date.</p>
            </div>
            <div className="form-group">
              <label>Libellé</label>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Bénéficiaire</label>
              <input value={form.beneficiary} onChange={(e) => setForm({ ...form, beneficiary: e.target.value })} />
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
            {!editingId && (
              <div className="form-group">
                <label>Événement (optionnel)</label>
                <select value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })}>
                  <option value="">— Aucun —</option>
                  {events.map((ev) => <option key={ev.event_id} value={ev.event_id}>{ev.title} ({ev.event_date})</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Recettes CDF</label>
              <input type="number" step="0.01" min="0" value={form.receiptsCdf} onChange={(e) => setForm({ ...form, receiptsCdf: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Recettes USD directes</label>
              <input type="number" step="0.01" min="0" value={form.receiptsUsd} onChange={(e) => setForm({ ...form, receiptsUsd: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Dépenses CDF</label>
              <input type="number" step="0.01" min="0" value={form.expensesCdf} onChange={(e) => setForm({ ...form, expensesCdf: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Dépenses USD directes</label>
              <input type="number" step="0.01" min="0" value={form.expensesUsd} onChange={(e) => setForm({ ...form, expensesUsd: e.target.value })} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Observation</label>
              <textarea rows={2} value={form.observation} onChange={(e) => setForm({ ...form, observation: e.target.value })} />
            </div>
            {!editLocked && (
              <button type="submit" className="btn btn-primary">{editingId ? 'Mettre à jour' : 'Enregistrer'}</button>
            )}
            </fieldset>
            {editingId && (
              <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                <label>Pièces justificatives</label>
                <input type="file" onChange={handleAttachmentUpload} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" />
                {attachments.length === 0 ? (
                  <p className="form-hint">Aucune pièce jointe.</p>
                ) : (
                  <ul className="attachment-list">
                    {attachments.map((a) => (
                      <li key={a.attachment_id}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadAttachment(a.attachment_id)}>
                          {a.file_name}
                        </button>
                        {!editLocked && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={async () => {
                              if (!confirm(`Supprimer « ${a.file_name} » ?`)) return;
                              try {
                                await api.deleteAttachment(a.attachment_id);
                                loadAttachments(editingId);
                              } catch (err) {
                                setError(err instanceof Error ? err.message : 'Erreur');
                              }
                            }}
                          >
                            Supprimer
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </form>
        </div>
      )}

      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Pièce</th>
              <th>Libellé</th>
              <th>Bénéficiaire</th>
              <th>Rubrique</th>
              {fundsEnabled && <th>Fonds</th>}
              <th>Événement</th>
              <th>Rec. CDF</th>
              <th>Rec. USD conv.</th>
              <th>Rec. USD</th>
              <th>Dép. CDF</th>
              <th>Dép. USD</th>
              <th>Taux</th>
              <th>Créateur</th>
              <th>Créé le</th>
              <th>Modifié le</th>
              <th>Observation</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((op) => (
              <tr key={op.operation_id}>
                <td>{op.op_date}</td>
                <td>
                  <code>{op.piece_number}</code>
                  {op.is_locked_by_closure && <span className="badge badge-muted" title="Période clôturée">Clôturé</span>}
                </td>
                <td>{op.label}</td>
                <td>{op.beneficiary ?? '—'}</td>
                <td>{op.category_name}</td>
                {fundsEnabled && <td>{op.fund_name ?? '—'}</td>}
                <td>{op.event_title ?? '—'}</td>
                <td>{fmtMontant(op.receipts_cdf)}</td>
                <td>{op.receipts_usd_converted}</td>
                <td>{op.receipts_usd ?? '0'}</td>
                <td>{fmtMontant(op.expenses_cdf)}</td>
                <td>{op.expenses_usd}</td>
                <td>{op.usd_rate_quote_per_1_usd ?? '—'}</td>
                <td>{op.created_by_name ?? '—'}</td>
                <td>{op.created_at?.slice(0, 10)}</td>
                <td>{op.updated_at?.slice(0, 10) ?? '—'}</td>
                <td>{op.observation ? (op.observation.length > 40 ? op.observation.slice(0, 40) + '…' : op.observation) : '—'}</td>
                <td className="actions-cell">
                  {canPrint && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => imprimerOperation(op, eglise)}>Imprimer</button>
                  )}
                  {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => startEdit(op)}>{op.is_locked_by_closure ? 'Voir' : 'Modifier'}</button>}
                  {canDelete && !op.is_locked_by_closure && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setDeleteId(op.operation_id); setDeleteReason(''); }}>Supprimer</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={fundsEnabled ? 18 : 17} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune opération</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer l'opération</h3>
            <p className="form-hint">Cette action est irréversible. Indiquez un motif obligatoire.</p>
            <div className="form-group">
              <label>Motif</label>
              <textarea rows={3} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} autoFocus />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteId(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" disabled={!deleteReason.trim()} onClick={handleDelete}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
