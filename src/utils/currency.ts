/**
 * Standard Indian Rupee (INR) Currency Formatter Utility
 * Uses Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
 * to format numbers using the Indian numbering system without manual string concatenation.
 */

export type CurrencyUnit = '/mo' | '/month' | '/yr' | '/year' | '/hr' | string;

export interface CurrencyFormatOptions {
  showSign?: boolean;
  decimals?: number;
  unit?: CurrencyUnit;
  compact?: boolean;
}

const inrFormatterCache = new Map<number, Intl.NumberFormat>();

function getINRFormatter(decimals: number): Intl.NumberFormat {
  if (!inrFormatterCache.has(decimals)) {
    inrFormatterCache.set(
      decimals,
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
      })
    );
  }
  return inrFormatterCache.get(decimals)!;
}

/**
 * Formats a number into an Indian Rupee (₹) currency string.
 *
 * @param amount - The numeric value to format
 * @param options - Options including showSign, decimals, and unit suffix
 * @returns Formatted currency string (e.g., "₹7,497", "+₹1,250/mo", "-₹634/month")
 */
export function formatINR(
  amount: number | null | undefined,
  options?: CurrencyFormatOptions
): string {
  const { showSign = false, decimals = 0, unit, compact = false } = options || {};

  if (amount === null || amount === undefined || isNaN(amount)) {
    const base = getINRFormatter(0).format(0);
    return unit ? `${base}${unit}` : base;
  }

  const isNegative = amount < 0;
  const abs = Math.abs(amount);

  let formatted = '';

  if (compact && abs >= 10000000) {
    formatted = `₹${(abs / 10000000).toFixed(decimals || 1)} Cr`;
  } else if (compact && abs >= 100000) {
    formatted = `₹${(abs / 100000).toFixed(decimals || 1)} L`;
  } else {
    formatted = getINRFormatter(decimals).format(abs);
  }

  let result = formatted;
  if (isNegative) {
    result = `-${formatted}`;
  } else if (showSign && amount > 0) {
    result = `+${formatted}`;
  }

  if (unit) {
    result = `${result}${unit}`;
  }

  return result;
}

/**
 * Convenient alias for formatINR.
 */
export const formatCurrency = formatINR;

/**
 * Formats a number with monthly unit suffix (/mo or /month).
 * Avoids manual string concatenation like `${formatINR(val)}/mo`.
 */
export function formatINRMonthly(
  amount: number | null | undefined,
  options?: Omit<CurrencyFormatOptions, 'unit'> & { fullUnit?: boolean }
): string {
  const unit = options?.fullUnit ? '/month' : '/mo';
  return formatINR(amount, { ...options, unit });
}

/**
 * Formats a number with annualized unit suffix (/yr or /year).
 * Avoids manual string concatenation like `${formatINR(val)}/yr`.
 */
export function formatINRAnnual(
  amount: number | null | undefined,
  options?: Omit<CurrencyFormatOptions, 'unit'> & { fullUnit?: boolean }
): string {
  const unit = options?.fullUnit ? '/year' : '/yr';
  return formatINR(amount, { ...options, unit });
}
