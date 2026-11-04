import { describe, expect, test } from 'vitest';
import {
  computeCenaKoncowa,
  computeItemPricing,
  smallQuantitySurcharge,
  type RecomputableItem,
} from '@/lib/pricingEngine';
import { DEFAULT_PRICE_BOOK, PRICE_BOOK_STEEL_TYPES, mergePriceBook } from '@/lib/priceBook';
import { validatePriceBookUpdate } from '@/lib/priceBookValidation';
import { validateOfferItems } from '@/lib/offerItemValidation';
import { diffOfferVersions } from '@/lib/offerVersionDiff';
import type { ItemInputs } from '@/lib/calculatorData';
import type { AppSettings } from '@/lib/currency';

describe('smallQuantitySurcharge', () => {
  test.each([
    [0.01, 10],
    [3, 10],
    [4.9, 10],
    [4.95, 10], // between the quoted bands: still under 5 t
    [5, 5],
    [7.065, 5],
    [9.9, 5],
    [9.95, 0], // "above 9.9 t" is taken literally
    [10, 0],
    [120, 0],
  ])('%d t -> %d EUR/t', (tons, expected) => {
    expect(smallQuantitySurcharge(DEFAULT_PRICE_BOOK, 'HRS', tons)).toBe(expected);
  });

  test('no surcharge until a quantity is entered', () => {
    expect(smallQuantitySurcharge(DEFAULT_PRICE_BOOK, 'HRS', 0)).toBe(0);
    expect(smallQuantitySurcharge(DEFAULT_PRICE_BOOK, 'HRS', Number.NaN)).toBe(0);
  });

  test('every steel type has the default rates', () => {
    for (const type of PRICE_BOOK_STEEL_TYPES) {
      expect(smallQuantitySurcharge(DEFAULT_PRICE_BOOK, type, 3)).toBe(10);
      expect(smallQuantitySurcharge(DEFAULT_PRICE_BOOK, type, 7)).toBe(5);
    }
  });

  test('rates come from the admin price book, per steel type, on the same bands', () => {
    const entry = (rowKey: string, value: number) =>
      ({ steelType: 'HRS' as const, tableKey: 'scalar', rowKey, colKey: 'value', value });
    const book = mergePriceBook(DEFAULT_PRICE_BOOK, [entry('smallQtyUnder5', 12), entry('smallQtyUpTo9_9', 0)], null);
    expect(smallQuantitySurcharge(book, 'HRS', 3)).toBe(12);
    expect(smallQuantitySurcharge(book, 'HRS', 7)).toBe(0);
    expect(smallQuantitySurcharge(book, 'HRS', 12)).toBe(0);
    expect(smallQuantitySurcharge(book, 'CR', 3)).toBe(10);
  });
});

describe('price book validation of the rates', () => {
  const body = (rowKey: string, value: number) =>
    ({ steelType: 'HRS', entries: [{ tableKey: 'scalar', rowKey, colKey: 'value', value }] });

  test('accepts a new rate and 0 (turns the band off)', () => {
    expect(validatePriceBookUpdate(body('smallQtyUnder5', 12.5), []).ok).toBe(true);
    expect(validatePriceBookUpdate(body('smallQtyUpTo9_9', 0), []).ok).toBe(true);
  });

  test('rejects a negative rate', () => {
    expect(validatePriceBookUpdate(body('smallQtyUnder5', -1), [])).toMatchObject({ ok: false, error: expect.stringMatching(/negative/) });
  });
});

describe('computeCenaKoncowa with the small quantity surcharge', () => {
  // Worked example: wsad 691, margin 7 % = 48.37, transport 20, SSC 55 -> 814.37 EUR/t.
  // At 3 t the surcharge adds 10 EUR/t: 824.37 EUR/t, 2473.11 EUR in total.
  test('adds the surcharge to the price but not to the margin', () => {
    const { marzaNetto, cenaKoncowa } = computeCenaKoncowa(691, 7, 0, 20, 55, 10);
    expect(marzaNetto).toBeCloseTo(48.37, 2);
    expect(cenaKoncowa).toBeCloseTo(824.37, 2);
    expect(Math.round(cenaKoncowa * 3 * 100) / 100).toBe(2473.11);
  });

  test('stays the old formula when the surcharge is left out', () => {
    expect(computeCenaKoncowa(691, 7, 0, 20, 55).cenaKoncowa).toBeCloseTo(814.37, 2);
  });
});

