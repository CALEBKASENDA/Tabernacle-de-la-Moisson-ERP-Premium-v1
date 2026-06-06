import { useEffect, useState } from 'react';
import { api, type DashboardData, type PeriodComparison, type SynthesisBlock } from '../api/client';
import { BarChart } from '../components/BarChart';
import { DualBarChart } from '../components/DualBarChart';
import { useAuth } from '../context/AuthContext';
import { useChurchScope } from '../hooks/useChurchScope';
import { useFundsEnabled } from '../hooks/useFundsEnabled';
import { SynthesisDrawer } from '../components/SynthesisDrawer';
import { SynthesisPanel } from '../components/SynthesisPanel';
import { fmtMicro } from '../utils/format';

function ComparisonBlock({ data }: { data: PeriodComparison }) {
  return (
    <table className="rubriques-table">
      <thead>
        <tr>
          <th>Période</th>
          <th>Recettes (USD)</th>
          <th>Dépenses (USD)</th>
          <th>Solde (USD)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{data.periodeCourante.label}</td>
          <td className="positive">{fmtMicro(data.periodeCourante.recettesUsd)}</td>
          <td className="negative">{fmtMicro(data.periodeCourante.depensesUsd)}</td>
          <td className={Number(data.periodeCourante.soldeUsd) >= 0 ? 'positive' : 'negative'}>
            {fmtMicro(data.periodeCourante.soldeUsd)}
          </td>
        </tr>
        <tr>
          <td>{data.periodePrecedente.label}</td>
          <td className="positive">{fmtMicro(data.periodePrecedente.recettesUsd)}</td>
          <td className="negative">{fmtMicro(data.periodePrecedente.depensesUsd)}</td>
          <td className={Number(data.periodePrecedente.soldeUsd) >= 0 ? 'positive' : 'negative'}>
            {fmtMicro(data.periodePrecedente.soldeUsd)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const churchId = useChurchScope();
  const fundsEnabled = useFundsEnabled();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [periodData, setPeriodData] = useState<SynthesisBlock | null>(null);
  const eglise = user?.churchName ?? user?.churchId;

  useEffect(() => {
    if (!churchId) return;
    setData(null);
    setError('');
    api.getDashboard().then((r) => setData(r.data)).catch((e) => setError(e.message));
  }, [churchId]);

  const loadPeriod = () => {
    if (!periodFrom || !periodTo) return;
    api.getSynthesisPeriod(periodFrom, periodTo).then((r) => setPeriodData(r.data)).catch((e) => setError(e.message));
  };

  if (error) return <div className="error-msg">{error}</div>;
  if (!data) return <div className="loading">Chargement du tableau de bord…</div>;

  const solde = Number(data.soldeGlobalUsd);
  const syn = data.syntheses;

  return (
    <>
      <div className="page-header">
        <h2>Tableau de bord financier</h2>
      </div>

      <div className="cards">
        <div className="card">
          <div className="card-label">Solde global (USD)</div>
          <div className={`card-value ${solde >= 0 ? 'positive' : 'negative'}`}>{fmtMicro(data.soldeGlobalUsd)}</div>
        </div>
        <div className="card">
          <div className="card-label">Recettes totales (USD)</div>
          <div className="card-value positive">{fmtMicro(data.recettesTotalesUsd ?? '0')}</div>
        </div>
        <div className="card">
          <div className="card-label">Dépenses totales (USD)</div>
          <div className="card-value negative">{fmtMicro(data.depensesTotalesUsd ?? '0')}</div>
        </div>
        <div className="card">
          <div className="card-label">Recettes du jour (USD)</div>
          <div className="card-value positive">{fmtMicro(data.recettesJourUsd)}</div>
        </div>
        <div className="card">
          <div className="card-label">Dépenses du jour (USD)</div>
          <div className="card-value negative">{fmtMicro(data.depensesJourUsd)}</div>
        </div>
        <div className="card">
          <div className="card-label">Solde du mois (USD)</div>
          <div className={`card-value ${Number(data.soldeMoisUsd) >= 0 ? 'positive' : 'negative'}`}>{fmtMicro(data.soldeMoisUsd)}</div>
        </div>
        <div className="card">
          <div className="card-label">Opérations totales</div>
          <div className="card-value">{data.nombreOperations}</div>
        </div>
      </div>

      {(data.tendanceMensuelle?.length || (fundsEnabled && data.syntheseFonds?.length) || (data.syntheseRubriques?.length ?? 0) > 0) ? (
        <div className="charts-row">
          {data.tendanceMensuelle && data.tendanceMensuelle.length > 0 && (
            <div className="panel chart-panel">
              <h3>Évolution mensuelle</h3>
              <DualBarChart
                points={data.tendanceMensuelle.map((t) => ({
                  label: t.mois.slice(5),
                  recettes: Number(t.recettesUsd) / 1_000_000,
                  depenses: Number(t.depensesUsd) / 1_000_000,
                }))}
              />
            </div>
          )}
          {data.syntheseRubriques && data.syntheseRubriques.length > 0 && (
            <div className="panel chart-panel">
              <h3>Répartition par rubrique (mois)</h3>
              <BarChart
                items={data.syntheseRubriques.map((r) => ({
                  label: r.name.length > 10 ? r.name.slice(0, 10) + '…' : r.name,
                  value: Number(r.soldeUsd) / 1_000_000,
                  color: Number(r.soldeUsd) >= 0 ? 'var(--success)' : 'var(--danger)',
                }))}
                formatValue={(v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $`}
              />
            </div>
          )}
          {fundsEnabled && data.syntheseFonds && data.syntheseFonds.length > 0 && (
            <div className="panel chart-panel">
              <h3>Répartition par fonds</h3>
              <BarChart
                items={data.syntheseFonds.map((f) => ({
                  label: f.name.length > 12 ? f.name.slice(0, 12) + '…' : f.name,
                  value: Number(f.soldeUsd) / 1_000_000,
                  color: Number(f.soldeUsd) >= 0 ? 'var(--success)' : 'var(--danger)',
                }))}
                formatValue={(v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $`}
              />
            </div>
          )}
        </div>
      ) : null}

      {(data.comparaisonMensuelle || data.comparaisonAnnuelle) && (
        <div className="charts-row">
          {data.comparaisonMensuelle && (
            <div className="panel">
              <h3>Comparaison mensuelle</h3>
              <ComparisonBlock data={data.comparaisonMensuelle} />
            </div>
          )}
          {data.comparaisonAnnuelle && (
            <div className="panel">
              <h3>Comparaison annuelle</h3>
              <ComparisonBlock data={data.comparaisonAnnuelle} />
            </div>
          )}
        </div>
      )}

      {syn && (
        <div className="panel synthesis-drawers-panel">
          <h3 className="section-title">Synthèses financières par rubrique</h3>
          <p className="section-hint">Cliquez sur une synthèse pour afficher le détail et les exports.</p>
          <div className="synthesis-drawers">
            <SynthesisDrawer title="Synthèse journalière" block={syn.journaliere}>
              <SynthesisPanel title="Synthèse journalière" block={syn.journaliere} eglise={eglise} />
            </SynthesisDrawer>
            <SynthesisDrawer title="Synthèse hebdomadaire" block={syn.hebdomadaire}>
              <SynthesisPanel title="Synthèse hebdomadaire" block={syn.hebdomadaire} eglise={eglise} />
            </SynthesisDrawer>
            <SynthesisDrawer title="Synthèse mensuelle" block={syn.mensuelle} defaultOpen>
              <SynthesisPanel title="Synthèse mensuelle" block={syn.mensuelle} eglise={eglise} />
            </SynthesisDrawer>
            <SynthesisDrawer title="Synthèse annuelle" block={syn.annuelle}>
              <SynthesisPanel title="Synthèse annuelle" block={syn.annuelle} eglise={eglise} />
            </SynthesisDrawer>
          </div>
        </div>
      )}

      <div className="panel synthesis-drawers-panel" style={{ marginBottom: '1.5rem' }}>
        <h3 className="section-title">Synthèse périodique</h3>
        <div className="inline-form">
          <label>
            Du
            <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
          </label>
          <label>
            Au
            <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" onClick={loadPeriod}>Calculer</button>
        </div>
        {periodData && (
          <div className="synthesis-drawers" style={{ marginTop: '1rem' }}>
            <SynthesisDrawer title="Synthèse périodique personnalisée" block={periodData} defaultOpen>
              <SynthesisPanel title="Synthèse périodique personnalisée" block={periodData} eglise={eglise} />
            </SynthesisDrawer>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Dernières opérations</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Pièce</th>
              <th>Libellé</th>
              <th>Recettes (USD)</th>
              <th>Dépenses (USD)</th>
            </tr>
          </thead>
          <tbody>
            {data.dernieresOperations.map((op) => (
              <tr key={op.operation_id}>
                <td>{op.op_date}</td>
                <td>{op.piece_number}</td>
                <td>{op.label}</td>
                <td>{(Number(op.receipts_usd_converted) + Number(op.receipts_usd ?? 0)).toFixed(2)}</td>
                <td>{(Number(op.expenses_usd) + Number(op.expenses_usd_converted)).toFixed(2)}</td>
              </tr>
            ))}
            {data.dernieresOperations.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune opération</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
