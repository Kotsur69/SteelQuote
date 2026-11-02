import type { Language } from './translations';

// Offer (quotation) validity - "Ważność oferty: 2 dni od daty wystawienia".
// Chosen per offer in the calculator (QuoteValidityPicker) in whole days, but still STORED
// in hours (quoteValidityHours, quote_validity_hours approval rules) so no migration is
// needed and older hour-based offers keep working. Independent of the payment term, which
// comes from the client's settings (clients.payment_term_days).
export const HOURS_PER_DAY = 24;
export const QUOTE_VALIDITY_DAY_PRESETS = [1, 2, 5, 7] as const;
export const DEFAULT_QUOTE_VALIDITY_HOURS = HOURS_PER_DAY;
export const MAX_QUOTE_VALIDITY_HOURS = 2160;
export const MAX_QUOTE_VALIDITY_DAYS = MAX_QUOTE_VALIDITY_HOURS / HOURS_PER_DAY;

/** "1 dzień" / "2 dni" / "5 dní" ... - day count with the unit in the given language. */
export function formatValidityDays(days: number, language: Language): string {
  switch (language) {
    case 'pl':
      return `${days} ${days === 1 ? 'dzień' : 'dni'}`;
    case 'cs':
      return `${days} ${days === 1 ? 'den' : days >= 2 && days <= 4 ? 'dny' : 'dní'}`;
    case 'de':
      return `${days} ${days === 1 ? 'Tag' : 'Tage'}`;
    default:
      return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
}

/**
 * Validity period as shown on the PDF: whole days when the hours divide evenly
 * (everything the day picker produces), raw hours for older offers saved as e.g. 36h.
 */
export function formatValidityPeriod(hours: number, language: Language): string {
  return hours % HOURS_PER_DAY === 0 ? formatValidityDays(hours / HOURS_PER_DAY, language) : `${hours}h`;
}

function isValidHours(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_QUOTE_VALIDITY_HOURS;
}

/**
 * Validity hours stored on an offer. Offers saved before the field existed derived it from
 * the payment term (days x 24), so that legacy value is kept for them - their PDF and
 * approval rules stay exactly as they were. Null when neither is usable.
 */
export function resolveQuoteValidityHours(
  data: { quoteValidityHours?: unknown; paymentTermDays?: unknown } | null | undefined
): number | null {
  const hours = data?.quoteValidityHours;
  if (isValidHours(hours)) return hours;
  const legacyDays = data?.paymentTermDays;
  if (typeof legacyDays === 'number' && Number.isFinite(legacyDays) && legacyDays > 0) {
    return legacyDays * HOURS_PER_DAY;
  }
  return null;
}

export function sanitizeQuoteValidityHours(value: unknown): number | undefined {
  return isValidHours(value) ? value : undefined;
}
