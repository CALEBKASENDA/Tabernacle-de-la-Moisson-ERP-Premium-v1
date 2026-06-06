import type { ExchangeRate } from './exchange-rate';
import { convertCdfToUsd } from './exchange-rate';

export type FinancialOperationPieceType = 'REC' | 'DEP' | 'CAI' | 'BAN';

export type FinancialOperationDraft = {
  pieceType: FinancialOperationPieceType;
  opDate: string;
  receiptsCdfMicro: bigint;
  receiptsUsdMicro: bigint;
  expensesCdfMicro: bigint;
  expensesUsdMicro: bigint;
  observation?: string;
  exchangeRate: ExchangeRate;
};

export type FinancialOperationComputed = {
  receiptsUsdConvertedMicro: bigint;
  receiptsUsdDirectMicro: bigint;
  expensesUsdConvertedMicro: bigint;
  totalReceiptsUsdMicro: bigint;
  totalExpensesUsdMicro: bigint;
  totalExpensesUsdConvertedMicro: bigint;
  soldeNetUsdMicro: bigint;
};

export function computeFinancialOperation(params: FinancialOperationDraft): FinancialOperationComputed {
  const { receiptsCdfMicro, receiptsUsdMicro, expensesCdfMicro, expensesUsdMicro, exchangeRate } = params;

  if (receiptsCdfMicro < 0n) throw new Error('receiptsCdfMicro cannot be negative');
  if (receiptsUsdMicro < 0n) throw new Error('receiptsUsdMicro cannot be negative');
  if (expensesCdfMicro < 0n) throw new Error('expensesCdfMicro cannot be negative');
  if (expensesUsdMicro < 0n) throw new Error('expensesUsdMicro cannot be negative');

  const receiptsUsdConvertedMicro = convertCdfToUsd({ cdfMicro: receiptsCdfMicro, rate: exchangeRate });
  const expensesUsdConvertedMicro = convertCdfToUsd({ cdfMicro: expensesCdfMicro, rate: exchangeRate });

  const totalReceiptsUsdMicro = receiptsUsdConvertedMicro + receiptsUsdMicro;
  const totalExpensesUsdConvertedMicro = expensesUsdConvertedMicro;
  const totalExpensesUsdMicro = expensesUsdMicro;
  const soldeNetUsdMicro =
    totalReceiptsUsdMicro - (totalExpensesUsdMicro + totalExpensesUsdConvertedMicro);

  return {
    receiptsUsdConvertedMicro,
    receiptsUsdDirectMicro: receiptsUsdMicro,
    expensesUsdConvertedMicro,
    totalReceiptsUsdMicro,
    totalExpensesUsdMicro,
    totalExpensesUsdConvertedMicro,
    soldeNetUsdMicro,
  };
}
