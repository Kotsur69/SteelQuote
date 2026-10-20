import { describe, expect, test } from 'vitest';
import { resolveQuoteValidityHours, sanitizeQuoteValidityHours } from '@/lib/quoteValidity';
import { computeOfferFacts } from '@/lib/access/ruleEngine';

describe('resolveQuoteValidityHours', () => {
  test('uses the stored hours when present, independent of the payment term', () => {
    expect(resolveQuoteValidityHours({ quoteValidityHours: 24, paymentTermDays: 30 })).toBe(24);
    expect(resolveQuoteValidityHours({ quoteValidityHours: 48, paymentTermDays: 0 })).toBe(48);
  });

  test('legacy offers without the field fall back to payment days x 24', () => {
    expect(resolveQuoteValidityHours({ paymentTermDays: 2 })).toBe(48);
    expect(resolveQuoteValidityHours({ paymentTermDays: 30 })).toBe(720);
  });

  test('returns null when nothing usable is stored', () => {
    expect(resolveQuoteValidityHours({})).toBeNull();
    expect(resolveQuoteValidityHours({ paymentTermDays: 0 })).toBeNull();
    expect(resolveQuoteValidityHours({ quoteValidityHours: null, paymentTermDays: null })).toBeNull();
    expect(resolveQuoteValidityHours(null)).toBeNull();
  });

  test('ignores out-of-range or malformed hours', () => {
    expect(resolveQuoteValidityHours({ quoteValidityHours: -5 })).toBeNull();
    expect(resolveQuoteValidityHours({ quoteValidityHours: '24' })).toBeNull();
    expect(sanitizeQuoteValidityHours(99999)).toBeUndefined();
    expect(sanitizeQuoteValidityHours(36)).toBe(36);
  });
});

describe('approval facts', () => {
  test('a 30-day client term no longer counts as 720h quote validity', () => {
    const facts = computeOfferFacts({ zestawienie: [], paymentTermDays: 30, quoteValidityHours: 24 }, () => 645);
    expect(facts.quoteValidityHours).toBe(24);
  });

  test('a legacy offer keeps its days x 24 validity for the rules', () => {
    const facts = computeOfferFacts({ zestawienie: [], paymentTermDays: 2 }, () => 645);
    expect(facts.quoteValidityHours).toBe(48);
  });
});
