import type { FinancialOperationComputed } from './financial-operation';

export type OperationSummaryRow = {
  receiptsUsdConvertedMicro: bigint;
  receiptsUsdDirectMicro: bigint;
  expensesUsdMicro: bigint;
  expensesUsdConvertedMicro: bigint;
};

export type SummaryResult = {
  totalReceiptsUsdMicro: bigint;
  totalExpensesUsdMicro: bigint;
  soldeNetUsdMicro: bigint;
  operationCount: number;
};

export function aggregateOperations(rows: OperationSummaryRow[]): SummaryResult {
  let totalReceiptsUsdMicro = 0n;
  let totalExpensesUsdMicro = 0n;
  let totalExpensesConvertedUsdMicro = 0n;

  for (const row of rows) {
    totalReceiptsUsdMicro += row.receiptsUsdConvertedMicro + row.receiptsUsdDirectMicro;
    totalExpensesUsdMicro += row.expensesUsdMicro;
    totalExpensesConvertedUsdMicro += row.expensesUsdConvertedMicro;
  }

  const totalExpenses = totalExpensesUsdMicro + totalExpensesConvertedUsdMicro;
  return {
    totalReceiptsUsdMicro,
    totalExpensesUsdMicro: totalExpenses,
    soldeNetUsdMicro: totalReceiptsUsdMicro - totalExpenses,
    operationCount: rows.length,
  };
}

export type CategorySummary = {
  categoryId: string;
  categoryName: string;
  receiptsUsdMicro: bigint;
  expensesUsdMicro: bigint;
  soldeUsdMicro: bigint;
};

export type FundSummary = {
  fundId: string;
  fundName: string;
  balanceUsdMicro: bigint;
};

export type BudgetExecution = {
  plannedUsdMicro: bigint;
  actualUsdMicro: bigint;
  ecartUsdMicro: bigint;
  tauxExecutionPercent: number;
};

export function computeBudgetExecution(plannedUsdMicro: bigint, actualUsdMicro: bigint): BudgetExecution {
  const ecartUsdMicro = actualUsdMicro - plannedUsdMicro;
  const tauxExecutionPercent =
    plannedUsdMicro === 0n ? 0 : Number((actualUsdMicro * 10000n) / plannedUsdMicro) / 100;
  return { plannedUsdMicro, actualUsdMicro, ecartUsdMicro, tauxExecutionPercent };
}
