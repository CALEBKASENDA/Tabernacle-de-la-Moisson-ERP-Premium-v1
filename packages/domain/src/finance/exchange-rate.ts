import type { CurrencyCode } from './money';
import { SCALE, convertQuoteToBaseMicro, parseMoneyMicro } from './money';

export type ExchangeRate = {
  exchangeRateId: string;
  churchId: string;
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  effectiveDate: string;
  /** 1 base unit = rateQuotePer1BaseMicro quote micro-units */
  rateQuotePer1BaseMicro: bigint;
};

export type CurrencyPair = {
  from: CurrencyCode;
  to: CurrencyCode;
};

export function parseExchangeRate(params: {
  exchangeRateId: string;
  churchId: string;
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  effectiveDate: string;
  rateValue: string;
}): ExchangeRate {
  const rate = parseMoneyMicro(params.quoteCurrency, params.rateValue);
  return {
    exchangeRateId: params.exchangeRateId,
    churchId: params.churchId,
    baseCurrency: params.baseCurrency,
    quoteCurrency: params.quoteCurrency,
    effectiveDate: params.effectiveDate,
    rateQuotePer1BaseMicro: rate.amountMicro,
  };
}

/** Convert amount from one currency to another using a stored rate (any direction). */
export function convertWithRate(params: {
  amountMicro: bigint;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: ExchangeRate;
}): bigint {
  const { amountMicro, fromCurrency, toCurrency, rate } = params;
  if (fromCurrency === toCurrency) return amountMicro;

  if (fromCurrency === rate.baseCurrency && toCurrency === rate.quoteCurrency) {
    return (amountMicro * rate.rateQuotePer1BaseMicro) / SCALE;
  }

  if (fromCurrency === rate.quoteCurrency && toCurrency === rate.baseCurrency) {
    return convertQuoteToBaseMicro({
      quote: { currency: rate.quoteCurrency, amountMicro },
      rateQuotePer1BaseMicro: rate.rateQuotePer1BaseMicro,
      baseCurrency: rate.baseCurrency,
    }).amountMicro;
  }

  throw new Error(
    `Rate ${rate.baseCurrency}/${rate.quoteCurrency} cannot convert ${fromCurrency} -> ${toCurrency}`
  );
}

/**
 * Normalize any USD<->CDF rate entry into canonical USD(base)/CDF(quote) form.
 * User may enter: 1 USD = 3000 CDF  OR  1 CDF = 0.000333 USD
 */
export function normalizeUsdCdfRate(rate: ExchangeRate): ExchangeRate {
  if (rate.baseCurrency === 'USD' && rate.quoteCurrency === 'CDF') return rate;

  if (rate.baseCurrency === 'CDF' && rate.quoteCurrency === 'USD') {
    const usdPer1CdfMicro = rate.rateQuotePer1BaseMicro;
    if (usdPer1CdfMicro === 0n) throw new Error('Exchange rate cannot be zero');
    const cdfPer1UsdMicro = (SCALE * SCALE) / usdPer1CdfMicro;
    return {
      ...rate,
      baseCurrency: 'USD',
      quoteCurrency: 'CDF',
      rateQuotePer1BaseMicro: cdfPer1UsdMicro,
    };
  }

  throw new Error(`Unsupported currency pair: ${rate.baseCurrency}/${rate.quoteCurrency}`);
}

/** Display label: "1 USD = 3000 CDF" or "1 CDF = 0.000333 USD" */
export function formatRateDisplay(rate: ExchangeRate): string {
  const formatted = (Number(rate.rateQuotePer1BaseMicro) / Number(SCALE)).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  return `1 ${rate.baseCurrency} = ${formatted} ${rate.quoteCurrency}`;
}

/** Inverse pair for UI toggle */
export function invertRate(rate: ExchangeRate): ExchangeRate {
  if (rate.rateQuotePer1BaseMicro === 0n) throw new Error('Cannot invert zero rate');
  const invertedMicro = (SCALE * SCALE) / rate.rateQuotePer1BaseMicro;
  return {
    exchangeRateId: rate.exchangeRateId,
    churchId: rate.churchId,
    baseCurrency: rate.quoteCurrency,
    quoteCurrency: rate.baseCurrency,
    effectiveDate: rate.effectiveDate,
    rateQuotePer1BaseMicro: invertedMicro,
  };
}

export function convertCdfToUsd(params: { cdfMicro: bigint; rate: ExchangeRate }): bigint {
  const normalized = normalizeUsdCdfRate(params.rate);
  return convertQuoteToBaseMicro({
    quote: { currency: 'CDF', amountMicro: params.cdfMicro },
    rateQuotePer1BaseMicro: normalized.rateQuotePer1BaseMicro,
    baseCurrency: 'USD',
  }).amountMicro;
}

export function convertUsdToCdf(params: { usdMicro: bigint; rate: ExchangeRate }): bigint {
  const normalized = normalizeUsdCdfRate(params.rate);
  return (params.usdMicro * normalized.rateQuotePer1BaseMicro) / SCALE;
}