describe('computeItemPricing keeps the frozen surcharge', () => {
  const settings = { scrapPct: 1.5 } as AppSettings;
  const inputs = {
    tolThick: 0, cert: 0,
    crZabezp: 0, crOpak: 0, crPowierz: 0, crWykon: 0, crZgrzew: 0,
    hdgZabezp: 0, hdgOpak: 0, hdgPowierz: 0, hdgWykon: 0, hdgZgrzew: 0,
    zmZabezp: 0, zmOpak: 0, zmPowierz: 0, zmZgrzew: 0,
    sscLenTol: 0, sscFlatness: 0, sscSurface: 0, sscMaxWeight: 0,
    sscMarking: 0, sscEdging: 0, sscPacking: 0, sscLabels: 0,
    selectedGrade: { name: 'S235JR+N', value: 0 },
    selectedCoating: '',
    marginPct: 7, extra: 0, transport: 20,
  } as unknown as ItemInputs;
  const item = (patch: Partial<ItemInputs>): RecomputableItem => ({
    type: 'HRS', thickness: 4, width: 1500, length: 3000, grade: 'S235JR+N', tons: 3,
    inputs: { ...inputs, ...patch },
  });

  test('a saved surcharge survives a PGL recalculation', () => {
    const without = computeItemPricing(item({}), 700, settings, DEFAULT_PRICE_BOOK)!;
    const withIt = computeItemPricing(item({ smallQtySurcharge: 10 }), 700, settings, DEFAULT_PRICE_BOOK)!;
    expect(withIt.finalPrice - without.finalPrice).toBeCloseTo(10, 6);
    expect(withIt.totalValue - without.totalValue).toBeCloseTo(30, 2);
  });

  test('an item saved before the surcharge gets none, even at 3 t', () => {
    const legacy = computeItemPricing(item({}), 700, settings, DEFAULT_PRICE_BOOK)!;
    const explicitZero = computeItemPricing(item({ smallQtySurcharge: 0 }), 700, settings, DEFAULT_PRICE_BOOK)!;
    expect(legacy.finalPrice).toBe(explicitZero.finalPrice);
  });
});

describe('validateOfferItems with the small quantity surcharge', () => {
  const base = {
    id: 1, type: 'HRS', grade: 'S235JR+N', thickness: 4, width: 1500, length: 3000,
    tons: 3, pgl: 645, sumaHuta: 46, sumaSSC: 55, marza: 48.37,
    finalPrice: 824.37, totalValue: 2473.11,
    inputs: { marginPct: 7, extra: 0, transport: 20, smallQtySurcharge: 10 },
  };

  test('accepts a price that includes the surcharge', () => {
    expect(validateOfferItems({ zestawienie: [base] })).toBeNull();
  });

  test('rejects a price that does not match the surcharge', () => {
    const wrong = { ...base, inputs: { ...base.inputs, smallQtySurcharge: 5 } };
    expect(validateOfferItems({ zestawienie: [wrong] })).toMatch(/finalPrice/);
  });

  test('rejects a surcharge that is not a number', () => {
    const wrong = { ...base, inputs: { ...base.inputs, smallQtySurcharge: 'ten' } };
    expect(validateOfferItems({ zestawienie: [wrong] })).toMatch(/smallQtySurcharge/);
  });

  test('rejects a negative surcharge even when the price matches it', () => {
    const wrong = { ...base, finalPrice: 764.37, totalValue: 2293.11, inputs: { ...base.inputs, smallQtySurcharge: -50 } };
    expect(validateOfferItems({ zestawienie: [wrong] })).toMatch(/smallQtySurcharge/);
  });

  test('a legacy item without the field still validates on the old formula', () => {
    const { smallQtySurcharge: _unused, ...oldInputs } = base.inputs;
    const legacy = { ...base, finalPrice: 814.37, totalValue: 2443.11, inputs: oldInputs };
    expect(validateOfferItems({ zestawienie: [legacy] })).toBeNull();
  });
});

describe('offer version diff', () => {
  const offer = (tons: number, smallQtySurcharge?: number) => ({
    zestawienie: [{
      id: 1, type: 'HRS', thickness: 4, width: 1500, length: 3000, tons, finalPrice: 800,
      inputs: { marginPct: 7, extra: 0, transport: 20, ...(smallQtySurcharge === undefined ? {} : { smallQtySurcharge }) },
    }],
  });

  test('reports a changed surcharge', () => {
    const change = diffOfferVersions(offer(3, 10), offer(6, 5)).find((c) => c.field === 'small_quantity');
    expect(change).toMatchObject({ old: 10, new: 5, delta: -5 });
  });

  test('treats a legacy item as surcharge 0', () => {
    const change = diffOfferVersions(offer(3), offer(3, 10)).find((c) => c.field === 'small_quantity');
    expect(change).toMatchObject({ old: 0, new: 10, delta: 10 });
  });

  test('stays silent when legacy and current both carry none', () => {
    const changes = diffOfferVersions(offer(20), offer(20, 0));
    expect(changes.find((c) => c.field === 'small_quantity')).toBeUndefined();
  });
});
