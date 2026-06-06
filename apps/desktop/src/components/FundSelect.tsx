import type { Fund } from '../api/client';

export function FundSelect({
  funds,
  value,
  onChange,
  id,
}: {
  funds: Fund[];
  value: string;
  onChange: (fundId: string) => void;
  id?: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Aucun (facultatif) —</option>
      {funds.map((f) => (
        <option key={f.fund_id} value={f.fund_id}>{f.name}</option>
      ))}
    </select>
  );
}
