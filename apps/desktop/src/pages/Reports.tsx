import { useEffect, useState } from 'react';
import { api, type SynthesisBlock, type SynthesisCategory } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useChurchScope } from '../hooks/useChurchScope';
import { useFundsEnabled } from '../hooks/useFundsEnabled';
import { exporterSyntheseExcel, exporterSynthesePdf } from '../utils/exportSynthesis';
import { fmtMicro } from '../utils/format';

export function Reports() {
  const { user } = useAuth();
  const churchId = useChurchScope();
  const fundsEnabled = useFundsEnabled();
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 8) + '01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [categories, setCategories] = useState<SynthesisCategory[]>([]);
  const [period, setPeriod] = useState<SynthesisBlock | null>(null);
  const [error, setError] = useState('');
  const eglise = user?.churchName ?? user?.churchId;

  const load = () => {
    setError('');
    Promise.all([
      api.getSynthesisCategories({ dateFrom, dateTo }),
      api.getSynthesisPeriod(dateFrom, dateTo),
    ])
      .then(([cat, per]) => {
        setCategories(cat.data);
        setPeriod(per.data);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => { if (churchId) load(); }, [churchId]);

  return (
    <>
      <div className="page-header"><h2>Rapports et exportations</h2></div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h3>Période d&apos;analyse</h3>
        <div className="inline-form">
          <label>
            Du
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            Au
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" onClick={load}>Actualiser</button>
        </div>
      </div>

      {period && (
        <div className="panel">
          <div className="synthesis-panel-header">
            <h3>Synthèse générale</h3>
            <div className="export-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => exporterSynthesePdf({ titre: 'Rapport de synthèse', block: period, eglise })}>
                Exporter PDF
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => exporterSyntheseExcel({ titre: 'Rapport de synthèse', block: period, eglise })}>
                Exporter Excel
              </button>
            </div>
          </div>
          <div className="synthesis-totals">
            <div className="synthesis-total">
              <span>Recettes</span>
              <strong className="positive">{fmtMicro(period.recettesUsd)} USD</strong>
            </div>
            <div className="synthesis-total">
              <span>Dépenses</span>
              <strong className="negative">{fmtMicro(period.depensesUsd)} USD</strong>
            </div>
            <div className="synthesis-total synthesis-total-general">
              <span>Total général</span>
              <strong className={Number(period.soldeUsd) >= 0 ? 'positive' : 'negative'}>{fmtMicro(period.soldeUsd)} USD</strong>
            </div>
            <div className="synthesis-total">
              <span>Opérations</span>
              <strong>{period.nombreOperations}</strong>
            </div>
          </div>
        </div>
      )}

      <div className="panel table-scroll">
        <h3>Rapport par rubrique</h3>
        <table>
          <thead>
            <tr><th>Rubrique</th><th>Recettes (USD)</th><th>Dépenses (USD)</th><th>Solde (USD)</th></tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.categoryId}>
                <td>{c.name}</td>
                <td className="positive">{fmtMicro(c.recettesUsd)}</td>
                <td className="negative">{fmtMicro(c.depensesUsd)}</td>
                <td className={Number(c.soldeUsd) >= 0 ? 'positive' : 'negative'}>{fmtMicro(c.soldeUsd)}</td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune donnée</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Rapports disponibles</h3>
        <ul className="security-checklist">
          <li>Rapport des recettes et dépenses par période</li>
          <li>Rapport par rubrique financière</li>
          {fundsEnabled && <li>Rapport par fonds dédié (tableau de bord)</li>}
          <li>Rapport des événements et cultes</li>
          <li>Rapport des enveloppes et promesses de foi</li>
          <li>Rapport de caisse et bancaire</li>
          <li>Journal d&apos;audit (menu Audit)</li>
          <li>Export PDF et Excel pour chaque synthèse</li>
        </ul>
      </div>
    </>
  );
}
