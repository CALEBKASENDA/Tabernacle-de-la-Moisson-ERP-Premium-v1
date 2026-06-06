import type { TenantContext } from '../tenantContext';
import type { SqliteDatabase } from '../sqlite/sqliteDatabase';
import type { SyncEventIngestInput } from '../repositories/auditRepository';
import { ExchangeRateRepository } from '../repositories/exchangeRateRepository';
import { FinancialOperationRepository } from '../repositories/financialOperationRepository';
import {
  computeFinancialOperation,
  formatMoneyMicro,
  parseMoneyMicro,
  type PiecePrefix,
} from '@tabernacle/erp-premium-domain';

/** Applique un événement sync distant sur la base locale (sans re-journaliser). */
export class SyncReplayService {
  private readonly exchangeRates: ExchangeRateRepository;
  private readonly operations: FinancialOperationRepository;

  constructor(private readonly db: SqliteDatabase) {
    this.exchangeRates = new ExchangeRateRepository(db);
    this.operations = new FinancialOperationRepository(db);
  }

  applyEvent(ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    const ctx: TenantContext = {
      churchId: ev.churchId,
      userId: 'sync',
      sessionId: 'sync',
      workstationId: 'sync',
    };

    if (ev.entityType === 'financial_operation') {
      return this.applyFinancialOperation(ctx, ev);
    }

    return Promise.resolve({ applied: false, reason: `Type non supporté: ${ev.entityType}` });
  }

  private async applyFinancialOperation(
    ctx: TenantContext,
    ev: SyncEventIngestInput
  ): Promise<{ applied: boolean; reason?: string }> {
    const op = ev.operation.toUpperCase();

    if (op === 'CREATE') {
      return this.applyCreate(ctx, ev);
    }
    if (op === 'DELETE') {
      return this.applyDelete(ctx, ev);
    }
    if (op === 'UPDATE') {
      return this.applyUpdate(ctx, ev);
    }
    if (op === 'RESTORE') {
      return this.applyRestore(ctx, ev);
    }

    return Promise.resolve({ applied: false, reason: `Opération ${ev.operation} non supportée` });
  }

  private async applyCreate(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    const existing = this.db.get<{ operation_id: string }>(
      `SELECT operation_id FROM financial_operation WHERE church_id=@church_id AND operation_id=@id`,
      { church_id: ctx.churchId, id: ev.entityId }
    );
    if (existing) return { applied: false, reason: 'Déjà présent' };

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(ev.payloadJson) as Record<string, unknown>;
    } catch {
      return { applied: false, reason: 'Payload JSON invalide' };
    }

    const pieceType = String(payload.pieceType ?? 'REC') as PiecePrefix;
    const opDate = String(payload.opDate ?? new Date().toISOString().slice(0, 10));
    const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx, effectiveDate: opDate });
    if (!rate) return { applied: false, reason: `Taux absent pour ${opDate}` };

    const receiptsCdf = String(payload.receiptsCdf ?? '0');
    const receiptsUsd = String(payload.receiptsUsd ?? '0');
    const expensesCdf = String(payload.expensesCdf ?? '0');
    const expensesUsd = String(payload.expensesUsd ?? '0');

    const computed = computeFinancialOperation({
      pieceType,
      opDate,
      receiptsCdfMicro: parseMoneyMicro('CDF', receiptsCdf).amountMicro,
      receiptsUsdMicro: parseMoneyMicro('USD', receiptsUsd).amountMicro,
      expensesCdfMicro: parseMoneyMicro('CDF', expensesCdf).amountMicro,
      expensesUsdMicro: parseMoneyMicro('USD', expensesUsd).amountMicro,
      exchangeRate: rate,
    });

    if (!String(payload.categoryId ?? '').trim()) {
      return { applied: false, reason: 'categoryId manquant' };
    }

    const pieceNumber = String(payload.pieceNumber ?? `${pieceType}-SYNC-${ev.entityId.slice(-8)}`);

    await this.operations.create({
      ctx,
      operation: {
        operationId: ev.entityId,
        pieceNumber,
        opDate,
        pieceType,
        label: String(payload.label ?? 'Sync'),
        beneficiary: payload.beneficiary != null ? String(payload.beneficiary) : null,
        categoryId: String(payload.categoryId ?? ''),
        fundId: payload.fundId != null ? String(payload.fundId) : null,
        eventId: payload.eventId != null ? String(payload.eventId) : null,
        receiptsCdf,
        receiptsUsdConverted: formatMoneyMicro({ currency: 'USD', amountMicro: computed.receiptsUsdConvertedMicro }),
        receiptsUsd,
        expensesCdf,
        expensesUsdConverted: formatMoneyMicro({ currency: 'USD', amountMicro: computed.expensesUsdConvertedMicro }),
        expensesUsd,
        observation: payload.observation != null ? String(payload.observation) : null,
        exchangeRateUsdId: rate.exchangeRateId,
        usdRateQuotePer1Usd: formatMoneyMicro({ currency: 'CDF', amountMicro: rate.rateQuotePer1BaseMicro }),
        isLockedByClosure: false,
      },
    });

    return { applied: true };
  }

  private async applyDelete(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    let meta: { reason?: string } = {};
    try {
      meta = JSON.parse(ev.payloadJson) as { reason?: string };
    } catch {
      /* ignore */
    }
    const reason = meta.reason ?? 'Sync DELETE';
    await this.operations.softDelete({ ctx, operationId: ev.entityId, reason });
    return { applied: true };
  }

  private async applyUpdate(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    let patch: Record<string, unknown>;
    try {
      patch = JSON.parse(ev.payloadJson) as Record<string, unknown>;
    } catch {
      return { applied: false, reason: 'Payload UPDATE invalide' };
    }
    await this.operations.update({
      ctx,
      operationId: ev.entityId,
      patch: {
        label: patch.label != null ? String(patch.label) : undefined,
        beneficiary: patch.beneficiary != null ? String(patch.beneficiary) : undefined,
        categoryId: patch.categoryId != null ? String(patch.categoryId) : undefined,
        fundId: patch.fundId !== undefined ? (patch.fundId != null ? String(patch.fundId) : null) : undefined,
        opDate: patch.opDate != null ? String(patch.opDate) : undefined,
        observation: patch.observation !== undefined ? (patch.observation != null ? String(patch.observation) : null) : undefined,
      },
    });
    return { applied: true };
  }

  private async applyRestore(ctx: TenantContext, ev: SyncEventIngestInput): Promise<{ applied: boolean; reason?: string }> {
    await this.operations.restore({ ctx, operationId: ev.entityId });
    return { applied: true };
  }
}
