import type { Operation } from '../api/client';
import { fmtMontant } from './format';

export function imprimerOperation(op: Operation, eglise?: string): void {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');
  if (!w) return;

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<title>Pièce ${op.piece_number}</title>
<style>
  body { font-family: Georgia, serif; margin: 24px; color: #111; }
  h1 { font-size: 1.2rem; margin: 0 0 4px; }
  .meta { color: #555; font-size: 0.85rem; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 0.9rem; }
  th { background: #f5f5f5; width: 35%; }
  @media print { body { margin: 12px; } }
</style></head><body>
  <h1>${eglise ?? 'Tabernacle de la Moisson'}</h1>
  <div class="meta">Pièce comptable — ${op.piece_type} ${op.piece_number}</div>
  <table>
    <tr><th>Date</th><td>${op.op_date}</td></tr>
    <tr><th>Libellé</th><td>${escapeHtml(op.label)}</td></tr>
    <tr><th>Bénéficiaire</th><td>${escapeHtml(op.beneficiary ?? '—')}</td></tr>
    <tr><th>Rubrique</th><td>${escapeHtml(op.category_name ?? '—')}</td></tr>
    <tr><th>Recettes CDF</th><td>${fmtMontant(op.receipts_cdf)}</td></tr>
    <tr><th>Recettes USD</th><td>${op.receipts_usd ?? '0'}</td></tr>
    <tr><th>Dépenses CDF</th><td>${fmtMontant(op.expenses_cdf)}</td></tr>
    <tr><th>Dépenses USD</th><td>${op.expenses_usd}</td></tr>
    <tr><th>Observation</th><td>${escapeHtml(op.observation ?? '—')}</td></tr>
    <tr><th>Créé par</th><td>${escapeHtml(op.created_by_name ?? '—')}</td></tr>
  </table>
  <script>window.onload = () => window.print();</script>
</body></html>`;

  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
