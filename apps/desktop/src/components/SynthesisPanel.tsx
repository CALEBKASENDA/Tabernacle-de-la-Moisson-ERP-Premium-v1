import type { SynthesisBlock, SynthesisRubrique } from '../api/client';
import { exporterSyntheseExcel, exporterSynthesePdf, exporterSyntheseCsv } from '../utils/exportSynthesis';
import { fmtMicro } from '../utils/format';

function RubriquesTable({
  rubriques,
  recettesTotales,
  depensesTotales,
  totalGeneral,
}: {
  rubriques: SynthesisRubrique[];
  recettesTotales: string;
  depensesTotales: string;
  totalGeneral: string;
}) {
  const soldeGeneral = Number(totalGeneral);
  return (
    <table className="rubriques-table">
      <thead>
        <tr>
          <th>Rubrique</th>
          <th>Recettes (USD)</th>
          <th>Dépenses (USD)</th>
          <th>Solde rubrique (USD)</th>
        </tr>
      </thead>
      <tbody>
        {rubriques.map((r) => {
          const solde = Number(r.soldeUsd);
          return (
            <tr key={r.categoryId}>
              <td>{r.name}</td>
              <td className="positive">{fmtMicro(r.recettesUsd)}</td>
              <td className="negative">{fmtMicro(r.depensesUsd)}</td>
              <td className={solde >= 0 ? 'positive' : 'negative'}>{fmtMicro(r.soldeUsd)}</td>
            </tr>
          );
        })}
        {rubriques.length === 0 && (
          <tr>
            <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>
              Aucune rubrique configurée
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr className="total-general-row">
          <td><strong>Total général</strong></td>
          <td className="positive"><strong>{fmtMicro(recettesTotales)}</strong></td>
          <td className="negative"><strong>{fmtMicro(depensesTotales)}</strong></td>
          <td className={soldeGeneral >= 0 ? 'positive' : 'negative'}>
            <strong>{fmtMicro(totalGeneral)}</strong>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

export function SynthesisPanel({
  title,
  block,
  eglise,
}: {
  title: string;
  block: SynthesisBlock;
  eglise?: string;
}) {
  const totalGeneral = Number(block.soldeUsd);
  return (
    <div className="synthesis-panel-inner">
      <div className="synthesis-panel-header">
        <div className="export-actions" style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => exporterSyntheseCsv({ titre: title, block, eglise })}
          >
            Exporter CSV
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => exporterSynthesePdf({ titre: title, block, eglise })}
          >
            Exporter PDF
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => exporterSyntheseExcel({ titre: title, block, eglise })}
          >
            Exporter Excel
          </button>
        </div>
      </div>
      <div className="synthesis-totals">
        <div className="synthesis-total">
          <span>Total des recettes</span>
          <strong className="positive">{fmtMicro(block.recettesUsd)} USD</strong>
        </div>
        <div className="synthesis-total">
          <span>Total des dépenses</span>
          <strong className="negative">{fmtMicro(block.depensesUsd)} USD</strong>
        </div>
        <div className="synthesis-total synthesis-total-general">
          <span>Total général</span>
          <small className="total-general-formule">Recettes − Dépenses</small>
          <strong className={totalGeneral >= 0 ? 'positive' : 'negative'}>{fmtMicro(block.soldeUsd)} USD</strong>
        </div>
        <div className="synthesis-total">
          <span>Opérations</span>
          <strong>{block.nombreOperations}</strong>
        </div>
      </div>
      <RubriquesTable
        rubriques={block.rubriques ?? []}
        recettesTotales={block.recettesUsd}
        depensesTotales={block.depensesUsd}
        totalGeneral={block.soldeUsd}
      />
    </div>
  );
}
