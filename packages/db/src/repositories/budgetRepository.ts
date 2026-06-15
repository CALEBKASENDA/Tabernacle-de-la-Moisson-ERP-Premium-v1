import type { TenantContext } from '../tenantContext';
import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import { newId, parseMoneyMicro, computeBudgetExecution } from '@tabernacle/erp-premium-domain';

export class BudgetRepository {
  constructor(private readonly db: SqliteDatabase) {}

  createBudget(params: {
    ctx: TenantContext;
    budgetType: 'ANNUAL' | 'SEMIANNUAL' | 'QUARTERLY' | 'MONTHLY';
    periodStart: string;
    periodEnd: string;
    fiscalYear?: number;
  }): string {
    const now = new Date().toISOString();
    const id = newId('budget');
    this.db.run(
      `INSERT INTO finance_budget (budget_id, church_id, budget_type, period_start, period_end, fiscal_year, created_at, created_by_user_id, updated_at, updated_by_user_id)
       VALUES (@id, @church_id, @type, @start, @end, @year, @now, @user, @now, @user)`,
      {
        id,
        church_id: params.ctx.churchId,
        type: params.budgetType,
        start: params.periodStart,
        end: params.periodEnd,
        year: params.fiscalYear ?? null,
        now,
        user: params.ctx.userId,
      }
    );
    return id;
  }

  upsertBudgetLine(params: {
    ctx: TenantContext;
    budgetId: string;
    categoryId: string;
    fundId?: string | null;
    plannedReceiptsUsd: string;
    plannedExpensesUsd: string;
  }): string {
    const now = new Date().toISOString();

    const existing = this.db.get<{ budget_line_id: string }>(
      `SELECT budget_line_id
       FROM finance_budget_line
       WHERE church_id=@church_id AND budget_id=@budget_id AND category_id=@cat
         AND ( (@fund_id IS NULL AND fund_id IS NULL) OR fund_id=@fund_id )`,
      { church_id: params.ctx.churchId, budget_id: params.budgetId, cat: params.categoryId, fund_id: params.fundId ?? null }
    );

    if (!existing) {
      const id = newId('bl');
      this.db.run(
        `INSERT INTO finance_budget_line (
          budget_line_id, budget_id, church_id, category_id, fund_id,
          planned_receipts_usd, planned_expenses_usd, created_at, updated_at
        ) VALUES (
          @id, @budget_id, @church_id, @cat, @fund,
          @pr, @pe, @now, @now
        )`,
        {
          id,
          budget_id: params.budgetId,
          church_id: params.ctx.churchId,
          cat: params.categoryId,
          fund: params.fundId ?? null,
          pr: params.plannedReceiptsUsd,
          pe: params.plannedExpensesUsd,
          now,
        }
      );
      return id;
    }

    this.db.run(
      `UPDATE finance_budget_line
          SET planned_receipts_usd=@pr, planned_expenses_usd=@pe, updated_at=@now
        WHERE budget_line_id=@id`,
      { pr: params.plannedReceiptsUsd, pe: params.plannedExpensesUsd, now, id: existing.budget_line_id }
    );
    return existing.budget_line_id;
  }

  computeBudgetExecution(params: { ctx: TenantContext; budgetId: string }) {
    const budget = this.db.get<{
      budget_id: string;
      period_start: string;
      period_end: string;
      church_id: string;
    }>(
      `SELECT budget_id, period_start, period_end, church_id
       FROM finance_budget
       WHERE church_id=@church_id AND budget_id=@id`,
      { church_id: params.ctx.churchId, id: params.budgetId }
    );
    if (!budget) throw new Error('Budget introuvable');

    const lines = this.db.all<{
      budget_line_id: string;
      category_id: string;
      fund_id: string | null;
      planned_receipts_usd: string;
      planned_expenses_usd: string;
    }>(
      `SELECT budget_line_id, category_id, fund_id, planned_receipts_usd, planned_expenses_usd
       FROM finance_budget_line
       WHERE church_id=@church_id AND budget_id=@budget_id`,
      { church_id: params.ctx.churchId, budget_id: params.budgetId }
    );

    const executions = lines.map((line) => {
      const realized = this.db.get<{ receipts: string; expenses: string }>(
        `SELECT
           COALESCE(SUM(o.receipts_usd_converted + o.receipts_usd), 0) AS receipts,
           COALESCE(SUM(o.expenses_usd + o.expenses_usd_converted), 0) AS expenses
         FROM financial_operation o
        WHERE o.church_id=@church_id
          AND o.op_date>=@start AND o.op_date<=@end
          AND o.deleted_at IS NULL AND o.archived_at IS NULL
          AND o.category_id=@cat
          AND (@fund_id IS NULL OR o.fund_id=@fund_id)`,
        {
          church_id: params.ctx.churchId,
          start: budget.period_start,
          end: budget.period_end,
          cat: line.category_id,
          fund_id: line.fund_id,
        }
      );

      const plannedReceiptsUsdMicro = parseMoneyMicro('USD', String(line.planned_receipts_usd)).amountMicro;
      const plannedExpensesUsdMicro = parseMoneyMicro('USD', String(line.planned_expenses_usd)).amountMicro;
      const actualReceiptsUsdMicro = parseMoneyMicro('USD', String(realized?.receipts ?? '0')).amountMicro;
      const actualExpensesUsdMicro = parseMoneyMicro('USD', String(realized?.expenses ?? '0')).amountMicro;

      const execReceipts = computeBudgetExecution(plannedReceiptsUsdMicro, actualReceiptsUsdMicro);
      const execExpenses = computeBudgetExecution(plannedExpensesUsdMicro, actualExpensesUsdMicro);

      return {
        budgetLineId: line.budget_line_id,
        categoryId: line.category_id,
        fundId: line.fund_id,
        plannedReceiptsUsdMicro,
        actualReceiptsUsdMicro,
        receiptsExecution: execReceipts,
        plannedExpensesUsdMicro,
        actualExpensesUsdMicro,
        expensesExecution: execExpenses,
      };
    });

    return executions;
  }
}

