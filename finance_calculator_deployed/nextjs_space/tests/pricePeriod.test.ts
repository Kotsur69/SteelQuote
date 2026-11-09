import { describe, expect, it } from 'vitest';
import { formatPricePeriod } from '@/lib/quarterUtils';
import { PDF_LABELS } from '@/lib/pdfLabels';

describe('formatPricePeriod', () => {
  it('shows a quarter preset as "Q4 2026" (current quarter starts today)', () => {
    expect(formatPricePeriod('2026-11-09', '2026-12-31', 'pl-PL')).toBe('Q4 2026');
    expect(formatPricePeriod('2027-01-01', '2027-03-31', 'pl-PL')).toBe('Q1 2027');
  });

  it('shows a single-month period as the capitalised month name', () => {
    expect(formatPricePeriod('2026-11-09', '2026-11-30', 'pl-PL')).toBe('Listopad 2026');
    expect(formatPricePeriod('2026-11-01', '2026-11-30', 'en-GB')).toBe('November 2026');
    expect(formatPricePeriod('2026-11-01', '2026-11-30', 'de-DE')).toBe('November 2026');
  });

  it('prefers the month when a quarter pick only covers its last month', () => {
    expect(formatPricePeriod('2026-12-10', '2026-12-31', 'pl-PL')).toBe('Grudzień 2026');
  });

  it('shows a custom period as a DD.MM.YYYY range', () => {
    expect(formatPricePeriod('2026-11-09', '2026-12-15', 'pl-PL')).toBe('09.11.2026 – 15.12.2026');
    expect(formatPricePeriod('2026-11-01', '2027-01-31', 'pl-PL')).toBe('01.11.2026 – 31.01.2027');
  });

  it('falls back to the raw values when a date is malformed', () => {
    expect(formatPricePeriod('bad', '2026-12-31', 'pl-PL')).toBe('bad – 2026-12-31');
  });
});

describe('PDF validity lines', () => {
  it('offer validity is the day count, price line is the delivery period', () => {
    const L = PDF_LABELS.pl;
    expect(L.quoteValidityNote(48)).toBe('Ważność oferty: 2 dni od daty wystawienia');
    expect(L.priceValidityNote('Q4 2026')).toBe('Cena obowiązuje przy dostawach w: Q4 2026');
  });
});
