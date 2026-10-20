// Offer (quotation) validity in hours - "Ważność oferty: 24h od daty wystawienia".
// Chosen per offer in the calculator (QuoteValidityPicker), independent of the payment
// term, which now comes from the client's settings (clients.payment_term_days).
export const QUOTE_VALIDITY_HOUR_PRESETS = [24, 48] as const;
export const DEFAULT_QUOTE_VALIDITY_HOURS = 24;
export const MAX_QUOTE_VALIDITY_HOURS = 2160;

const HOURS_PER_DAY = 24;

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
