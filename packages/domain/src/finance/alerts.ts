import type { MoneyMicro, CurrencyCode } from './money';
import { newId } from '../common/uid';

export type AlertCode =
  | 'SOLDE_FAIBLE'
  | 'FONDS_INSUFFISANT'
  | 'SAUVEGARDE_ECHOUEE'
  | 'MODIFICATION_IMPORTANTE'
  | 'SUPPRESSION_IMPORTANTE'
  | 'CHANGEMENT_TAUX_CHANGE';

export type AlertEvent = {
  alertId: string;
  churchId: string;
  code: AlertCode;
  createdAt: string; // ISO timestamp
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata?: Record<string, unknown>;
};

export type AlertThresholds = {
  soldeFaibleUsdThresholdMicro?: bigint;
  // Fonds insuffisant peut dépendre de règles métier plus avancées.
  // Domain garde une structure ouverte.
  fondsInsuffisant?: {
    currency: CurrencyCode;
    thresholdMicro: bigint;
  };
  modificationImportanteDeltaAbsMicro?: bigint;
  suppressionImportante?: {
    enabled: boolean;
  };
};

export function evaluateSoldeFaible(params: {
  churchId: string;
  createdAt: string;
  soldeUsdsMicro: bigint;
  thresholdMicro: bigint;
}): AlertEvent | null {
  const { churchId, createdAt, soldeUsdsMicro, thresholdMicro } = params;
  if (soldeUsdsMicro < thresholdMicro) {
    return {
      alertId: newId('alert'),
      churchId,
      code: 'SOLDE_FAIBLE',
      createdAt,
      severity: 'warning',
      message: `Solde faible: ${soldeUsdsMicro.toString()} (micro) sous seuil ${thresholdMicro.toString()}`,
    };
  }
  return null;
}

export function evaluateModificationImportante(params: {
  churchId: string;
  createdAt: string;
  deltaAbsMicro: bigint;
  thresholdAbsMicro: bigint;
}): AlertEvent | null {
  const { churchId, createdAt, deltaAbsMicro, thresholdAbsMicro } = params;
  if (deltaAbsMicro >= thresholdAbsMicro) {
    return {
      alertId: newId('alert'),
      churchId,
      code: 'MODIFICATION_IMPORTANTE',
      createdAt,
      severity: 'info',
      message: `Modification importante: delta ${deltaAbsMicro.toString()} >= ${thresholdAbsMicro.toString()}`,
    };
  }
  return null;
}

export function moneyEqualsMicro(a: MoneyMicro, b: MoneyMicro): boolean {
  return a.currency === b.currency && a.amountMicro === b.amountMicro;
}

