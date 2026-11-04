import { describe, expect, test } from 'vitest';
import { validateOfferItems } from '@/lib/offerItemValidation';

// Worked example (HRS, 4 × 1500 × 3000, 1 t):
//   PGL 645 + Σ Mill 46            = 691.00 (cena wsadu)
//   margin 7 % × 691               =  48.37
//   + extra 0 + transport 20 + Σ SSC 55
//   finalPrice                     = 814.37 €/t (displayed rounded up: 815)
//   totalValue = 814.37 × 1 t      = 814.37 €
const validItem = {
  id: 1,
  type: 'HRS',
  grade: 'S235JR+N',
  thickness: 4,
  width: 1500,
  length: 3000,
  tons: 1,
  pgl: 645,
  sumaHuta: 46,
  sumaSSC: 55,
  marza: 48.37,
  finalPrice: 814.37,
  totalValue: 814.37,
  inputs: { marginPct: 7, extra: 0, transport: 20 },
};

const withItem = (patch: Record<string, unknown>) => ({ zestawienie: [{ ...validItem, ...patch }] });

describe('validateOfferItems', () => {
  test('accepts a complete, self-consistent calculator item', () => {
    expect(validateOfferItems({ zestawienie: [validItem] })).toBeNull();
  });

  test('accepts offer data without items and an empty list', () => {
    expect(validateOfferItems({})).toBeNull();
    expect(validateOfferItems({ zestawienie: [] })).toBeNull();
  });

  test('accepts a legacy item without the inputs snapshot', () => {
    const { inputs: _inputs, ...legacy } = validItem;
    expect(validateOfferItems({ zestawienie: [legacy] })).toBeNull();
  });

  test('accepts a coil with length 0', () => {
    expect(validateOfferItems(withItem({ isCoil: true, length: 0 }))).toBeNull();
  });

  test('rejects the SMOKE-style item (no grade, dimensions or price, made-up value)', () => {
    const smoke = { id: 'x1', pgl: 1000, tons: 1, type: 'HRS', inputs: { marginPct: 4.5 }, totalValue: 100 };
    expect(validateOfferItems({ zestawienie: [smoke] })).toMatch(/^Item 1: invalid/);
  });

  test('rejects totalValue that is not finalPrice × tons', () => {
    expect(validateOfferItems(withItem({ totalValue: 100 }))).toMatch(/totalValue/);
  });

  test('rejects marza that does not follow from the margin %', () => {
    expect(validateOfferItems(withItem({ marza: 60, finalPrice: 826, totalValue: 826 }))).toMatch(/marza/);
  });

  test('rejects finalPrice that does not add up', () => {
    expect(validateOfferItems(withItem({ finalPrice: 900, totalValue: 900 }))).toMatch(/finalPrice/);
  });

  test('rejects a sheet with length 0 and an unknown steel type', () => {
    expect(validateOfferItems(withItem({ length: 0 }))).toMatch(/length/);
    expect(validateOfferItems(withItem({ type: 'XYZ' }))).toMatch(/type/);
  });

  test('tolerates one cent of float noise', () => {
    expect(validateOfferItems(withItem({ totalValue: 814.375 }))).toBeNull();
  });

  // Same item collected by the client (FCA): transport 20 -> 0, so 814.37 - 20 = 794.37 €/t.
  test('accepts an FCA item without transport', () => {
    expect(validateOfferItems(withItem({
      finalPrice: 794.37,
      totalValue: 794.37,
      inputs: { marginPct: 7, extra: 0, transport: 0, incoterm: 'FCA' },
    }))).toBeNull();
  });

  test('rejects an FCA item that still charges transport', () => {
    expect(validateOfferItems(withItem({
      inputs: { marginPct: 7, extra: 0, transport: 20, incoterm: 'FCA' },
    }))).toMatch(/FCA/);
  });

  // FCA Kraków prices exactly like FCA: 814.37 - 20 = 794.37 €/t.
  test('accepts an FCA Kraków item without transport', () => {
    expect(validateOfferItems(withItem({
      finalPrice: 794.37,
      totalValue: 794.37,
      inputs: { marginPct: 7, extra: 0, transport: 0, incoterm: 'FCA_KRAKOW' },
    }))).toBeNull();
  });

  test('rejects an FCA Kraków item that still charges transport', () => {
    expect(validateOfferItems(withItem({
      inputs: { marginPct: 7, extra: 0, transport: 20, incoterm: 'FCA_KRAKOW' },
    }))).toMatch(/FCA_KRAKOW/);
  });

  // CPT is the delivered term: transport 20 stays in the price, 814.37 €/t.
  test('accepts a CPT item with transport', () => {
    expect(validateOfferItems(withItem({
      inputs: { marginPct: 7, extra: 0, transport: 20, incoterm: 'CPT' },
    }))).toBeNull();
  });

  test('still accepts an item saved as DAP with transport', () => {
    expect(validateOfferItems(withItem({
      inputs: { marginPct: 7, extra: 0, transport: 20, incoterm: 'DAP' },
    }))).toBeNull();
  });

  test('rejects an unknown delivery term', () => {
    expect(validateOfferItems(withItem({
      inputs: { marginPct: 7, extra: 0, transport: 20, incoterm: 'EXW' },
    }))).not.toBeNull();
  });

  // The calculator used to store an empty grade as the '—' placeholder, which slipped
  // past a plain non-empty check. Every "no grade" spelling must be rejected.
  test.each(['', '   ', '—', '-', '–', ' — '])('rejects a gradeless item (grade %j)', grade => {
    expect(validateOfferItems(withItem({ grade }))).toMatch(/^Item 1: invalid grade/);
  });

  test('rejects an item with the grade field missing', () => {
    const { grade: _grade, ...noGrade } = validItem;
    expect(validateOfferItems({ zestawienie: [noGrade] })).toMatch(/^Item 1: invalid grade/);
  });
});
