export function fmtMicro(micro: string | number): string {
  const n = Number(micro) / 1_000_000;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtMontant(valeur: string | number, decimales = 2): string {
  return Number(valeur).toLocaleString('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}
