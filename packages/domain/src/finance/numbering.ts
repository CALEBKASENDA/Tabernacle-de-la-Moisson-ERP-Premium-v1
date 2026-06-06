export type PiecePrefix = 'REC' | 'DEP' | 'CAI' | 'BAN';

export function getYearFromIsoDate(date: string): number {
  // Expect YYYY-MM-DD
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(date);
  if (!m) throw new Error(`Invalid ISO date: ${date}`);
  return Number(m[1]);
}

export function formatPieceNumber(params: {
  prefix: PiecePrefix;
  year: number;
  sequence: number; // 1..n
}): string {
  const { prefix, year, sequence } = params;
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new Error(`Invalid year: ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error(`Invalid sequence: ${sequence}`);
  }

  const seq = sequence.toString().padStart(6, '0');
  return `${prefix}-${year}-${seq}`;
}

