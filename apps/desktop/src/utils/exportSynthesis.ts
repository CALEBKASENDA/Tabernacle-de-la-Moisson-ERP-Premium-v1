import type { SynthesisBlock } from '../api/client';

function montantFormate(micro: string): string {
  return (Number(micro) / 1_000_000).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function nomFichier(titre: string, extension: string): string {
  const slug = titre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}_${new Date().toISOString().slice(0, 10)}.${extension}`;
}

function telecharger(nom: string, contenu: BlobPart, type: string): void {
  const blob = new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(url);
}

function echapperXml(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lignesTableau(block: SynthesisBlock): string[][] {
  const rubriques = (block.rubriques ?? []).map((r) => [
    r.name,
    montantFormate(r.recettesUsd),
    montantFormate(r.depensesUsd),
    montantFormate(r.soldeUsd),
  ]);
  return [
    ...rubriques,
    [
      'TOTAL GÉNÉRAL (Recettes − Dépenses)',
      montantFormate(block.recettesUsd),
      montantFormate(block.depensesUsd),
      montantFormate(block.soldeUsd),
    ],
  ];
}

export function exporterSyntheseExcel(params: {
  titre: string;
  block: SynthesisBlock;
  eglise?: string;
}): void {
  const { titre, block, eglise } = params;
  const lignes = lignesTableau(block);

  const cellules = (valeurs: string[]) =>
    valeurs
      .map(
        (v) =>
          `<Cell><Data ss:Type="String">${echapperXml(v)}</Data></Cell>`
      )
      .join('');

  const meta = [
    `<Row>${cellules([titre])}</Row>`,
    eglise ? `<Row>${cellules([`Église : ${eglise}`])}</Row>` : '',
    `<Row>${cellules([`Période : du ${block.dateFrom} au ${block.dateTo}`])}</Row>`,
    `<Row>${cellules([`Nombre d'opérations : ${block.nombreOperations}`])}</Row>`,
    `<Row>${cellules([`Total général (Recettes − Dépenses) : ${montantFormate(block.soldeUsd)} USD`])}</Row>`,
    '<Row></Row>',
    `<Row>${cellules(['Rubrique', 'Recettes (USD)', 'Dépenses (USD)', 'Solde (USD)'])}</Row>`,
    ...lignes.map((l) => `<Row>${cellules(l)}</Row>`),
  ]
    .filter(Boolean)
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Synthèse">
    <Table>${meta}</Table>
  </Worksheet>
</Workbook>`;

  telecharger(nomFichier(titre, 'xls'), `\uFEFF${xml}`, 'application/vnd.ms-excel;charset=utf-8');
}

export function exporterSyntheseCsv(params: {
  titre: string;
  block: SynthesisBlock;
  eglise?: string;
}): void {
  const { titre, block, eglise } = params;
  const lignes = lignesTableau(block);
  const header = ['Rubrique', 'Recettes (USD)', 'Dépenses (USD)', 'Solde (USD)'];
  const meta = [
    titre,
    eglise ? `Église : ${eglise}` : '',
    `Période : du ${block.dateFrom} au ${block.dateTo}`,
    `Opérations : ${block.nombreOperations}`,
  ].filter(Boolean);
  const rows = [
    ...meta.map((m) => [m, '', '', '']),
    [],
    header,
    ...lignes,
  ];
  const csv = rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  telecharger(nomFichier(titre, 'csv'), `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}

export function exporterSynthesePdf(params: {
  titre: string;
  block: SynthesisBlock;
  eglise?: string;
}): void {
  const { titre, block, eglise } = params;
  const lignes = lignesTableau(block);

  const lignesHtml = lignes
    .map(
      (l, i) =>
        `<tr${i === lignes.length - 1 ? ' class="totaux"' : ''}>${l.map((c) => `<td>${echapperXml(c)}</td>`).join('')}</tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${echapperXml(titre)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    h2 { font-size: 15px; margin: 0 0 12px; color: #333; }
    .meta { font-size: 12px; color: #555; margin-bottom: 16px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #1e3a5f; color: #fff; }
    tr.totaux td { font-weight: bold; background: #f3f4f6; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Tabernacle de la Moisson ERP</h1>
  <h2>${echapperXml(titre)}</h2>
  <div class="meta">
    ${eglise ? `<div>Église : ${echapperXml(eglise)}</div>` : ''}
    <div>Période : du ${block.dateFrom} au ${block.dateTo}</div>
    <div>Nombre d'opérations : ${block.nombreOperations}</div>
    <div><strong>Total général (Recettes − Dépenses) : ${montantFormate(block.soldeUsd)} USD</strong></div>
  </div>
  <table>
    <thead>
      <tr><th>Rubrique</th><th>Recettes (USD)</th><th>Dépenses (USD)</th><th>Solde (USD)</th></tr>
    </thead>
    <tbody>${lignesHtml}</tbody>
  </table>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const fenetre = window.open('', '_blank');
  if (!fenetre) {
    telecharger(
      nomFichier(titre, 'html'),
      html,
      'text/html;charset=utf-8'
    );
    return;
  }
  fenetre.document.open();
  fenetre.document.write(html);
  fenetre.document.close();
}
