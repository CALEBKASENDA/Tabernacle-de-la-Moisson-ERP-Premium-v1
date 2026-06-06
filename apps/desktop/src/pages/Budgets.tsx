import { useEffect, useState } from 'react';
import { api, type Budget, type BudgetExecutionItem, type Category } from '../api/client';
import { useChurchScope } from '../hooks/useChurchScope';
import { fmtMicro } from '../utils/format';

export function Budgets() {
  const churchId = useChurchScope();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [execution, setExecution] = useState<BudgetExecutionItem[]>([]);
  const [selectedBudget, setSelectedBudget] = useState('');
  const [error, setError] = useState('');
  const [budgetForm, setBudgetForm] = useState({
    budgetType: 'ANNUAL' as 'ANNUAL' | 'SEMIANNUAL' | 'QUARTERLY' | 'MONTHLY',
    periodStart: new Date().toISOString().slice(0, 4) + '-01-01',
    periodEnd: new Date().toISOString().slice(0, 4) + '-12-31',
    fiscalYear: new Date().getFullYear(),
  });
  const [lineForm, setLineForm] = useState({
    categoryId: '',
    plannedReceiptsUsd: '0',
    plannedExpensesUsd: '0',
  });

  const load = () => {
    Promise.all([api.getBudgets(), api.getCategories()])
      .then(([b, c]) => {
        setBudgets(b.data);
        setCategories(c.data);
        if (!lineForm.categoryId && c.data[0]) setLineForm((p) => ({ ...p, categoryId: c.data[0].category_id }));
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => { if (churchId) load(); }, [churchId]);

  const loadExecution = (budgetId: string) => {
    setSelectedBudget(budgetId);
    api.getBudgetExecution(budgetId).then((r) => setExecution(r.data ?? [])).catch((e) => setError(e.message));
  };

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createBudget(budgetForm);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBudget) return;
    try {
      await api.upsertBudgetLine(selectedBudget, lineForm);
      loadExecution(selectedBudget);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const typeLabel: Record<string, string> = {
    ANNUAL: 'Annuel',
    SEMIANNUAL: 'Semestriel',
    QUARTERLY: 'Trimestriel',
    MONTHLY: 'Mensuel',
  };

  return (
    <>
      <div className="page-header"><h2>Budgets</h2></div>
      {error && <div className="error-msg">{error}</div>}

      <div className="panel">
        <h3>Nouveau budget</h3>
        <form onSubmit={handleCreateBudget} className="form-grid">
          <div className="form-group">
            <label>Type</label>
            <select value={budgetForm.budgetType} onChange={(e) => setBudgetForm({ ...budgetForm, budgetType: e.target.value as typeof budgetForm.budgetType })}>
              <option value="ANNUAL">Annuel</option>
              <option value="SEMIANNUAL">Semestriel</option>
              <option value="QUARTERLY">Trimestriel</option>
              <option value="MONTHLY">Mensuel</option>
            </select>
          </div>
          <div className="form-group">
            <label>Début</label>
            <input type="date" value={budgetForm.periodStart} onChange={(e) => setBudgetForm({ ...budgetForm, periodStart: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Fin</label>
            <input type="date" value={budgetForm.periodEnd} onChange={(e) => setBudgetForm({ ...budgetForm, periodEnd: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-primary">Créer</button>
        </form>
      </div>

      <div className="panel table-scroll">
        <h3>Budgets existants</h3>
        <table>
          <thead>
            <tr><th>Type</th><th>Période</th><th>Créé le</th><th></th></tr>
          </thead>
          <tbody>
            {budgets.map((b) => (
              <tr key={b.budget_id}>
                <td>{typeLabel[b.budget_type] ?? b.budget_type}</td>
                <td>{b.period_start} → {b.period_end}</td>
                <td>{b.created_at?.slice(0, 10)}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => loadExecution(b.budget_id)}>Exécution</button>
                </td>
              </tr>
            ))}
            {budgets.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucun budget</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedBudget && (
        <div className="panel">
          <h3>Ligne budgétaire</h3>
          <form onSubmit={handleAddLine} className="form-grid">
            <div className="form-group">
              <label>Rubrique</label>
              <select value={lineForm.categoryId} onChange={(e) => setLineForm({ ...lineForm, categoryId: e.target.value })} required>
                {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Recettes prévues (USD)</label>
              <input type="number" step="0.01" value={lineForm.plannedReceiptsUsd} onChange={(e) => setLineForm({ ...lineForm, plannedReceiptsUsd: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Dépenses prévues (USD)</label>
              <input type="number" step="0.01" value={lineForm.plannedExpensesUsd} onChange={(e) => setLineForm({ ...lineForm, plannedExpensesUsd: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary">Ajouter / mettre à jour</button>
          </form>
        </div>
      )}

      {selectedBudget && (
        <div className="panel table-scroll">
          <h3>Exécution budgétaire</h3>
          <table>
            <thead>
              <tr>
                <th>Rubrique</th>
                <th>Prévu rec.</th>
                <th>Réalisé rec.</th>
                <th>Taux rec.</th>
                <th>Prévu dép.</th>
                <th>Réalisé dép.</th>
                <th>Taux dép.</th>
              </tr>
            </thead>
            <tbody>
              {execution.map((l) => (
                <tr key={l.budgetLineId}>
                  <td>{categories.find((c) => c.category_id === l.categoryId)?.name ?? l.categoryId}</td>
                  <td>{fmtMicro(l.plannedReceiptsUsdMicro)}</td>
                  <td className="positive">{fmtMicro(l.actualReceiptsUsdMicro)}</td>
                  <td>{l.receiptsExecution.tauxExecutionPercent.toFixed(1)} %</td>
                  <td>{fmtMicro(l.plannedExpensesUsdMicro)}</td>
                  <td className="negative">{fmtMicro(l.actualExpensesUsdMicro)}</td>
                  <td>{l.expensesExecution.tauxExecutionPercent.toFixed(1)} %</td>
                </tr>
              ))}
              {execution.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)' }}>Aucune ligne</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
