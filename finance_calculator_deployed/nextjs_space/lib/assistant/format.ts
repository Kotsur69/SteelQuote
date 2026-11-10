// Number, money and date formatting for everything the assistant shows (tool results, tables,
// footers). The model is told to copy numbers exactly as formatted here, which keeps the number
// guard (guards/numberGuard.ts) simple: what the server wrote is what the answer may contain.
//
// Pure and dependency-free on purpose - imported by server tools and by the browser blocks.

export type Lang = 'pl' | 'en';

/** No-break space: the pl-PL thousands separator, never wraps a number across lines. */
const NBSP = ' ';

function group(int: string, sep: string): string {
  return int.replace(/\B(?=(\d{3})+$)/g, sep);
}

/** Fixed decimals with locale separators: pl "1 234,50", en "1,234.50". */
export function formatNumber(value: number, decimals: number, lang: Lang): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  const grouped = group(int, lang === 'pl' ? NBSP : ',');
  if (!frac) return `${sign}${grouped}`;
  return `${sign}${grouped}${lang === 'pl' ? ',' : '.'}${frac}`;
}

export function formatCount(value: number, lang: Lang): string {
  return formatNumber(value, 0, lang);
}

/** Tons: 2 decimals, or 3 when the third one carries a kilogram (7.065 t). */
export function formatTons(value: number, lang: Lang): string {
  const hundredths = value * 100;
  const decimals = Math.abs(hundredths - Math.round(hundredths)) < 1e-6 ? 2 : 3;
  return `${formatNumber(value, decimals, lang)}${NBSP}t`;
}

export function formatMoney(value: number, currency: 'EUR' | 'PLN', lang: Lang): string {
  return `${formatNumber(value, 2, lang)}${NBSP}${currency}`;
}

export function formatPercent(value: number, decimals: number, lang: Lang): string {
  return `${formatNumber(value, decimals, lang)}%`;
}

/** YYYY-MM-DD -> 05.11.2026 (pl) / 2026-11-05 (en keeps ISO: unambiguous for every reader). */
export function formatDate(iso: string, lang: Lang): string {
  if (lang === 'en') return iso;
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function formatDateRange(from: string | null, to: string | null, lang: Lang): string {
  if (!from && !to) return lang === 'pl' ? 'cały okres' : 'all time';
  if (from && to && from === to) return formatDate(from, lang);
  return `${from ? formatDate(from, lang) : '...'} - ${to ? formatDate(to, lang) : '...'}`;
}

const MONTHS_PL = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
];
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const ROMAN = ['I', 'II', 'III', 'IV'];

/** month is 1-12. */
export function monthLabel(year: number, month: number, lang: Lang): string {
  return `${(lang === 'pl' ? MONTHS_PL : MONTHS_EN)[month - 1]} ${year}`;
}

/** quarter is 1-4. */
export function quarterLabel(year: number, quarter: number, lang: Lang): string {
  return lang === 'pl' ? `${ROMAN[quarter - 1]} kwartał ${year}` : `Q${quarter} ${year}`;
}
