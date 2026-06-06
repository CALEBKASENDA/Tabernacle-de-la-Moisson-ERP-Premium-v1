import { useEffect, useMemo, useState } from 'react';
import { api, type Category } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useChurchScope } from '../hooks/useChurchScope';

function buildTree(categories: Category[]): Array<Category & { depth: number }> {
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) {
    const key = c.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  const out: Array<Category & { depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? [];
    for (const c of children.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))) {
      out.push({ ...c, depth });
      walk(c.category_id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function Categories() {
  const churchId = useChurchScope();
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', parentId: '', sortOrder: '0', status: 'active' });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const canAdd = hasPermission('finance:operations:ajouter');
  const canEdit = hasPermission('finance:operations:modifier');
  const canDelete = hasPermission('finance:operations:supprimer');

  const load = () => api.getCategories().then((r) => setItems(r.data)).catch((e) => setError(e.message));
  useEffect(() => { if (churchId) load(); }, [churchId]);

  const tree = useMemo(() => buildTree(items), [items]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createCategory({ name: name.trim(), parentId: parentId || null });
      setName('');
      setParentId('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const startEdit = (c: Category) => {
    setEditingId(c.category_id);
    setEditForm({
      name: c.name,
      parentId: c.parent_id ?? '',
      sortOrder: String(c.sort_order ?? 0),
      status: c.status,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await api.updateCategory(editingId, {
        name: editForm.name.trim(),
        parentId: editForm.parentId || null,
        sortOrder: Number(editForm.sortOrder),
        status: editForm.status,
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const confirmDelete = async () => {
    if (!deleteId || !deleteReason.trim()) return;
    try {
      await api.deleteCategory(deleteId, deleteReason.trim());
      setDeleteId(null);
      setDeleteReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header"><h2>Rubriques financières</h2></div>
      {error && <div className="error-msg">{error}</div>}

      {canAdd && (
        <div className="panel">
          <h3>Ajouter une rubrique</h3>
          <form onSubmit={handleAdd} className="form-grid" style={{ maxWidth: 640 }}>
            <label>
              Nom
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la rubrique" required />
            </label>
            <label>
              Rubrique parente (optionnel)
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">— Racine —</option>
                {items.filter((c) => c.status === 'active').map((c) => (
                  <option key={c.category_id} value={c.category_id}>{c.name}</option>
                ))}
              </select>
            </label>
            <div style={{ alignSelf: 'end' }}>
              <button type="submit" className="btn btn-primary">Ajouter</button>
            </div>
          </form>
        </div>
      )}

      <div className="panel table-scroll">
        <table>
          <thead>
            <tr><th>Nom</th><th>Ordre</th><th>Statut</th><th></th></tr>
          </thead>
          <tbody>
            {tree.map((c) => (
              <tr key={c.category_id}>
                {editingId === c.category_id ? (
                  <>
                    <td colSpan={4}>
                      <div className="inline-form" style={{ flexWrap: 'wrap' }}>
                        <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                        <select value={editForm.parentId} onChange={(e) => setEditForm({ ...editForm, parentId: e.target.value })}>
                          <option value="">— Racine —</option>
                          {items.filter((x) => x.category_id !== c.category_id).map((x) => (
                            <option key={x.category_id} value={x.category_id}>{x.name}</option>
                          ))}
                        </select>
                        <input type="number" style={{ width: 80 }} value={editForm.sortOrder} onChange={(e) => setEditForm({ ...editForm, sortOrder: e.target.value })} title="Ordre" />
                        <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                        <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit}>Enregistrer</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Annuler</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ paddingLeft: `${0.75 + c.depth * 1.25}rem` }}>
                      {c.depth > 0 && <span className="badge badge-muted">↳</span>}{' '}
                      {c.name}
                    </td>
                    <td>{c.sort_order ?? 0}</td>
                    <td>
                      <span className={`badge ${c.status === 'active' ? 'badge-success' : 'badge-muted'}`}>
                        {c.status === 'active' ? 'Active' : c.status === 'inactive' ? 'Inactive' : c.status}
                      </span>
                    </td>
                    <td className="actions-cell">
                      {canEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Modifier</button>}
                      {canDelete && c.status !== 'deleted' && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDeleteId(c.category_id); setDeleteReason(''); }}>Supprimer</button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {tree.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune rubrique</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer la rubrique</h3>
            <p className="form-hint">Motif obligatoire (suppression logique).</p>
            <textarea rows={3} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteId(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" disabled={!deleteReason.trim()} onClick={confirmDelete}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
