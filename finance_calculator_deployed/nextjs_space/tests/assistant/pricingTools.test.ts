// price_item / calculate_transport pure cores. No database: code-default price book and settings.

import { describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/currency';
import { DEFAULT_PRICE_BOOK, activeGrades } from '@/lib/priceBook';
import { sheetWeightTons, tonsFromSheets } from '@/lib/pricingEngine';
import { priceItemCore, priceItemSchema, transportCore, transportSchema, type PriceItemInput } from '@/lib/assistant/tools/pricing';
import { buildItem } from '@/scripts/assistant-demo/offerData';
import type { ItemSpec } from '@/scripts/assistant-demo/spec';

const PGL = 660;
const DEFAULT_MARGIN = DEFAULT_SETTINGS.minMarginPct;

const price = (input: PriceItemInput, pgl = PGL) =>
  priceItemCore(input, pgl, DEFAULT_SETTINGS, DEFAULT_PRICE_BOOK, DEFAULT_MARGIN);

function expectSameAsDemoBuilder(spec: ItemSpec): void {
  // Arrange
  const expected = buildItem(spec, PGL, 1);

  // Act
  const priced = price({
    type: spec.type, grade: spec.grade, thickness: spec.thickness, width: spec.width,
    length: spec.length, tons: spec.tons, margin_pct: spec.marginPct,
  });

  // Assert
  expect(priced.status).toBe('ok');
  if (priced.status !== 'ok') return;
  expect(priced.pricing.finalPrice).toBe(expected.finalPrice);
  expect(priced.pricing.totalValue).toBe(expected.totalValue);
  expect(priced.pricing.sumaHuta).toBe(expected.sumaHuta);
  expect(priced.pricing.sumaSSC).toBe(expected.sumaSSC);
}

describe('priceItemCore', () => {
  test('prices an HRS sheet exactly like the demo offer builder', () => {
    expectSameAsDemoBuilder({ type: 'HRS', grade: 'S235JR+N', thickness: 4, width: 1500, length: 3000, tons: 24, marginPct: 8.5 });
  });

  test('prices an HRS coil with a small quantity exactly like the demo offer builder', () => {
    expectSameAsDemoBuilder({ type: 'HRS', grade: 'S355J2+N', thickness: 6, width: 1250, length: 0, tons: 4.5, marginPct: 6 });
  });

  test('final price is the sum of its components and total value is price x tons', () => {
    const priced = price({ type: 'HRS', grade: 'S235JR+N', thickness: 4, width: 1500, length: 3000, tons: 7 });

    expect(priced.status).toBe('ok');
    if (priced.status !== 'ok') return;
    const p = priced.pricing;
    expect(priced.marginPct).toBe(DEFAULT_MARGIN);
    expect(p.marza).toBeCloseTo((p.pgl + p.sumaHuta) * (DEFAULT_MARGIN / 100), 10);
    expect(p.finalPrice).toBeCloseTo(p.pgl + p.sumaHuta + p.marza + p.sumaSSC + priced.transport + priced.smallQtySurcharge, 10);
    expect(p.totalValue).toBe(Math.round(p.finalPrice * 7 * 100) / 100);
    expect(priced.smallQtySurcharge).toBe(5);
    expect(priced.transport).toBe(DEFAULT_SETTINGS.transportBase);
  });

  test('derives tons from a sheet count to the whole kilogram', () => {
    const priced = price({ type: 'HRS', grade: 'S235JR+N', thickness: 4, width: 1500, length: 3000, sheets: 100 });

    expect(priced.status).toBe('ok');
    if (priced.status !== 'ok') return;
    expect(priced.tons).toBe(tonsFromSheets(100, sheetWeightTons(4, 1500, 3000, 7.85)));
    expect(priced.tons).toBe(14.13);
    expect(priced.sheets).toBe(100);
  });

  test('matches a grade regardless of letter case and echoes the book spelling', () => {
    const priced = price({ type: 'HRS', grade: 's235jr+n', thickness: 4, width: 1500, tons: 20 });

    expect(priced.status === 'ok' && priced.grade).toBe('S235JR+N');
  });

  test('returns unknown_grade with the active grade names when the grade is not in the book', () => {
    const priced = price({ type: 'HRS', grade: 'X999 Unobtainium', thickness: 4, width: 1500, tons: 20 });

    expect(priced).toEqual({
      status: 'unknown_grade', grade: 'X999 Unobtainium',
      knownGrades: activeGrades(DEFAULT_PRICE_BOOK, 'HRS').map((g) => g.name),
    });
  });

  test('returns out_of_range when the dimension is outside the surcharge table', () => {
    const priced = price({ type: 'HRS', grade: 'S235JR+N', thickness: 1, width: 1500, tons: 20 });

    expect(priced).toEqual({ status: 'out_of_range', reason: 'dimension' });
  });

  test('rejects both or neither of tons and sheets, and sheets for a coil', () => {
    const base = { type: 'HRS', grade: 'S235JR+N', thickness: 4, width: 1500 } as const;

    expect(price({ ...base, length: 3000 })).toEqual({ status: 'invalid', reason: 'quantity' });
    expect(price({ ...base, length: 3000, tons: 5, sheets: 10 })).toEqual({ status: 'invalid', reason: 'quantity' });
    expect(price({ ...base, sheets: 10 })).toEqual({ status: 'invalid', reason: 'sheets_for_coil' });
  });

  test('schema is strict and limited to the known steel types', () => {
    const ok = { type: 'CR', grade: 'DC01', thickness: 1, width: 1250, tons: 10 };

    expect(priceItemSchema.safeParse(ok).success).toBe(true);
    expect(priceItemSchema.safeParse({ ...ok, type: 'INOX' }).success).toBe(false);
    expect(priceItemSchema.safeParse({ ...ok, price: 700 }).success).toBe(false);
    expect(priceItemSchema.safeParse({ ...ok, valid_from: '10.11.2026' }).success).toBe(false);
  });
});

describe('transportCore', () => {
  // DEFAULT_SETTINGS: DEFAULT_TARIFF_BANDS, 21 t per truck, 250 PLN long-element surcharge, EUR/PLN 4.3.
  test('flat band: one truck even for a partial load', () => {
    const result = transportCore({ distanceKm: 80, weightTons: 10 }, DEFAULT_SETTINGS);

    expect(result).toEqual({
      status: 'ok', hasLongElements: false, eurPlnRate: 4.3,
      breakdown: { trucks: 1, pricePerTruckPln: 1344, oversizePerTruckPln: 0, totalPln: 1344, eurPerTon: 31.26 },
    });
  });

  test('per-kilometre band with two trucks', () => {
    const result = transportCore({ distanceKm: 300, weightTons: 25 }, DEFAULT_SETTINGS);

    expect(result.status === 'ok' && result.breakdown).toEqual({
      trucks: 2, pricePerTruckPln: 2250, oversizePerTruckPln: 0, totalPln: 4500, eurPerTon: 41.86,
    });
  });

  test('elements between 13.6 m and 15.1 m add the surcharge to every truck', () => {
    const result = transportCore({ distanceKm: 300, weightTons: 25, lengthMm: 14000 }, DEFAULT_SETTINGS);

    expect(result.status === 'ok' && result.hasLongElements).toBe(true);
    expect(result.status === 'ok' && result.breakdown.totalPln).toBe(5000);
  });

  test('elements over 15.1 m long or 2.4 m wide need a manual quote', () => {
    expect(transportCore({ distanceKm: 300, weightTons: 25, lengthMm: 15200 }, DEFAULT_SETTINGS)).toEqual({ status: 'manual_quote' });
    expect(transportCore({ distanceKm: 300, weightTons: 25, widthMm: 2500 }, DEFAULT_SETTINGS)).toEqual({ status: 'manual_quote' });
  });

  test('returns no_tariff when the tariff has no band for the distance', () => {
    const settings = { ...DEFAULT_SETTINGS, tariffBands: [{ fromKm: 0, toKm: 100, flatPln: 1344, perKmPln: null }] };

    expect(transportCore({ distanceKm: 150, weightTons: 10 }, settings)).toEqual({ status: 'no_tariff' });
  });

  test('schema is strict and requires a destination and a positive weight', () => {
    expect(transportSchema.safeParse({ destination: 'Gdańsk', weight_tons: 24 }).success).toBe(true);
    expect(transportSchema.safeParse({ destination: 'Gdańsk', weight_tons: 0 }).success).toBe(false);
    expect(transportSchema.safeParse({ destination: '', weight_tons: 24 }).success).toBe(false);
    expect(transportSchema.safeParse({ destination: 'Gdańsk', weight_tons: 24, km: 500 }).success).toBe(false);
  });
});
