import type { TenantContext } from '../tenantContext';
import type { AppDatabase } from '../database/appDatabase';
import {
  type ExchangeRate,
  formatRateDisplay,
  invertRate,
  normalizeUsdCdfRate,
  newId,
  formatMoneyMicro,
  parseMoneyMicro,
} from '@tabernacle/erp-premium-domain';

type RateRow = {
  exchange_rate_id: string;
  base_currency_code: string;
  quote_currency_code: string;
  rate_quote_per_1_base: string;
  effective_date: string;
};

function rowToRate(row: RateRow, churchId: string): ExchangeRate {
  return {
    exchangeRateId: row.exchange_rate_id,
    churchId,
    baseCurrency: row.base_currency_code,
    quoteCurrency: row.quote_currency_code,
    effectiveDate: row.effective_date,
    rateQuotePer1BaseMicro: parseMoneyMicro(row.quote_currency_code, String(row.rate_quote_per_1_base))
      .amountMicro,
  };
}

export class ExchangeRateRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Resolve USD<->CDF rate for a date (either direction stored). */
  getRateForDate(params: {
    ctx: TenantContext;
    effectiveDate: string;
    currencyA?: string;
    currencyB?: string;
  }): ExchangeRate | null {
    const { ctx, effectiveDate } = params;
    const a = params.currencyA ?? 'USD';
    const b = params.currencyB ?? 'CDF';

    const direct = this.db.get<RateRow>(
      `SELECT exchange_rate_id, base_currency_code, quote_currency_code, rate_quote_per_1_base, effective_date
       FROM exchange_rate
       WHERE church_id=@church_id AND effective_date=@effective_date
         AND base_currency_code=@base AND quote_currency_code=@quote
         AND deleted_at IS NULL AND is_active=1`,
      { church_id: ctx.churchId, effective_date: effectiveDate, base: a, quote: b }
    );
    if (direct) return rowToRate(direct, ctx.churchId);

    const inverse = this.db.get<RateRow>(
      `SELECT exchange_rate_id, base_currency_code, quote_currency_code, rate_quote_per_1_base, effective_date
       FROM exchange_rate
       WHERE church_id=@church_id AND effective_date=@effective_date
         AND base_currency_code=@base AND quote_currency_code=@quote
         AND deleted_at IS NULL AND is_active=1`,
      { church_id: ctx.churchId, effective_date: effectiveDate, base: b, quote: a }
    );
    if (inverse) return invertRate(rowToRate(inverse, ctx.churchId));

    return null;
  }

  getUsdCdfRateByDate(params: { ctx: TenantContext; effectiveDate: string }): ExchangeRate | null {
    const exact = this.getRateForDate({ ...params, currencyA: 'USD', currencyB: 'CDF' });
    if (exact) return exact;

    const row = this.db.get<RateRow>(
      `SELECT exchange_rate_id, base_currency_code, quote_currency_code, rate_quote_per_1_base, effective_date
       FROM exchange_rate
       WHERE church_id=@church_id AND effective_date <= @effective_date
         AND deleted_at IS NULL AND is_active=1
         AND (
           (base_currency_code='USD' AND quote_currency_code='CDF')
           OR (base_currency_code='CDF' AND quote_currency_code='USD')
         )
       ORDER BY effective_date DESC
       LIMIT 1`,
      { church_id: params.ctx.churchId, effective_date: params.effectiveDate }
    );
    if (!row) {
      const latest = this.db.get<RateRow>(
        `SELECT exchange_rate_id, base_currency_code, quote_currency_code, rate_quote_per_1_base, effective_date
         FROM exchange_rate
         WHERE church_id=@church_id AND deleted_at IS NULL AND is_active=1
           AND (
             (base_currency_code='USD' AND quote_currency_code='CDF')
             OR (base_currency_code='CDF' AND quote_currency_code='USD')
           )
         ORDER BY effective_date DESC
         LIMIT 1`,
        { church_id: params.ctx.churchId }
      );
      if (!latest) return null;
      const latestRate = rowToRate(latest, params.ctx.churchId);
      return latestRate.baseCurrency === 'USD' && latestRate.quoteCurrency === 'CDF'
        ? latestRate
        : invertRate(latestRate);
    }
    const rate = rowToRate(row, params.ctx.churchId);
    return rate.baseCurrency === 'USD' && rate.quoteCurrency === 'CDF' ? rate : invertRate(rate);
  }

  listHistory(params: { ctx: TenantContext; limit?: number }): Array<ExchangeRate & { display: string }> {
    const rows = this.db.all<RateRow>(
      `SELECT exchange_rate_id, base_currency_code, quote_currency_code, rate_quote_per_1_base, effective_date
       FROM exchange_rate
       WHERE church_id=@church_id AND deleted_at IS NULL
         AND ((base_currency_code='USD' AND quote_currency_code='CDF')
           OR (base_currency_code='CDF' AND quote_currency_code='USD'))
       ORDER BY effective_date DESC
       LIMIT @limit`,
      { church_id: params.ctx.churchId, limit: params.limit ?? 100 }
    );
    return rows.map((r) => {
      const rate = rowToRate(r, params.ctx.churchId);
      return { ...rate, display: formatRateDisplay(rate) };
    });
  }

  getTodayRate(ctx: TenantContext): (ExchangeRate & { display: string; inverseDisplay: string }) | null {
    const today = new Date().toISOString().slice(0, 10);
    const rate = this.getUsdCdfRateByDate({ ctx, effectiveDate: today });
    if (!rate) return null;
    const inv = invertRate(rate);
    return {
      ...rate,
      display: formatRateDisplay(rate),
      inverseDisplay: formatRateDisplay(inv),
    };
  }

  upsertRate(params: {
    ctx: TenantContext;
    effectiveDate: string;
    baseCurrency: string;
    quoteCurrency: string;
    rateValue: string;
  }): string {
    const { ctx, effectiveDate, baseCurrency, quoteCurrency, rateValue } = params;
    const now = new Date().toISOString();
    const rateMicro = parseMoneyMicro(quoteCurrency, rateValue).amountMicro;
    const rateDecimal = formatMoneyMicro({ currency: quoteCurrency, amountMicro: rateMicro });

    return this.db.withTransaction((tx) => {
      const existing = tx
        .prepare(
          `SELECT exchange_rate_id FROM exchange_rate
           WHERE church_id=@church_id AND base_currency_code=@base AND quote_currency_code=@quote
             AND effective_date=@effective_date AND deleted_at IS NULL`
        )
        .get({
          church_id: ctx.churchId,
          base: baseCurrency,
          quote: quoteCurrency,
          effective_date: effectiveDate,
        }) as { exchange_rate_id: string } | undefined;

      if (!existing) {
        const id = newId('exrate');
        tx.prepare(
          `INSERT INTO exchange_rate (
            exchange_rate_id, church_id, base_currency_code, quote_currency_code, effective_date,
            rate_quote_per_1_base, created_at, created_by_user_id, updated_at, updated_by_user_id, is_active
          ) VALUES (
            @id, @church_id, @base, @quote, @effective_date, @rate,
            @now, @user_id, @now, @user_id, 1
          )`
        ).run({
          id,
          church_id: ctx.churchId,
          base: baseCurrency,
          quote: quoteCurrency,
          effective_date: effectiveDate,
          rate: rateDecimal,
          now,
          user_id: ctx.userId,
        });
        return id;
      }

      tx.prepare(
        `UPDATE exchange_rate SET rate_quote_per_1_base=@rate, updated_at=@now, updated_by_user_id=@user_id,
         is_active=1, deleted_at=NULL, deletion_reason=NULL
         WHERE exchange_rate_id=@id`
      ).run({ rate: rateDecimal, now, user_id: ctx.userId, id: existing.exchange_rate_id });
      return existing.exchange_rate_id;
    });
  }

  /** Upsert with automatic pair handling — user can enter USD/CDF or CDF/USD */
  upsertDynamicUsdCdf(params: {
    ctx: TenantContext;
    effectiveDate: string;
    baseCurrency: 'USD' | 'CDF';
    quoteCurrency: 'USD' | 'CDF';
    rateValue: string;
  }): { exchangeRateId: string; storedRate: ExchangeRate; normalizedUsdCdf: ExchangeRate } {
    const exchangeRateId = this.upsertRate({
      ctx: params.ctx,
      effectiveDate: params.effectiveDate,
      baseCurrency: params.baseCurrency,
      quoteCurrency: params.quoteCurrency,
      rateValue: params.rateValue,
    });
    const stored = this.getRateForDate({
      ctx: params.ctx,
      effectiveDate: params.effectiveDate,
      currencyA: params.baseCurrency,
      currencyB: params.quoteCurrency,
    })!;
    const normalizedUsdCdf = normalizeUsdCdfRate(
      this.getUsdCdfRateByDate({ ctx: params.ctx, effectiveDate: params.effectiveDate })!
    );
    return { exchangeRateId, storedRate: stored, normalizedUsdCdf };
  }
}
