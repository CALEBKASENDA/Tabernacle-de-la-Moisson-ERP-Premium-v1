import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { evaluateSoldeFaible } from '@tabernacle/erp-premium-domain';
import { getAppContext } from './appContext';

export type AppNotification = {
  id: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

function storePath(dataDir: string, churchId: string): string {
  const safe = churchId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(dataDir, `notifications-${safe}.json`);
}

export function readNotifications(dataDir: string, churchId: string): AppNotification[] {
  const file = storePath(dataDir, churchId);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as AppNotification[];
  } catch {
    return [];
  }
}

function saveNotifications(dataDir: string, churchId: string, items: AppNotification[]): void {
  fs.writeFileSync(storePath(dataDir, churchId), JSON.stringify(items.slice(0, 100), null, 2), 'utf8');
}

export function generateSystemNotifications(dataDir: string, churchId: string): AppNotification[] {
  const { finance } = getAppContext();
  const generated: AppNotification[] = [];
  const now = new Date().toISOString();
  const ctx = { churchId, userId: 'system', sessionId: 'system', workstationId: 'system' };

  const pending = finance.audit.countPendingSync(churchId);
  if (pending > 0) {
    generated.push({
      id: `sync-pending-${pending}`,
      severity: 'warning',
      title: 'Synchronisation en attente',
      message: `${pending} événement(s) à envoyer vers le serveur cloud.`,
      createdAt: now,
      read: false,
    });
  }

  if (!process.env.TABERNACLE_DB_KEY?.trim()) {
    generated.push({
      id: 'db-key-missing',
      severity: 'warning',
      title: 'Chiffrement non activé',
      message: 'Ajoutez TABERNACLE_DB_KEY dans config\\.env pour chiffrer la base SQLCipher.',
      createdAt: now,
      read: false,
    });
  }

  try {
    const dash = finance.getFinanceDashboard(ctx);
    const soldeMicro = BigInt(dash.soldeGlobalUsd);
    const seuilMicro = BigInt(process.env.TABERNACLE_ALERT_SOLDE_USD_MICRO ?? '0');
    const alert = evaluateSoldeFaible({
      churchId,
      createdAt: now,
      soldeUsdsMicro: soldeMicro,
      thresholdMicro: seuilMicro,
    });
    if (alert) {
      generated.push({
        id: 'solde-faible',
        severity: 'danger',
        title: 'Solde global faible',
        message: `Le solde global (${(Number(soldeMicro) / 1_000_000).toFixed(2)} USD) est sous le seuil configuré.`,
        createdAt: now,
        read: false,
      });
    }

    const budgets = finance.listBudgets(ctx) as Array<{ budget_id: string; period_start: string; period_end: string }>;
    for (const b of budgets.slice(0, 3)) {
      const exec = finance.computeBudgetExecution({ ctx, budgetId: b.budget_id });
      for (const line of exec ?? []) {
        const prevu = BigInt(line.plannedExpensesUsdMicro ?? 0);
        const realise = BigInt(line.actualExpensesUsdMicro ?? 0);
        if (prevu > 0n && realise > prevu) {
          generated.push({
            id: `budget-over-${b.budget_id}-${line.categoryId}`,
            severity: 'warning',
            title: 'Dépassement budgétaire',
            message: `Budget ${b.period_start}→${b.period_end} : rubrique ${line.categoryId} — réalisé ${(Number(realise) / 1_000_000).toFixed(2)} USD > prévu ${(Number(prevu) / 1_000_000).toFixed(2)} USD.`,
            createdAt: now,
            read: false,
          });
          break;
        }
      }
    }
  } catch {
    // ignore dashboard errors during notification generation
  }

  const existing = readNotifications(dataDir, churchId);
  const merged = [...generated, ...existing.filter((e) => !generated.some((g) => g.id === e.id))];
  saveNotifications(dataDir, churchId, merged);
  return merged.filter((n) => !n.read);
}

export function markNotificationRead(dataDir: string, churchId: string, id: string): void {
  const items = readNotifications(dataDir, churchId).map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(dataDir, churchId, items);
}

export function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}
