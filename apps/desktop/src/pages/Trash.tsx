import { useEffect, useState } from 'react';
import { api, type Operation } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';

export function Trash() {
  const churchId = useChurchScope();
  const [items, setItems] = useState<Operation[]>([]);
  const [error, setError] = useState('');

  const load = () => api.getTrash().then((r) => setItems(r.data)).catch((e) => setError(e.message));
  useEffect(() => { if (churchId) load(); }, [churchId]);

  const handleRestore = async (id: string) => {
    try {
      await api.restoreOperation(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header"><h2>Corbeille de récupération</h2></div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <table>
          <thead>
            <tr><th>Date</th><th>Pièce</th><th>Libellé</th><th>Motif</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((op) => (
              <tr key={op.operation_id}>
                <td>{op.op_date}</td>
                <td>{op.piece_number}</td>
                <td>{op.label}</td>
                <td>{op.deletion_reason}</td>
                <td>
                  <button className="btn btn-primary" onClick={() => handleRestore(op.operation_id)}>Restaurer</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>Corbeille vide</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
