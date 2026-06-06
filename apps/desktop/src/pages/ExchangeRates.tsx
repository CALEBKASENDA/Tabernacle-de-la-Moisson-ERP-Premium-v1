import { useEffect, useState } from 'react';
import { api, type RateHistoryItem } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';

const PAIRS = [
  { id: 'USD_CDF', label: '1 USD = ? CDF', base: 'USD' as const, quote: 'CDF' as const },
  { id: 'CDF_USD', label: '1 CDF = ? USD', base: 'CDF' as const, quote: 'USD' as const },
  { id: 'EUR_CDF', label: '1 EUR = ? CDF', base: 'EUR' as const, quote: 'CDF' as const },
  { id: 'EUR_USD', label: '1 EUR = ? USD', base: 'EUR' as const, quote: 'USD' as const },
  { id: 'GBP_USD', label: '1 GBP = ? USD', base: 'GBP' as const, quote: 'USD' as const },
];

export function ExchangeRates() {
  const churchId = useChurchScope();
  const [history, setHistory] = useState<RateHistoryItem[]>([]);
  const [pairId, setPairId] = useState('USD_CDF');
  const pair = PAIRS.find((p) => p.id === pairId) ?? PAIRS[0];
  const [rateValue, setRateValue] = useState('3000');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => api.getRateHistory().then((r) => setHistory(r.data)).catch((e) => setError(e.message));

  useEffect(() => { if (churchId) load(); }, [churchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const body = {
        effectiveDate,
        baseCurrency: pair.base,
        quoteCurrency: pair.quote,
        rateValue,
      };
      const result = await api.setRate(body);
      setSuccess(`Taux enregistré. ${result.data?.recalculatedOperations ?? 0} opération(s) recalculée(s).`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <>
      <div className="page-header"><h2>Taux de change</h2></div>
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="panel">
        <h3>Définir le taux du jour</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Saisissez le taux dans le sens de votre choix : <strong>1 USD = X CDF</strong> ou <strong>1 CDF = X USD</strong>.
          Les conversions sont automatiques dans tout le système.
        </p>

        <div className="rate-toggle">
          {PAIRS.map((p) => (
            <button key={p.id} type="button" className={pairId === p.id ? 'active' : ''} onClick={() => setPairId(p.id)}>
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label>Date effective</label>
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>{pair.label}</label>
            <input
              type="number"
              step="0.000001"
              min="0"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ alignSelf: 'end' }}>
            <button type="submit" className="btn btn-primary">Enregistrer le taux</button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h3>Historique des taux</h3>
        <table>
          <thead>
            <tr><th>Date</th><th>Taux</th><th>Paire de devises</th></tr>
          </thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.exchangeRateId}>
                <td>{r.effectiveDate}</td>
                <td><strong>{r.display}</strong></td>
                <td>{r.baseCurrency}/{r.quoteCurrency}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucun taux enregistré</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
