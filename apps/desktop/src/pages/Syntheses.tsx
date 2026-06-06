import { useEffect, useState } from 'react';
import { api, type SynthesisBlock, type SynthesisCategory } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useChurchScope } from '../hooks/useChurchScope';
import { exporterSyntheseExcel, exporterSynthesePdf } from '../utils/exportSynthesis';

function fmtMicro(micro: string): string {
  return (Number(micro) / 1_000_000).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
}

export function Syntheses() {
  const { user } = useAuth();
  const churchId = useChurchScope();
  const [rows, setRows] = useState<SynthesisCategory[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!churchId) return;
    api.getSynthesisCategories().then((r) => setRows(r.data)).catch((e) => setError(e.message));
  }, [churchId]);

  const totalRec = rows.reduce((s, r) => s + Number(r.recettesUsd), 0);
  const totalDep = rows.reduce((s, r) => s + Number(r.depensesUsd), 0);
  const today = new Date().toISOString().slice(0, 10);

  const blocExport: SynthesisBlock = {
    dateFrom: today,
    dateTo: today,
    recettesUsd: String(totalRec),
    depensesUsd: String(totalDep),
    soldeUsd: String(totalRec - totalDep),
    nombreOperations: 0,
    rubriques: rows.map((r) => ({
      categoryId: r.categoryId,
      name: r.name,
      recettesUsd: r.recettesUsd,
      depensesUsd: r.depensesUsd,
      soldeUsd: r.soldeUsd,
    })),
  };

  const eglise = user?.churchName ?? user?.churchId;
  const titre = 'Synthèse globale par rubrique';

  if (error) return <div className="error-msg">{error}</div>;

  return (
    <>
      <div className="page-header">
        <h2>Synthèse par rubrique</h2>
        <div className="export-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => exporterSynthesePdf({ titre, block: blocExport, eglise })}>
            Exporter PDF
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => exporterSyntheseExcel({ titre, block: blocExport, eglise })}>
            Exporter Excel
          </button>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="card-label">Total recettes</div>
          <div className="card-value positive">{fmtMicro(String(totalRec))} USD</div>
        </div>
        <div className="card">
          <div className="card-label">Total dépenses</div>
          <div className="card-value negative">{fmtMicro(String(totalDep))} USD</div>
        </div>
        <div className="card">
          <div className="card-label">Total général (Recettes − Dépenses)</div>
          <div className={`card-value ${totalRec - totalDep >= 0 ? 'positive' : 'negative'}`}>
            {fmtMicro(String(totalRec - totalDep))} USD
          </div>
        </div>
      </div>

      <div className="panel">
        <table className="rubriques-table">
          <thead>
            <tr><th>Rubrique</th><th>Recettes (USD)</th><th>Dépenses (USD)</th><th>Solde rubrique (USD)</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.categoryId}>
                <td>{r.name}</td>
                <td className="positive">{fmtMicro(r.recettesUsd)}</td>
                <td className="negative">{fmtMicro(r.depensesUsd)}</td>
                <td>{fmtMicro(r.soldeUsd)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune rubrique</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="total-general-row">
              <td><strong>Total général</strong></td>
              <td className="positive"><strong>{fmtMicro(String(totalRec))}</strong></td>
              <td className="negative"><strong>{fmtMicro(String(totalDep))}</strong></td>
              <td className={totalRec - totalDep >= 0 ? 'positive' : 'negative'}>
                <strong>{fmtMicro(String(totalRec - totalDep))}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
