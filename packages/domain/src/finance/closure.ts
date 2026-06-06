export type ClosureType = 'MONTH' | 'QUARTER' | 'YEAR';

export type FinancialClosure = {
  closureId: string;
  churchId: string;
  closureType: ClosureType;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  status: 'active' | 'archived';
};

export function isDateLockedByClosures(params: {
  opDate: string; // YYYY-MM-DD
  closures: FinancialClosure[];
}): boolean {
  const { opDate, closures } = params;
  for (const c of closures) {
    if (c.status !== 'active') continue;
    if (opDate >= c.periodStart && opDate <= c.periodEnd) return true;
  }
  return false;
}

