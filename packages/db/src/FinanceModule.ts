import type { TenantContext } from './tenantContext';
import type { SqliteDatabase } from './sqlite/sqliteDatabase';
import { ensureFinanceSchema, seedChurchDefaults, ensureDefaultExchangeRate } from './schema/initFinanceSchema';
import { ExchangeRateRepository } from './repositories/exchangeRateRepository';
import { FinancialOperationRepository } from './repositories/financialOperationRepository';
import { NumberingSequenceRepository } from './repositories/numberingSequenceRepository';
import { AuditRepository } from './repositories/auditRepository';
import { ClosureRepository } from './repositories/closureRepository';
import { CategoryRepository } from './repositories/categoryRepository';
import { FundRepository } from './repositories/fundRepository';
import { EventRepository } from './repositories/eventRepository';
import { ReportRepository } from './repositories/reportRepository';
import { FinanceRecalculationService } from './services/recalculationService';
import { SyncReplayService } from './services/syncReplayService';
import { BankRepository } from './repositories/bankRepository';
import { BudgetRepository } from './repositories/budgetRepository';
import { AttachmentRepository } from './repositories/attachmentRepository';
import path from 'node:path';

import {
  computeFinancialOperation,
  formatPieceNumber,
  getYearFromIsoDate,
  formatMoneyMicro,
  parseMoneyMicro,
  buildAuditEntry,
  validateDeletionRequest,
  newId,
  formatRateDisplay,
  invertRate,
  convertCdfToUsd,
  type PiecePrefix,
} from '@tabernacle/erp-premium-domain';

export class FinanceModule {
  readonly exchangeRates: ExchangeRateRepository;
  readonly operations: FinancialOperationRepository;
  readonly categories: CategoryRepository;
  readonly funds: FundRepository;
  readonly events: EventRepository;
  readonly reports: ReportRepository;
  readonly banks: BankRepository;
  readonly budgets: BudgetRepository;
  readonly audit: AuditRepository;
  readonly closures: ClosureRepository;
  readonly attachments: AttachmentRepository;

  private readonly numbering: NumberingSequenceRepository;
  private readonly recalc: FinanceRecalculationService;
  private readonly syncReplay: SyncReplayService;

  constructor(private readonly db: SqliteDatabase, dataDir?: string) {
    const dir = dataDir ?? process.env.TABERNACLE_DATA_DIR ?? path.join(process.cwd(), 'data');
    this.exchangeRates = new ExchangeRateRepository(db);
    this.operations = new FinancialOperationRepository(db);
    this.categories = new CategoryRepository(db);
    this.funds = new FundRepository(db);
    this.events = new EventRepository(db);
    this.reports = new ReportRepository(db);
    this.banks = new BankRepository(db);
    this.budgets = new BudgetRepository(db);
    this.audit = new AuditRepository(db);
    this.closures = new ClosureRepository(db);
    this.attachments = new AttachmentRepository(db, dir);
    this.numbering = new NumberingSequenceRepository(db);
    this.recalc = new FinanceRecalculationService(db, this.audit);
    this.syncReplay = new SyncReplayService(db);
  }

  static bootstrap(db: SqliteDatabase, churchId: string, churchName: string, dataDir?: string): FinanceModule {
    ensureFinanceSchema(db);
    seedChurchDefaults(db, churchId, churchName);
    ensureDefaultExchangeRate(db, churchId);
    return new FinanceModule(db, dataDir);
  }

  // ─── TAUX DE CHANGE DYNAMIQUE ───────────────────────────────────────────

  getTauxDuJour(ctx: TenantContext) {
    const rate = this.exchangeRates.getTodayRate(ctx);
    if (!rate) return null;
    return {
      exchangeRateId: rate.exchangeRateId,
      effectiveDate: rate.effectiveDate,
      baseCurrency: rate.baseCurrency,
      quoteCurrency: rate.quoteCurrency,
      display: rate.display,
      inverseDisplay: rate.inverseDisplay,
      rateValue: formatMoneyMicro({
        currency: rate.quoteCurrency,
        amountMicro: rate.rateQuotePer1BaseMicro,
      }),
    };
  }

  async setExchangeRate(params: {
    ctx: TenantContext;
    effectiveDate: string;
    baseCurrency: 'USD' | 'CDF';
    quoteCurrency: 'USD' | 'CDF';
    rateValue: string;
  }) {
    // Anti-violation of financial closures: if the effective date is locked,
    // we do not allow changing the rate (because recalculation would mutate operations).
    // Admin override can be implemented later via a dedicated permission/policy.
    if (await this.closures.isDateLocked({ ctx: params.ctx, opDate: params.effectiveDate })) {
      throw new Error('Période clôturée — modification du taux interdite pour cette date');
    }

    const existing = this.exchangeRates.getRateForDate({
      ctx: params.ctx,
      effectiveDate: params.effectiveDate,
      currencyA: params.baseCurrency,
      currencyB: params.quoteCurrency,
    });

    const result = this.exchangeRates.upsertDynamicUsdCdf(params);

    this.audit.append(
      buildAuditEntry({
        churchId: params.ctx.churchId,
        sessionId: params.ctx.sessionId,
        workstationId: params.ctx.workstationId,
        actorUserId: params.ctx.userId,
        entityType: 'exchange_rate',
        entityId: result.exchangeRateId,
        action: existing ? 'UPDATE' : 'CREATE',
        oldValue: existing
          ? {
              base: existing.baseCurrency,
              quote: existing.quoteCurrency,
              rate: formatMoneyMicro({
                currency: existing.quoteCurrency,
                amountMicro: existing.rateQuotePer1BaseMicro,
              }),
            }
          : null,
        newValue: {
          base: params.baseCurrency,
          quote: params.quoteCurrency,
          rate: params.rateValue,
          display: formatRateDisplay(result.storedRate),
          inverse: formatRateDisplay(invertRate(result.storedRate)),
        },
        metadata: { effectiveDate: params.effectiveDate },
      })
    );

    const recalculated = await this.recalc.recalcFinancialOperationsForUsdCdfRate({
      ctx: params.ctx,
      effectiveDate: params.effectiveDate,
      usdExchangeRate: result.normalizedUsdCdf,
      exchangeRateId: result.exchangeRateId,
    });

    return {
      exchangeRateId: result.exchangeRateId,
      effectiveDate: params.effectiveDate,
      baseCurrency: result.storedRate.baseCurrency,
      quoteCurrency: result.storedRate.quoteCurrency,
      display: formatRateDisplay(result.storedRate),
      inverseDisplay: formatRateDisplay(invertRate(result.storedRate)),
      rateValue: formatMoneyMicro({
        currency: result.storedRate.quoteCurrency,
        amountMicro: result.storedRate.rateQuotePer1BaseMicro,
      }),
      recalculatedOperations: recalculated,
    };
  }

