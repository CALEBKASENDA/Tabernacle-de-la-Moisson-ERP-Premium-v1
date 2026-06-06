import { useEffect, useState } from 'react';
import { api, type PastoralDashboardData, type SynthesisBlock } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useChurchScope } from '../hooks/useChurchScope';
import { useFundsEnabled } from '../hooks/useFundsEnabled';
import { DualBarChart } from '../components/DualBarChart';
import { BarChart } from '../components/BarChart';
import { SynthesisDrawer } from '../components/SynthesisDrawer';
import { SynthesisPanel } from '../components/SynthesisPanel';
import { fmtMicro } from '../utils/format';

export function PastoralDashboard() {
  const { user } = useAuth();
  const churchId = useChurchScope();
  const fundsEnabled = useFundsEnabled();
  const [data, setData] = useState<PastoralDashboardData | null>(null);
  const [error, setError] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [periodData, setPeriodData] = useState<SynthesisBlock | null>(null);
  const eglise = user?.churchName ?? user?.churchId;

  useEffect(() => {
    if (!churchId) return;
    setData(null);
    setPeriodData(null);
    api.getPastoralDashboard().then((r) => setData(r.data)).catch((e) => setError(e.message));
  }, [churchId]);

  const loadPeriod = () => {
    if (!periodFrom || !periodTo) return;
    api.getSynthesisPeriod(periodFrom, periodTo).then((r) => setPeriodData(r.data)).catch((e) => setError(e.message));
  };

  if (error) return <div className="error-msg">{error}</div>;
  if (!data) return <div className="loading">Chargement du tableau pastoral…</div>;

  const solde = Number(data.soldeGlobalUsd);
  const soldeMois = Number(data.soldeMoisUsd);
  const syn = data.syntheses;

  return (
    <>
      <div className="page-header">
        <h2>Dashboard pastoral</h2>
        <span className="badge badge-muted">Consultation seule</span>
      </div>

      <div className="cards">
        <div className="card">
          <div className="card-label">Solde global (USD)</div>
          <div className={`card-value ${solde >= 0 ? 'positive' : 'negative'}`}>{fmtMicro(data.soldeGlobalUsd)}</div>
        </div>
        <div className="card">
          <div className="card-label">Recettes totales (USD)</div>
          <div className="card-value positive">{fmtMicro(data.recettesTotalesUsd)}</div>
        </div>
        <div className="card">
          <div className="card-label">Dépenses totales (USD)</div>
          <div className="card-value negative">{fmtMicro(data.depensesTotalesUsd)}</div>
        </div>
        <div className="card">
          <div className="card-label">Solde du mois (USD)</div>
          <div className={`card-value ${soldeMois >= 0 ? 'positive' : 'negative'}`}>{fmtMicro(data.soldeMoisUsd)}</div>
        </div>
        <div className="card">
          <div className="card-label">Opérations</div>
          <div className="card-value">{data.nombreOperations}</div>
        </div>
      </div>

      <div className={`charts-row${fundsEnabled ? '' : ' charts-row-single'}`}>
        <div className="panel chart-panel">
          <h3>Évolution mensuelle</h3>
          <DualBarChart
            points={(data.tendanceMensuelle ?? []).map((t) => ({
              label: t.mois.slice(5),
              recettes: Number(t.recettesUsd) / 1_000_000,
              depenses: Number(t.depensesUsd) / 1_000_000,
            }))}
          />
        </div>
        {fundsEnabled && (
          <div className="panel chart-panel">
            <h3>Répartition par fonds</h3>
            <BarChart
              items={(data.syntheseFonds ?? []).map((f) => ({
                label: f.name.length > 10 ? f.name.slice(0, 10) + '…' : f.name,
                value: Number(f.soldeUsd) / 1_000_000,
                color: Number(f.soldeUsd) >= 0 ? 'var(--success)' : 'var(--danger)',
              }))}
              formatValue={(v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $`}
            />
          </div>
        )}
      </div>

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
    </>
  );
}
