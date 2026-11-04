import { describe, expect, test } from 'vitest';
import {
  resolveQuantity,
  restoreQuantity,
  sheetsFromTons,
  sheetWeightTons,
  tonsFromSheets,
} from '@/lib/pricingEngine';
import { fixedGrouped, tonDecimals } from '@/lib/numberFormat';

// 3000 x 1500 x 2 mm at 7.85 g/cm3 = 70.65 kg, the worked example from the card.
const WEIGHT = sheetWeightTons(2, 1500, 3000, 7.85);

describe('sheetWeightTons', () => {
  test('computes the worked example', () => {
    expect(WEIGHT).toBeCloseTo(0.07065, 10);
  });

  test('is 0 until every dimension is filled in', () => {
    expect(sheetWeightTons(2, 1500, 0, 7.85)).toBe(0);
    expect(sheetWeightTons(0, 1500, 3000, 7.85)).toBe(0);
  });
});

describe('tonsFromSheets', () => {
  test('100 sheets = 7.065 t, with the fraction kept', () => {
    expect(tonsFromSheets(100, WEIGHT)).toBe(7.065);
  });

  test('rounds to whole kilograms, so the printed tons are the priced tons', () => {
    expect(tonsFromSheets(3, WEIGHT)).toBe(0.212);
  });
});

describe('sheetsFromTons (0.01-0.49 down, 0.50-0.99 up)', () => {
  test('7 t = 99.08 sheets rounds down to 99', () => {
    expect(sheetsFromTons(7, WEIGHT)).toBe(99);
  });

  test('7.035 t = 99.58 sheets rounds up to 100', () => {
    expect(sheetsFromTons(7.035, WEIGHT)).toBe(100);
  });

  test.each([
    [0.301, 3], // 3.01
    [0.349, 3], // 3.49
    [0.35, 4], // 3.50, must not fall to 3 through float noise
    [0.399, 4], // 3.99
  ])('%d t at 0.1 t per sheet = %d sheets', (tons, expected) => {
    expect(sheetsFromTons(tons, 0.1)).toBe(expected);
  });

  test('round-trips 7.065 t back to exactly 100 sheets', () => {
    expect(sheetsFromTons(7.065, WEIGHT)).toBe(100);
  });

  test('is 0 without a sheet weight', () => {
    expect(sheetsFromTons(7, 0)).toBe(0);
  });
});

describe('resolveQuantity', () => {
  test('typed sheets drive the tons', () => {
    const draft = { source: 'sheets' as const, tons: 0, sheets: 100 };
    expect(resolveQuantity(draft, WEIGHT)).toEqual({ tons: 7.065, sheets: 100 });
  });

  test('typed tons drive the sheets and are never snapped to whole sheets', () => {
    const draft = { source: 'tons' as const, tons: 7, sheets: 0 };
    expect(resolveQuantity(draft, WEIGHT)).toEqual({ tons: 7, sheets: 99 });
  });

  test('a dimension change keeps typed sheets fixed and recalculates the tons', () => {
    const draft = { source: 'sheets' as const, tons: 7.065, sheets: 100 };
    const thicker = sheetWeightTons(4, 1500, 3000, 7.85); // 141.3 kg
    expect(resolveQuantity(draft, thicker)).toEqual({ tons: 14.13, sheets: 100 });
  });

  test('a dimension change keeps typed tons fixed and recalculates the sheets', () => {
    const draft = { source: 'tons' as const, tons: 7, sheets: 0 };
    const thicker = sheetWeightTons(4, 1500, 3000, 7.85);
    expect(resolveQuantity(draft, thicker)).toEqual({ tons: 7, sheets: 50 });
  });

  test('a density change (teardrop 8.25) recalculates from typed sheets', () => {
    const draft = { source: 'sheets' as const, tons: 7.065, sheets: 100 };
    const teardrop = sheetWeightTons(2, 1500, 3000, 8.25); // 74.25 kg
    expect(resolveQuantity(draft, teardrop)).toEqual({ tons: 7.425, sheets: 100 });
  });

  test('coils (weight 0) keep tons only', () => {
    const draft = { source: 'tons' as const, tons: 12.5, sheets: 0 };
    expect(resolveQuantity(draft, 0)).toEqual({ tons: 12.5, sheets: 0 });
  });

  test('keeps the last tons while a sheet-driven dimension is being retyped', () => {
    const draft = { source: 'sheets' as const, tons: 7.065, sheets: 100 };
    expect(resolveQuantity(draft, 0)).toEqual({ tons: 7.065, sheets: 100 });
  });
});

describe('restoreQuantity', () => {
  test('a saved sheet-driven item stays sheet-driven', () => {
    expect(restoreQuantity(7.065, 'sheets', 100)).toEqual({ source: 'sheets', tons: 7.065, sheets: 100 });
  });

  test('items saved before this field open as tons-driven', () => {
    expect(restoreQuantity(7.065, undefined, undefined)).toEqual({ source: 'tons', tons: 7.065, sheets: 0 });
  });

  test('a malformed sheet count falls back to the saved tons', () => {
    expect(restoreQuantity(7.065, 'sheets', 'abc')).toEqual({ source: 'tons', tons: 7.065, sheets: 0 });
    expect(restoreQuantity(7.065, 'sheets', 0)).toEqual({ source: 'tons', tons: 7.065, sheets: 0 });
  });
});

describe('tonDecimals', () => {
  test('keeps 2 decimals for existing quantities', () => {
    expect(fixedGrouped(10, tonDecimals(10))).toBe('10.00');
    expect(fixedGrouped(7.5, tonDecimals(7.5))).toBe('7.50');
  });

  test('shows the third decimal when it carries a kilogram', () => {
    expect(fixedGrouped(7.065, tonDecimals(7.065))).toBe('7.065');
  });

  test('is not fooled by float noise in a summed total', () => {
    expect(tonDecimals(0.1 + 0.2)).toBe(2);
  });
});
