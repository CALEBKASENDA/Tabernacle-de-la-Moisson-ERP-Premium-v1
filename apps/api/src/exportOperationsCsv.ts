type OpRow = Record<string, unknown>;

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function operationsToCsv(rows: OpRow[]): string {
  const headers = [
    'Date',
    'Pièce',
    'Type',
    'Libellé',
    'Bénéficiaire',
    'Rubrique',
    'Fonds',
    'Événement',
    'Recettes CDF',
    'Recettes USD conv.',
    'Recettes USD',
    'Dépenses CDF',
    'Dépenses USD',
    'Taux',
    'Observation',
    'Créateur',
    'Créé le',
    'Modifié le',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.op_date,
        r.piece_number,
        r.piece_type,
        r.label,
        r.beneficiary,
        r.category_name,
        r.fund_name,
        r.event_title,
        r.receipts_cdf,
        r.receipts_usd_converted,
        r.receipts_usd,
        r.expenses_cdf,
        r.expenses_usd,
        r.usd_rate_quote_per_1_usd,
        r.observation,
        r.created_by_name,
        r.created_at,
        r.updated_at,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return lines.join('\n');
}
