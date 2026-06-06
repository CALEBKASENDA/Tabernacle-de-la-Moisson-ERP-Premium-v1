/* eslint-disable @typescript-eslint/no-magic-numbers */

/**
 * Money is represented as fixed-point integer amounts to avoid floating point rounding errors.
 *
 * - All amounts use `DECIMALS = 6` (micro-units) by default.
 * - Example: 3000.000000 CDF => amountMicro = 3000_000_000_000n
 *
 * Domain is currency-agnostic: conversion requires an exchange rate object.
 */

export type CurrencyCode = string;

export const DECIMALS = 6 as const;
export const SCALE = 10n ** BigInt(DECIMALS);

export type MoneyMicro = {
  currency: CurrencyCode;
  amountMicro: bigint; // fixed-point integer
};

export function parseMoneyMicro(currency: CurrencyCode, value: string | number | bigint): MoneyMicro {
  if (typeof value === 'bigint') {
    return { currency, amountMicro: value };
  }

  const str = typeof value === 'number' ? value.toString() : value.trim();
  if (!str || Number.isNaN(Number(str))) {
    throw new Error(`Invalid money value: "${value}"`);
  }

  // Handle scientific notation by converting through string normalization where possible.
  if (str.includes('e') || str.includes('E')) {
    // Convert via decimal string using BigInt is non-trivial; reject to keep determinism.
    throw new Error(`Scientific notation is not supported for money parsing: "${value}"`);
  }

  const sign = str.startsWith('-') ? -1n : 1n;
  const normalized = str.startsWith('-') ? str.slice(1) : str;

  const [wholeRaw, fracRaw = ''] = normalized.split('.');
  const whole = BigInt(wholeRaw || '0');

  const fracPadded = (fracRaw + '0'.repeat(DECIMALS)).slice(0, DECIMALS);
  const frac = BigInt(fracPadded || '0');

  return { currency, amountMicro: sign * (whole * SCALE + frac) };
}

export function formatMoneyMicro(m: MoneyMicro, options?: { maxFractionDigits?: number }): string {
  const maxFractionDigits = options?.maxFractionDigits ?? DECIMALS;
  if (maxFractionDigits < 0 || maxFractionDigits > DECIMALS) {
    throw new Error(`Invalid maxFractionDigits: ${maxFractionDigits}`);
  }

  const sign = m.amountMicro < 0n ? '-' : '';
  const abs = m.amountMicro < 0n ? -m.amountMicro : m.amountMicro;

  const whole = abs / SCALE;
  const fracMicro = abs % SCALE;

  if (maxFractionDigits === 0) return `${sign}${whole.toString()}`;

  const fracDigits = fracMicro.toString().padStart(DECIMALS, '0').slice(0, maxFractionDigits);
  return `${sign}${whole.toString()}.${fracDigits}`;
}

export function isZero(m: MoneyMicro): boolean {
  return m.amountMicro === 0n;
}

export function addMoney(a: MoneyMicro, b: MoneyMicro): MoneyMicro {
  if (a.currency !== b.currency) throw new Error('Currency mismatch in addMoney');
  return { currency: a.currency, amountMicro: a.amountMicro + b.amountMicro };
}

export function subMoney(a: MoneyMicro, b: MoneyMicro): MoneyMicro {
  if (a.currency !== b.currency) throw new Error('Currency mismatch in subMoney');
  return { currency: a.currency, amountMicro: a.amountMicro - b.amountMicro };
}

/**
 * Exchange rate interpretation:
 * - `rateQuotePer1Base` means: 1 (base unit) = rateQuotePer1Base (quote unit)
 *
 * We store rate as fixed-point integer micro units:
 * - quote amount is in quote micro-units
 * - base unit is 1.0 base unit => base micro scale must be applied during conversion
 *
 * Conversion from quote to base:
 * base_micro = quote_micro * SCALE / rateQuotePer1Base_micro
 */
export function convertQuoteToBaseMicro(params: {
  quote: MoneyMicro;
  rateQuotePer1BaseMicro: bigint;
  baseCurrency: CurrencyCode;
}): MoneyMicro {
  const { quote, rateQuotePer1BaseMicro, baseCurrency } = params;
  if (rateQuotePer1BaseMicro === 0n) throw new Error('Exchange rate cannot be 0');

  // base_micro = quote_micro * SCALE / rate
  const baseMicro = (quote.amountMicro * SCALE) / rateQuotePer1BaseMicro;
  return { currency: baseCurrency, amountMicro: baseMicro };
}

