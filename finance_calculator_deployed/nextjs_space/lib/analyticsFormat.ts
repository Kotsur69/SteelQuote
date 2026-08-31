// Number and delta formatting for the analytics panel.
//
// Locale-aware on purpose: the app runs in four languages and 1 234,5 t vs 1,234.5 t is the
// difference between a readable figure and a misread one. The language the seller picked in
// the UI drives the separators.

import type { Language } from './translations';
import type { Currency } from './currency';

const LOCALE: Record<Language, string> = {
  pl: 'pl-PL',
  en: 'en-GB',
  cs: 'cs-CZ',
  de: 'de-DE',
};

export function formatInt(value: number, language: Language): string {
  return new Intl.NumberFormat(LOCALE[language], { maximumFractionDigits: 0 }).format(value);
}

/** Tonnage. One decimal is enough to be honest without turning an axis into noise. */
export function formatTons(value: number, language: Language): string {
  return new Intl.NumberFormat(LOCALE[language], {
    minimumFractionDigits: value === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Money, rounded to whole units. Analytics totals run into the millions, where the cents are
 * noise; the per-offer figures on an offer itself stay at two decimals as they always were.
 */
export function formatMoney(value: number, language: Language): string {
  return new Intl.NumberFormat(LOCALE[language], {
    maximumFractionDigits: 0,
  }).format(value);
}

/** Compact money for axis ticks: 1.2M, 340k. Full precision stays in the tooltip. */
export function formatMoneyShort(value: number, language: Language): string {
  const abs = Math.abs(value);
  const nf = (v: number, digits: number) =>
    new Intl.NumberFormat(LOCALE[language], { maximumFractionDigits: digits }).format(v);
  if (abs >= 1_000_000) return `${nf(value / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `${nf(value / 1_000, 0)}k`;
  return nf(value, 0);
}

export function formatPct(value: number | null, language: Language): string {
  if (value === null) return '—';
  return `${new Intl.NumberFormat(LOCALE[language], { maximumFractionDigits: 1 }).format(value)}%`;
}

export const CURRENCY_UNIT: Record<Currency, string> = { EUR: '€', PLN: 'zł' };

export interface Delta {
  /** Percentage change, or null when there is nothing meaningful to compare against. */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
}

/**
 * Change against the comparison period.
 *
 * A previous value of zero yields no percentage - "infinity percent up" is not information.
 * The direction is still reported, so the tile can say "up from nothing" without a number.
 */
export function computeDelta(current: number, previous: number | null | undefined): Delta {
  if (previous === null || previous === undefined) return { pct: null, direction: 'flat' };
  if (current === previous) return { pct: previous === 0 ? null : 0, direction: 'flat' };
  const direction = current > previous ? 'up' : 'down';
  if (previous === 0) return { pct: null, direction };
  return { pct: ((current - previous) / Math.abs(previous)) * 100, direction };
}

export function formatDelta(delta: Delta, language: Language): string {
  if (delta.pct === null) return delta.direction === 'flat' ? '—' : '';
  const sign = delta.pct > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat(LOCALE[language], { maximumFractionDigits: 1 }).format(delta.pct)}%`;
}

/** Date as the seller reads it. The wire format stays YYYY-MM-DD everywhere else. */
export function formatDate(iso: string | null, language: Language): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(LOCALE[language], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(`${iso}T00:00:00`));
}