  listExchangeRateHistory(ctx: TenantContext, limit?: number) {
    return this.exchangeRates.listHistory({ ctx, limit });
  }

  // ─── OPÉRATIONS FINANCIÈRES ─────────────────────────────────────────────

  async createOperation(params: {
    ctx: TenantContext;
    pieceType: 'REC' | 'DEP' | 'CAI' | 'BAN';
    opDate: string;
    label: string;
    beneficiary?: string | null;
    categoryId: string;
    fundId?: string | null;
    eventId?: string | null;
    receiptsCdf: string;
    receiptsUsd?: string;
    expensesCdf: string;
    expensesUsd: string;
    observation?: string | null;
  }) {
    if (!params.label?.trim()) throw new Error('Libellé requis');
    if (!params.categoryId?.trim()) throw new Error('Rubrique requise');

    const isLocked = await this.closures.isDateLocked({ ctx: params.ctx, opDate: params.opDate });
    if (isLocked) throw new Error('Période clôturée — modification impossible');

    const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx: params.ctx, effectiveDate: params.opDate });
    if (!rate) {
      throw new Error(
        `Aucun taux USD/CDF pour le ${params.opDate}. Ouvrez « Taux de change » et enregistrez un taux (ex. 1 USD = 2800 CDF).`
      );
    }

    const receiptsCdfMicro = parseMoneyMicro('CDF', params.receiptsCdf).amountMicro;
    const receiptsUsdMicro = parseMoneyMicro('USD', params.receiptsUsd ?? '0').amountMicro;
    const expensesCdfMicro = parseMoneyMicro('CDF', params.expensesCdf).amountMicro;
    const expensesUsdMicro = parseMoneyMicro('USD', params.expensesUsd).amountMicro;

    const computed = computeFinancialOperation({
      pieceType: params.pieceType,
      opDate: params.opDate,
      receiptsCdfMicro,
      receiptsUsdMicro,
      expensesCdfMicro,
      expensesUsdMicro,
      exchangeRate: rate,
    });

    const year = getYearFromIsoDate(params.opDate);
    const sequence = await this.numbering.getNext({
      ctx: params.ctx,
      prefix: params.pieceType as PiecePrefix,
      year,
    });
    const pieceNumber = formatPieceNumber({ prefix: params.pieceType as PiecePrefix, year, sequence });
    const operationId = newId('op');

    await this.operations.create({
      ctx: params.ctx,
      operation: {
        operationId,
        pieceNumber,
        opDate: params.opDate,
        pieceType: params.pieceType,
        label: params.label,
        beneficiary: params.beneficiary ?? null,
        categoryId: params.categoryId,
        fundId: params.fundId ?? null,
        eventId: params.eventId ?? null,
        receiptsCdf: params.receiptsCdf,
        receiptsUsdConverted: formatMoneyMicro({
          currency: 'USD',
          amountMicro: computed.receiptsUsdConvertedMicro,
        }),
        receiptsUsd: params.receiptsUsd ?? '0',
        expensesCdf: params.expensesCdf,
        expensesUsdConverted: formatMoneyMicro({
          currency: 'USD',
          amountMicro: computed.expensesUsdConvertedMicro,
        }),
        expensesUsd: params.expensesUsd,
        observation: params.observation ?? null,
        exchangeRateUsdId: rate.exchangeRateId,
        usdRateQuotePer1Usd: formatMoneyMicro({
          currency: 'CDF',
          amountMicro: rate.rateQuotePer1BaseMicro,
        }),
        isLockedByClosure: isLocked,
      },
    });

    this.audit.append(
      buildAuditEntry({
        churchId: params.ctx.churchId,
        sessionId: params.ctx.sessionId,
        workstationId: params.ctx.workstationId,
        actorUserId: params.ctx.userId,
        entityType: 'financial_operation',
        entityId: operationId,
        action: 'CREATE',
        newValue: { pieceNumber, ...params, taux: formatRateDisplay(rate) },
      })
    );

    return { operationId, pieceNumber };
  }

  listOperations(ctx: TenantContext, filters?: { dateFrom?: string; dateTo?: string; fundId?: string }) {
    let sql = `SELECT o.*, c.name as category_name, f.name as fund_name,
        e.title as event_title, u.full_name as created_by_name
      FROM financial_operation o
      JOIN finance_category c ON c.category_id = o.category_id
      LEFT JOIN finance_fund f ON f.fund_id = o.fund_id
      LEFT JOIN church_event e ON e.event_id = o.event_id
      LEFT JOIN app_user u ON u.user_id = o.created_by_user_id
      WHERE o.church_id=@church_id AND o.deleted_at IS NULL AND o.archived_at IS NULL`;
    const binds: Record<string, unknown> = { church_id: ctx.churchId };
    if (filters?.dateFrom) {
      sql += ` AND o.op_date >= @from`;
      binds.from = filters.dateFrom;
    }
    if (filters?.dateTo) {
      sql += ` AND o.op_date <= @to`;
      binds.to = filters.dateTo;
    }
    if (filters?.fundId) {
      sql += ` AND o.fund_id = @fund_id`;
      binds.fund_id = filters.fundId;
    }
    sql += ` ORDER BY o.op_date DESC, o.created_at DESC`;
    return this.db.all(sql, binds);
  }

  async updateOperation(params: {
    ctx: TenantContext;
    operationId: string;
    patch: Partial<{
      opDate: string;
      label: string;
      beneficiary: string | null;
      categoryId: string;
      fundId?: string | null;
      eventId: string | null;
      receiptsCdf: string;
      receiptsUsd: string;
      expensesCdf: string;
      expensesUsd: string;
      observation: string | null;
    }>;
  }) {
    const old = await this.operations.getForAudit({ ctx: params.ctx, operationId: params.operationId });
    if (!old) throw new Error('Opération introuvable');
    const opDate = params.patch.opDate ?? old.op_date;
    if (await this.closures.isDateLocked({ ctx: params.ctx, opDate }))
      throw new Error('Période clôturée');

    const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx: params.ctx, effectiveDate: opDate });
    if (!rate) throw new Error(`Taux manquant pour ${opDate}`);

    const receiptsCdf = params.patch.receiptsCdf ?? String(old.receipts_cdf);
    const receiptsUsd = params.patch.receiptsUsd ?? String(old.receipts_usd ?? '0');
    const expensesCdf = params.patch.expensesCdf ?? String(old.expenses_cdf);
    const expensesUsd = params.patch.expensesUsd ?? String(old.expenses_usd);

    const computed = computeFinancialOperation({
      pieceType: old.piece_type as 'REC',
      opDate,
      receiptsCdfMicro: parseMoneyMicro('CDF', receiptsCdf).amountMicro,
      receiptsUsdMicro: parseMoneyMicro('USD', receiptsUsd).amountMicro,
      expensesCdfMicro: parseMoneyMicro('CDF', expensesCdf).amountMicro,
      expensesUsdMicro: parseMoneyMicro('USD', expensesUsd).amountMicro,
      exchangeRate: rate,
    });

    await this.operations.update({
      ctx: params.ctx,
      operationId: params.operationId,
      patch: {
        ...params.patch,
        opDate,
        receiptsCdf,
        receiptsUsdConverted: formatMoneyMicro({
          currency: 'USD',
          amountMicro: computed.receiptsUsdConvertedMicro,
        }),
        receiptsUsd,
        expensesCdf,
        expensesUsdConverted: formatMoneyMicro({
          currency: 'USD',
          amountMicro: computed.expensesUsdConvertedMicro,
        }),
        expensesUsd,
        exchangeRateUsdId: rate.exchangeRateId,
        usdRateQuotePer1Usd: formatMoneyMicro({
          currency: 'CDF',
          amountMicro: rate.rateQuotePer1BaseMicro,
        }),
        isLockedByClosure: false,
      },
    });

    this.audit.append(
      buildAuditEntry({
        churchId: params.ctx.churchId,
        sessionId: params.ctx.sessionId,
        workstationId: params.ctx.workstationId,
        actorUserId: params.ctx.userId,
        entityType: 'financial_operation',
        entityId: params.operationId,
        action: 'UPDATE',
        oldValue: old,
        newValue: params.patch,
      })
    );
  }

  async deleteOperation(params: { ctx: TenantContext; operationId: string; reason: string }) {
    validateDeletionRequest({ policy: { allowHardDelete: false, requireReason: true }, reason: params.reason });
    const old = await this.operations.getForAudit({ ctx: params.ctx, operationId: params.operationId });
    if (!old) throw new Error('Opération introuvable');
    if (await this.closures.isDateLocked({ ctx: params.ctx, opDate: old.op_date }))
      throw new Error('Période clôturée');

    await this.operations.softDelete({
      ctx: params.ctx,
      operationId: params.operationId,
      reason: params.reason,
    });

    this.audit.append(
      buildAuditEntry({
        churchId: params.ctx.churchId,
        sessionId: params.ctx.sessionId,
        workstationId: params.ctx.workstationId,
        actorUserId: params.ctx.userId,
        entityType: 'financial_operation',
        entityId: params.operationId,
        action: 'DELETE',
        oldValue: old,
        metadata: { reason: params.reason },
      })
    );
  }

  async restoreOperation(params: { ctx: TenantContext; operationId: string }) {
    await this.operations.restore({ ctx: params.ctx, operationId: params.operationId });
    this.audit.append(
      buildAuditEntry({
        churchId: params.ctx.churchId,
        sessionId: params.ctx.sessionId,
        workstationId: params.ctx.workstationId,
        actorUserId: params.ctx.userId,
        entityType: 'financial_operation',
        entityId: params.operationId,
        action: 'RESTORE',
      })
    );
  }

  listTrash(ctx: TenantContext) {
    return this.db.all(
      `SELECT * FROM financial_operation WHERE church_id=@church_id AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`,
      { church_id: ctx.churchId }
    );
  }

  // ─── ENVELOPPES ───────────────────────────────────────────────────────────

  async createEnvelope(params: {
    ctx: TenantContext;
    follower: string;
    envelopeDate: string;
    categoryId: string;
    fundId?: string | null;
    amountCdf: string;
    amountUsd?: string;
    observation?: string;
    eventId?: string;
  }) {
    const rate = this.exchangeRates.getUsdCdfRateByDate({
      ctx: params.ctx,
      effectiveDate: params.envelopeDate,
    });
    if (!rate) throw new Error('Taux du jour requis');
    const cdfMicro = parseMoneyMicro('CDF', params.amountCdf).amountMicro;
    const amountUsd = params.amountUsd ?? '0';
    const usdMicro = convertCdfToUsd({ cdfMicro, rate });
    const now = new Date().toISOString();
    const year = getYearFromIsoDate(params.envelopeDate);
    const seq = await this.numbering.getNext({ ctx: params.ctx, prefix: 'REC', year });
    const envelopeNumber = `ENV-${year}-${String(seq).padStart(6, '0')}`;
    const id = newId('env');

    this.db.run(
      `INSERT INTO envelope (envelope_id, church_id, envelope_number, follower, envelope_date,
        category_id, fund_id, amount_cdf, amount_usd_converted, amount_usd, exchange_rate_usd_id,
        usd_rate_quote_per_1_usd, rate_base_currency, rate_quote_currency, event_id, observation,
        created_at, updated_at, created_by_user_id, updated_by_user_id)
       VALUES (@id, @church_id, @num, @follower, @date, @cat, @fund, @cdf, @usd_conv, @usd_dir, @rate_id,
        @rate_val, @base, @quote, @event, @obs, @now, @now, @user, @user)`,
      {
        id,
        church_id: params.ctx.churchId,
        num: envelopeNumber,
        follower: params.follower,
        date: params.envelopeDate,
        cat: params.categoryId,
        fund: params.fundId ?? null,
        cdf: params.amountCdf,
        usd_conv: formatMoneyMicro({ currency: 'USD', amountMicro: usdMicro }),
        usd_dir: amountUsd,
        rate_id: rate.exchangeRateId,
        rate_val: formatMoneyMicro({ currency: 'CDF', amountMicro: rate.rateQuotePer1BaseMicro }),
        base: rate.baseCurrency,
        quote: rate.quoteCurrency,
        event: params.eventId ?? null,
        obs: params.observation ?? null,
        now,
        user: params.ctx.userId,
      }
    );

    const op = await this.createOperation({
      ctx: params.ctx,
      pieceType: 'REC',
      opDate: params.envelopeDate,
      label: `Enveloppe ${envelopeNumber} — ${params.follower}`,
      beneficiary: params.follower,
      categoryId: params.categoryId,
      fundId: params.fundId ?? null,
      eventId: params.eventId ?? null,
      receiptsCdf: params.amountCdf,
      receiptsUsd: amountUsd,
      expensesCdf: '0',
      expensesUsd: '0',
      observation: params.observation ?? null,
    });

    return { envelopeId: id, envelopeNumber, operationId: op.operationId, pieceNumber: op.pieceNumber };
  }

  searchEnvelopes(
    ctx: TenantContext,
    filters?: {
      q?: string;
      dateFrom?: string;
      dateTo?: string;
      categoryId?: string;
      fundId?: string;
      amountMin?: string;
      amountMax?: string;
    }
  ) {
    let sql = `SELECT * FROM envelope WHERE church_id=@church_id AND deleted_at IS NULL`;
    const binds: Record<string, unknown> = { church_id: ctx.churchId };
    if (filters?.q) {
      sql += ` AND (follower LIKE @q OR envelope_number LIKE @q)`;
      binds.q = `%${filters.q}%`;
    }
    if (filters?.dateFrom) {
      sql += ` AND envelope_date >= @date_from`;
      binds.date_from = filters.dateFrom;
    }
    if (filters?.dateTo) {
      sql += ` AND envelope_date <= @date_to`;
      binds.date_to = filters.dateTo;
    }
    if (filters?.categoryId) {
      sql += ` AND category_id = @category_id`;
      binds.category_id = filters.categoryId;
    }
    if (filters?.fundId) {
      sql += ` AND fund_id = @fund_id`;
      binds.fund_id = filters.fundId;
    }
    if (filters?.amountMin) {
      sql += ` AND CAST(amount_cdf AS REAL) >= @amount_min`;
      binds.amount_min = Number(filters.amountMin);
    }
    if (filters?.amountMax) {
      sql += ` AND CAST(amount_cdf AS REAL) <= @amount_max`;
      binds.amount_max = Number(filters.amountMax);
    }
    sql += ` ORDER BY envelope_date DESC`;
    return this.db.all(sql, binds);
  }

  // ─── PROMESSES DE FOI ───────────────────────────────────────────────────

  createPledge(params: {
    ctx: TenantContext;
    follower: string;
    pledgeAmountCdf: string;
    pledgeAmountUsd?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const now = new Date().toISOString();
    const id = newId('pledge');
    const today = new Date().toISOString().slice(0, 10);
    const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx: params.ctx, effectiveDate: today });
    const usdMicro = rate
      ? convertCdfToUsd({ cdfMicro: parseMoneyMicro('CDF', params.pledgeAmountCdf).amountMicro, rate })
      : 0n;
    const pledgeAmountUsd = params.pledgeAmountUsd ?? '0';

    this.db.run(
      `INSERT INTO faith_pledge (pledge_id, church_id, follower, pledge_amount_cdf, pledge_amount_usd_converted,
        pledge_amount_usd, start_date, end_date, created_at, created_by_user_id, updated_at, updated_by_user_id)
       VALUES (@id, @church_id, @follower, @cdf, @usd_conv, @usd_dir, @start, @end, @now, @user, @now, @user)`,
      {
        id,
        church_id: params.ctx.churchId,
        follower: params.follower,
        cdf: params.pledgeAmountCdf,
        usd_conv: formatMoneyMicro({ currency: 'USD', amountMicro: usdMicro }),
        usd_dir: pledgeAmountUsd,
        start: params.startDate ?? null,
        end: params.endDate ?? null,
        now,
        user: params.ctx.userId,
      }
    );
    return id;
  }

  async addPledgePayment(params: {
    ctx: TenantContext;
    pledgeId: string;
    paymentDate: string;
    amountCdf: string;
    amountUsd?: string;
    categoryId: string;
    fundId?: string | null;
    observation?: string;
  }) {
    const rate = this.exchangeRates.getUsdCdfRateByDate({
      ctx: params.ctx,
      effectiveDate: params.paymentDate,
    });
    if (!rate) throw new Error('Taux requis');
    const usdMicro = convertCdfToUsd({
      cdfMicro: parseMoneyMicro('CDF', params.amountCdf).amountMicro,
      rate,
    });
    const amountUsd = params.amountUsd ?? '0';
    const now = new Date().toISOString();
    const id = newId('pay');
    this.db.run(
      `INSERT INTO faith_pledge_payment (payment_id, church_id, pledge_id, payment_date, amount_cdf,
        amount_usd_converted, amount_usd, exchange_rate_usd_id, usd_rate_quote_per_1_usd, category_id, fund_id, observation,
        created_at, created_by_user_id)
       VALUES (@id, @church_id, @pledge, @date, @cdf, @usd_conv, @usd_dir, @rate_id, @rate_val, @cat, @fund, @obs, @now, @user)`,
      {
        id,
        church_id: params.ctx.churchId,
        pledge: params.pledgeId,
        date: params.paymentDate,
        cdf: params.amountCdf,
        usd_conv: formatMoneyMicro({ currency: 'USD', amountMicro: usdMicro }),
        usd_dir: amountUsd,
        rate_id: rate.exchangeRateId,
        rate_val: formatMoneyMicro({ currency: 'CDF', amountMicro: rate.rateQuotePer1BaseMicro }),
        cat: params.categoryId,
        fund: params.fundId ?? null,
        obs: params.observation ?? null,
        now,
        user: params.ctx.userId,
      }
    );

    const pledge = this.db.get<{ follower: string }>(
      `SELECT follower FROM faith_pledge WHERE church_id=@church_id AND pledge_id=@id`,
      { church_id: params.ctx.churchId, id: params.pledgeId }
    );
    const op = await this.createOperation({
      ctx: params.ctx,
      pieceType: 'REC',
      opDate: params.paymentDate,
      label: `Versement promesse — ${pledge?.follower ?? 'Fidèle'}`,
      beneficiary: pledge?.follower ?? null,
      categoryId: params.categoryId,
      fundId: params.fundId ?? null,
      receiptsCdf: params.amountCdf,
      receiptsUsd: amountUsd,
      expensesCdf: '0',
      expensesUsd: '0',
      observation: params.observation ?? null,
    });

    return { paymentId: id, operationId: op.operationId, pieceNumber: op.pieceNumber };
  }

  getPledgeBalance(ctx: TenantContext, pledgeId: string) {
    const pledge = this.db.get<{
      pledge_amount_cdf: string;
      pledge_amount_usd: string;
      follower: string;
    }>(
      `SELECT pledge_amount_cdf, pledge_amount_usd, follower FROM faith_pledge WHERE church_id=@church_id AND pledge_id=@id`,
      { church_id: ctx.churchId, id: pledgeId }
    );
    if (!pledge) throw new Error('Promesse introuvable');
    const paid = this.db.get<{ total_cdf: string; total_usd: string }>(
      `SELECT
         COALESCE(SUM(CAST(amount_cdf AS REAL)), 0) as total_cdf,
         COALESCE(SUM(CAST(amount_usd AS REAL)), 0) as total_usd
       FROM faith_pledge_payment
       WHERE church_id=@church_id AND pledge_id=@id`,
      { church_id: ctx.churchId, id: pledgeId }
    );
    const promised = parseMoneyMicro('CDF', String(pledge.pledge_amount_cdf)).amountMicro;
    const promisedUsd = parseMoneyMicro('USD', String(pledge.pledge_amount_usd ?? '0')).amountMicro;
    const verse = parseMoneyMicro('CDF', String(paid?.total_cdf ?? '0')).amountMicro;
    const verseUsd = parseMoneyMicro('USD', String(paid?.total_usd ?? '0')).amountMicro;
    return {
      follower: pledge.follower,
      montantPromisCdf: promised.toString(),
      montantVerseCdf: verse.toString(),
      soldeRestantCdf: (promised - verse).toString(),
      montantPromisUsd: promisedUsd.toString(),
      montantVerseUsd: verseUsd.toString(),
      soldeRestantUsd: (promisedUsd - verseUsd).toString(),
    };
  }

  // ─── COMPTAGE DES OFFRANDES ───────────────────────────────────────────────

  openCountingSession(params: { ctx: TenantContext; countingDate: string; teamName: string }) {
    const now = new Date().toISOString();
    const id = newId('count');
    this.db.run(
      `INSERT INTO counting_session (counting_session_id, church_id, counting_date, team_name, created_at, created_by_user_id, status)
       VALUES (@id, @church_id, @date, @team, @now, @user, 'opened')`,
      {
        id,
        church_id: params.ctx.churchId,
        date: params.countingDate,
        team: params.teamName,
        now,
        user: params.ctx.userId,
      }
    );
    return id;
  }

  addCountingLine(params: {
    ctx: TenantContext;
    sessionId: string;
    categoryId: string;
    fundId?: string | null;
    amountCdf: string;
    amountUsd?: string;
  }) {
    const session = this.db.get<{ counting_date: string }>(
      `SELECT counting_date FROM counting_session WHERE church_id=@church_id AND counting_session_id=@id`,
      { church_id: params.ctx.churchId, id: params.sessionId }
    );
    if (!session) throw new Error('Séance introuvable');
    const rate = this.exchangeRates.getUsdCdfRateByDate({
      ctx: params.ctx,
      effectiveDate: session.counting_date,
    });
    if (!rate) throw new Error('Taux requis');
    const usdMicro = convertCdfToUsd({
      cdfMicro: parseMoneyMicro('CDF', params.amountCdf).amountMicro,
      rate,
    });
    const amountUsd = params.amountUsd ?? '0';
    const now = new Date().toISOString();
    const id = newId('cline');
    this.db.run(
      `INSERT INTO counting_line (counting_line_id, counting_session_id, church_id, category_id, fund_id,
        amount_cdf, amount_usd_converted, amount_usd, exchange_rate_usd_id, usd_rate_quote_per_1_usd, created_at, created_by_user_id)
       VALUES (@id, @session, @church_id, @cat, @fund, @cdf, @usd_conv, @usd_dir, @rate_id, @rate_val, @now, @user)`,
      {
        id,
        session: params.sessionId,
        church_id: params.ctx.churchId,
        cat: params.categoryId,
        fund: params.fundId ?? null,
        cdf: params.amountCdf,
        usd_conv: formatMoneyMicro({ currency: 'USD', amountMicro: usdMicro }),
        usd_dir: amountUsd,
        rate_id: rate.exchangeRateId,
        rate_val: formatMoneyMicro({ currency: 'CDF', amountMicro: rate.rateQuotePer1BaseMicro }),
        now,
        user: params.ctx.userId,
      }
    );
    return id;
  }

  async validateCountingSession(params: { ctx: TenantContext; sessionId: string }) {
    const session = this.db.get<{ counting_date: string; team_name: string }>(
      `SELECT counting_date, team_name FROM counting_session WHERE church_id=@church_id AND counting_session_id=@id`,
      { church_id: params.ctx.churchId, id: params.sessionId }
    );
    if (!session) throw new Error('Séance introuvable');

    const lines = this.db.all<{
      category_id: string;
      fund_id: string | null;
      amount_cdf: string;
      amount_usd: string;
    }>(
      `SELECT category_id, fund_id, amount_cdf, amount_usd FROM counting_line WHERE counting_session_id=@id`,
      { id: params.sessionId }
    );

    for (const line of lines) {
      await this.createOperation({
        ctx: params.ctx,
        pieceType: 'REC',
        opDate: session.counting_date,
        label: `Comptage offrandes — ${session.team_name}`,
        categoryId: line.category_id,
        fundId: line.fund_id,
        receiptsCdf: String(line.amount_cdf),
        receiptsUsd: String(line.amount_usd ?? '0'),
        expensesCdf: '0',
        expensesUsd: '0',
      });
    }

    const now = new Date().toISOString();
    this.db.run(
      `UPDATE counting_session SET status='validated', validated_at=@now, validated_by_user_id=@user
       WHERE counting_session_id=@id`,
      { now, user: params.ctx.userId, id: params.sessionId }
    );
  }

  // ─── CAISSE ───────────────────────────────────────────────────────────────

  openCashSession(params: {
    ctx: TenantContext;
    cashBoxId: string;
    openDate: string;
    openingBalanceCdf: string;
    openingBalanceUsd?: string;
  }) {
    const now = new Date().toISOString();
    const id = newId('cash');
    this.db.run(
      `INSERT INTO cash_session (cash_session_id, church_id, cash_box_id, open_date, opened_at,
        opened_by_user_id, opening_balance_cdf, opening_balance_usd, status)
       VALUES (@id, @church_id, @box, @date, @now, @user, @balance_cdf, @balance_usd, 'open')`,
      {
        id,
        church_id: params.ctx.churchId,
        box: params.cashBoxId,
        date: params.openDate,
        now,
        user: params.ctx.userId,
        balance_cdf: params.openingBalanceCdf,
        balance_usd: params.openingBalanceUsd ?? '0',
      }
    );
    return id;
  }

  closeCashSession(params: {
    ctx: TenantContext;
    sessionId: string;
    closingBalanceCdf: string;
    closingBalanceUsd?: string;
    notes?: string;
  }) {
    const session = this.db.get<{ opening_balance_cdf: string; opening_balance_usd: string }>(
      `SELECT opening_balance_cdf, opening_balance_usd FROM cash_session WHERE cash_session_id=@id`,
      { id: params.sessionId }
    );
    if (!session) throw new Error('Session caisse introuvable');

    const txSum = this.db.get<{ net_cdf: string; net_usd: string }>(
      `SELECT
         COALESCE(SUM(CAST(receipts_cdf AS REAL) - CAST(expenses_cdf AS REAL)), 0) as net_cdf,
         COALESCE(SUM(CAST(receipts_usd AS REAL) - CAST(expenses_usd AS REAL)), 0) as net_usd
       FROM cash_transaction WHERE cash_session_id=@id AND deleted_at IS NULL`,
      { id: params.sessionId }
    );
    const opening = parseMoneyMicro('CDF', String(session.opening_balance_cdf)).amountMicro;
    const net = parseMoneyMicro('CDF', String(txSum?.net_cdf ?? '0')).amountMicro;
    const expected = opening + net;
    const closing = parseMoneyMicro('CDF', params.closingBalanceCdf).amountMicro;
    const diff = closing - expected;

    const openingUsd = parseMoneyMicro('USD', String(session.opening_balance_usd ?? '0')).amountMicro;
    const netUsd = parseMoneyMicro('USD', String(txSum?.net_usd ?? '0')).amountMicro;
    const expectedUsd = openingUsd + netUsd;
    const closingUsd = parseMoneyMicro('USD', params.closingBalanceUsd ?? '0').amountMicro;
    const diffUsd = closingUsd - expectedUsd;

    const now = new Date().toISOString();

    this.db.run(
      `UPDATE cash_session SET status='closed', close_date=@date, closed_at=@now, closed_by_user_id=@user,
        closing_balance_cdf=@closing_cdf, closing_balance_usd=@closing_usd,
        cash_diff_cdf=@diff_cdf, cash_diff_usd=@diff_usd, notes=@notes WHERE cash_session_id=@id`,
      {
        date: now.slice(0, 10),
        now,
        user: params.ctx.userId,
        closing_cdf: params.closingBalanceCdf,
        closing_usd: params.closingBalanceUsd ?? '0',
        diff_cdf: formatMoneyMicro({ currency: 'CDF', amountMicro: diff }),
        diff_usd: formatMoneyMicro({ currency: 'USD', amountMicro: diffUsd }),
        notes: params.notes ?? null,
        id: params.sessionId,
      }
    );
    return { expectedCdf: expected.toString(), diffCdf: diff.toString() };
  }

  async createCashTransaction(params: {
    ctx: TenantContext;
    sessionId: string;
    txDate: string;
    label: string;
    categoryId: string;
    fundId?: string | null;
    receiptsCdf?: string;
    receiptsUsd?: string;
    expensesCdf?: string;
    expensesUsd?: string;
    observation?: string | null;
  }) {
    const session = this.db.get<{ status: string }>(
      `SELECT status FROM cash_session WHERE church_id=@church_id AND cash_session_id=@id`,
      { church_id: params.ctx.churchId, id: params.sessionId }
    );
    if (!session || session.status !== 'open') throw new Error('Session caisse fermée ou introuvable');

    const receiptsCdf = params.receiptsCdf ?? '0';
    const receiptsUsd = params.receiptsUsd ?? '0';
    const expensesCdf = params.expensesCdf ?? '0';
    const expensesUsd = params.expensesUsd ?? '0';

    const { pieceNumber, operationId } = await this.createOperation({
      ctx: params.ctx,
      pieceType: 'CAI',
      opDate: params.txDate,
      label: params.label,
      categoryId: params.categoryId,
      fundId: params.fundId ?? null,
      receiptsCdf,
      receiptsUsd,
      expensesCdf,
      expensesUsd,
      observation: params.observation ?? null,
    });

    const op = await this.operations.getById({ ctx: params.ctx, operationId });
    if (!op) throw new Error('Opération caisse introuvable après création');

    const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx: params.ctx, effectiveDate: params.txDate });
    if (!rate) throw new Error('Taux du jour requis');

    const now = new Date().toISOString();
    const id = newId('ctx');
    this.db.run(
      `INSERT INTO cash_transaction (
         cash_transaction_id, church_id, cash_session_id, piece_type, piece_number, op_date,
         label, category_id, fund_id,
         receipts_cdf, expenses_cdf, receipts_usd_converted, receipts_usd, expenses_usd_converted, expenses_usd,
         exchange_rate_usd_id, usd_rate_quote_per_1_usd, observation, created_at, created_by_user_id
       ) VALUES (
         @id, @church_id, @session, 'CAI', @piece, @date,
         @label, @cat, @fund,
         @rec_cdf, @exp_cdf, @rec_usd_conv, @rec_usd, @exp_usd_conv, @exp_usd,
         @rate_id, @rate_val, @obs, @now, @user
       )`,
      {
        id,
        church_id: params.ctx.churchId,
        session: params.sessionId,
        piece: pieceNumber,
        date: params.txDate,
        label: params.label,
        cat: params.categoryId,
        fund: params.fundId ?? null,
        rec_cdf: receiptsCdf,
        exp_cdf: expensesCdf,
        rec_usd_conv: op.receipts_usd_converted,
        rec_usd: op.receipts_usd,
        exp_usd_conv: op.expenses_usd_converted,
        exp_usd: op.expenses_usd,
        rate_id: rate.exchangeRateId,
        rate_val: formatMoneyMicro({ currency: 'CDF', amountMicro: rate.rateQuotePer1BaseMicro }),
        obs: params.observation ?? null,
        now,
        user: params.ctx.userId,
      }
    );

    return { cashTransactionId: id, pieceNumber };
  }

  listCashTransactions(ctx: TenantContext, sessionId: string) {
    return this.db.all(
      `SELECT * FROM cash_transaction
       WHERE church_id=@church_id AND cash_session_id=@session AND deleted_at IS NULL
       ORDER BY op_date DESC, created_at DESC`,
      { church_id: ctx.churchId, session: sessionId }
    );
  }

  // ─── CLÔTURE FINANCIÈRE ───────────────────────────────────────────────────

  createClosure(params: {
    ctx: TenantContext;
    closureType: 'MONTH' | 'QUARTER' | 'YEAR';
    periodStart: string;
    periodEnd: string;
    notes?: string;
  }) {
    const now = new Date().toISOString();
    const id = newId('closure');
    this.db.run(
      `INSERT INTO financial_closure (closure_id, church_id, closure_type, period_start, period_end,
        closed_at, closed_by_user_id, status, notes)
       VALUES (@id, @church_id, @type, @start, @end, @now, @user, 'active', @notes)`,
      {
        id,
        church_id: params.ctx.churchId,
        type: params.closureType,
        start: params.periodStart,
        end: params.periodEnd,
        now,
        user: params.ctx.userId,
        notes: params.notes ?? null,
      }
    );
    this.db.run(
      `UPDATE financial_operation SET is_locked_by_closure=1
       WHERE church_id=@church_id AND op_date>=@start AND op_date<=@end`,
      { church_id: params.ctx.churchId, start: params.periodStart, end: params.periodEnd }
    );
    this.audit.append(
      buildAuditEntry({
        churchId: params.ctx.churchId,
        sessionId: params.ctx.sessionId,
        workstationId: params.ctx.workstationId,
        actorUserId: params.ctx.userId,
        entityType: 'financial_closure',
        entityId: id,
        action: 'CREATE',
        newValue: params,
      })
    );
    return id;
  }

  // ─── AUDIT & RAPPORTS ─────────────────────────────────────────────────────

  listAudit(
    ctx: TenantContext,
    params?: { limit?: number; action?: string; entityType?: string; dateFrom?: string; dateTo?: string; actorUserId?: string }
  ) {
    let sql = `SELECT * FROM audit_log WHERE church_id=@church_id`;
    const binds: Record<string, unknown> = { church_id: ctx.churchId, limit: params?.limit ?? 100 };
    if (params?.action) {
      sql += ` AND action=@action`;
      binds.action = params.action;
    }
    if (params?.entityType) {
      sql += ` AND entity_type=@entity_type`;
      binds.entity_type = params.entityType;
    }
    if (params?.dateFrom) {
      sql += ` AND changed_at >= @date_from`;
      binds.date_from = params.dateFrom;
    }
    if (params?.dateTo) {
      sql += ` AND changed_at <= @date_to`;
      binds.date_to = `${params.dateTo}T23:59:59.999Z`;
    }
    if (params?.actorUserId) {
      sql += ` AND actor_user_id=@actor`;
      binds.actor = params.actorUserId;
    }
    sql += ` ORDER BY changed_at DESC LIMIT @limit`;
    return this.db.all(sql, binds);
  }

  async ingestRemoteSyncEvents(events: import('./repositories/auditRepository').SyncEventIngestInput[]): Promise<number> {
    return this.audit.ingestRemoteEvents(events, {
      apply: async (ev) => {
        const result = await this.syncReplay.applyEvent(ev);
        if (!result.applied && result.reason && result.reason !== 'Déjà présent') {
          throw new Error(result.reason);
        }
      },
    });
  }

  // ─── TABLEAUX DE BORD / RAPPORTS ─────────────────────────────────────

  getFinanceDashboard(ctx: TenantContext) {
    return this.reports.dashboard(ctx);
  }

  synthesisByCategory(ctx: TenantContext, params?: { dateFrom?: string; dateTo?: string }) {
    return this.reports.synthesisByCategory({ ctx, dateFrom: params?.dateFrom, dateTo: params?.dateTo });
  }

  synthesisPeriod(ctx: TenantContext, params: { dateFrom: string; dateTo: string }) {
    return this.reports.synthesisPeriod({ ctx, dateFrom: params.dateFrom, dateTo: params.dateTo });
  }

  // ─── BANQUE ────────────────────────────────────────────────────────

  createBankAccount(params: { ctx: TenantContext; name: string; iban?: string; swift?: string; currencyCode?: string }) {
    return this.banks.createBankAccount(params);
  }

  listBankAccounts(ctx: TenantContext) {
    return this.banks.listBankAccounts(ctx);
  }

  setBankAccountActive(params: { ctx: TenantContext; bankAccountId: string; isActive: boolean }) {
    this.banks.setBankAccountActive(params);
  }

  async createBankTransaction(params: {
    ctx: TenantContext;
    kind: 'DEPOT' | 'RETRAIT' | 'VIREMENT';
    bankAccountId: string;
    toBankAccountId?: string; // required for VIREMENT
    txDate: string;
    label: string;
    beneficiary?: string | null;
    categoryId: string;
    fundId?: string | null;
    eventId?: string | null;
    amountCdf: string;
    amountUsd?: string;
    externalReference?: string | null;
    observation?: string | null;
  }) {
    const amountUsd = params.amountUsd ?? '0';
    const rate = this.exchangeRates.getUsdCdfRateByDate({ ctx: params.ctx, effectiveDate: params.txDate });
    if (!rate) throw new Error(`Taux du jour manquant pour ${params.txDate}`);

    const usdRateQuotePer1Usd = formatMoneyMicro({
      currency: 'CDF',
      amountMicro: rate.rateQuotePer1BaseMicro,
    });

    const makeOne = async (p: {
      bankAccountId: string;
      pieceLabel: string;
      receiptsCdf: string;
      receiptsUsd?: string;
      expensesCdf: string;
      expensesUsd?: string;
    }) => {
      const { operationId, pieceNumber } = await this.createOperation({
        ctx: params.ctx,
        pieceType: 'BAN',
        opDate: params.txDate,
        label: p.pieceLabel,
        beneficiary: params.beneficiary ?? null,
        categoryId: params.categoryId,
        fundId: params.fundId ?? null,
        eventId: params.eventId ?? null,
        receiptsCdf: p.receiptsCdf,
        receiptsUsd: p.receiptsUsd ?? '0',
        expensesCdf: p.expensesCdf,
        expensesUsd: p.expensesUsd ?? '0',
        observation: params.observation ?? null,
      });

      const op = await this.operations.getById({ ctx: params.ctx, operationId });
      if (!op) throw new Error('Opération banque introuvable après création');

      const receiptsUsdConverted = op.receipts_usd_converted;
      const expensesUsdConverted = op.expenses_usd_converted;

      this.banks.createBankTransactionRow({
        ctx: params.ctx,
        bankAccountId: p.bankAccountId,
        pieceNumber,
        txDate: params.txDate,
        label: p.pieceLabel,
        beneficiary: params.beneficiary ?? null,
        categoryId: params.categoryId,
        fundId: params.fundId ?? null,
        eventId: params.eventId ?? null,
        receiptsCdf: p.receiptsCdf,
        expensesCdf: p.expensesCdf,
        receiptsUsdConverted,
        receiptsUsd: p.receiptsUsd ?? '0',
        expensesUsdConverted,
        expensesUsd: p.expensesUsd ?? '0',
        exchangeRateId: rate.exchangeRateId,
        usdRateQuotePer1Usd,
        externalReference: params.externalReference ?? null,
        observation: params.observation ?? null,
      });

      return { operationId, pieceNumber };
    };

    if (params.kind === 'DEPOT') {
      return makeOne({
        bankAccountId: params.bankAccountId,
        pieceLabel: params.label,
        receiptsCdf: params.amountCdf,
        receiptsUsd: amountUsd,
        expensesCdf: '0',
      });
    }

    if (params.kind === 'RETRAIT') {
      return makeOne({
        bankAccountId: params.bankAccountId,
        pieceLabel: params.label,
        receiptsCdf: '0',
        expensesCdf: params.amountCdf,
        expensesUsd: amountUsd,
      });
    }

    if (params.kind === 'VIREMENT') {
      if (!params.toBankAccountId) throw new Error('toBankAccountId requis pour VIREMENT');
      const from = await makeOne({
        bankAccountId: params.bankAccountId,
        pieceLabel: `${params.label} (sortie)`,
        receiptsCdf: '0',
        expensesCdf: params.amountCdf,
        expensesUsd: amountUsd,
      });
      const to = await makeOne({
        bankAccountId: params.toBankAccountId,
        pieceLabel: `${params.label} (entrée)`,
        receiptsCdf: params.amountCdf,
        receiptsUsd: amountUsd,
        expensesCdf: '0',
      });
      return { from, to };
    }

    throw new Error('Kind banque invalide');
  }

  createBankReconciliation(params: {
    ctx: TenantContext;
    bankAccountId: string;
    reconciliationDate: string;
    notes?: string;
  }) {
    return this.banks.createBankReconciliation(params);
  }

  addBankReconciliationMatch(params: {
    ctx: TenantContext;
    bankReconciliationId: string;
    bankTransactionId?: string | null;
    externalStatementLineRef: string;
    matchedAmountCdf: string;
  }) {
    return this.banks.addBankReconciliationMatch(params);
  }

  validateBankReconciliation(params: { ctx: TenantContext; bankReconciliationId: string }) {
    this.banks.validateBankReconciliation(params);
  }

  listBankReconciliations(ctx: TenantContext) {
    return this.banks.listBankReconciliations(ctx);
  }

  listBankTransactions(params: { ctx: TenantContext; bankAccountId: string; limit?: number }) {
    return this.banks.listBankTransactions(params);
  }

  listReconciliationMatches(params: { ctx: TenantContext; bankReconciliationId: string }) {
    return this.banks.listReconciliationMatches(params);
  }

  listPledgePayments(ctx: TenantContext, pledgeId: string) {
    return this.db.all(
      `SELECT payment_id, payment_date, amount_cdf, amount_usd, observation, created_at
       FROM faith_pledge_payment
       WHERE church_id=@church_id AND pledge_id=@id
       ORDER BY payment_date DESC`,
      { church_id: ctx.churchId, id: pledgeId }
    );
  }

  // ─── BUDGET ─────────────────────────────────────────────────────────

  createBudget(params: {
    ctx: TenantContext;
    budgetType: 'ANNUAL' | 'SEMIANNUAL' | 'QUARTERLY' | 'MONTHLY';
    periodStart: string;
    periodEnd: string;
    fiscalYear?: number;
  }) {
    return this.budgets.createBudget(params);
  }

  upsertBudgetLine(params: {
    ctx: TenantContext;
    budgetId: string;
    categoryId: string;
    fundId?: string | null;
    plannedReceiptsUsd: string;
    plannedExpensesUsd: string;
  }) {
    return this.budgets.upsertBudgetLine(params);
  }

  computeBudgetExecution(params: { ctx: TenantContext; budgetId: string }) {
    return this.budgets.computeBudgetExecution(params);
  }

  listBudgets(ctx: TenantContext) {
    return this.db.all(
      `SELECT * FROM finance_budget WHERE church_id=@church_id ORDER BY period_start DESC`,
      { church_id: ctx.churchId }
    );
  }

  listClosures(ctx: TenantContext) {
    return this.db.all(
      `SELECT * FROM financial_closure WHERE church_id=@church_id ORDER BY closed_at DESC`,
      { church_id: ctx.churchId }
    );
  }

  listPledges(ctx: TenantContext) {
    return this.db.all(
      `SELECT p.*,
        (SELECT COALESCE(SUM(CAST(amount_cdf AS REAL)), 0) FROM faith_pledge_payment pp
         WHERE pp.pledge_id = p.pledge_id) as verse_cdf,
        (SELECT COALESCE(SUM(CAST(amount_usd AS REAL)), 0) FROM faith_pledge_payment pp
         WHERE pp.pledge_id = p.pledge_id) as verse_usd
       FROM faith_pledge p WHERE p.church_id=@church_id ORDER BY p.created_at DESC`,
      { church_id: ctx.churchId }
    );
  }

  listCountingSessions(ctx: TenantContext) {
    return this.db.all(
      `SELECT cs.*,
        (SELECT COUNT(*) FROM counting_line cl WHERE cl.counting_session_id = cs.counting_session_id) as nb_lignes,
        (SELECT COALESCE(SUM(CAST(amount_cdf AS REAL)), 0) FROM counting_line cl
         WHERE cl.counting_session_id = cs.counting_session_id) as total_cdf,
        (SELECT COALESCE(SUM(CAST(amount_usd AS REAL)), 0) FROM counting_line cl
         WHERE cl.counting_session_id = cs.counting_session_id) as total_usd
       FROM counting_session cs WHERE cs.church_id=@church_id ORDER BY cs.counting_date DESC`,
      { church_id: ctx.churchId }
    );
  }

  listCashSessions(ctx: TenantContext) {
    return this.db.all(
      `SELECT * FROM cash_session WHERE church_id=@church_id ORDER BY opened_at DESC LIMIT 50`,
      { church_id: ctx.churchId }
    );
  }

  listCashBoxes(ctx: TenantContext) {
    return this.db.all(
      `SELECT * FROM cash_box WHERE church_id=@church_id AND is_active=1`,
      { church_id: ctx.churchId }
    );
  }

  getPastoralDashboard(ctx: TenantContext) {
    return this.reports.pastoralDashboard(ctx);
  }
}
