// Parity of the server-side draft builder with the real calculator (docs/ai-assistant-plan.md 7.2).
//
// fixtures/calculator-save-hrs-hdg.json is offer_data saved by the calculator UI on the demo DB
// (2026-11-20, Marek Nowak, Q4 2026 PGL HRS 660 / HDG 770, settings = code defaults, price book
// without overrides): line 1 HRS S235JR+N 3 x 1500 x 3000, 20 t, margin 8%, CPT; line 2 HDG
// DX51D+Z 1 x 1250 coil, 12 t, margin 7%, CPT; no client. The builder must reproduce it exactly
// (item ids are Date.now() in the calculator, so they are copied over before comparing).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/currency';
import { EMPTY_CLIENT_INFO } from '@/lib/pdfGenerator';
import { DEFAULT_PRICE_BOOK } from '@/lib/priceBook';
import { buildOfferData, type BuildEnv, type DraftInput } from '@/lib/offers/buildOfferData';
import { validateOfferItems } from '@/lib/offerItemValidation';

type Data = Record<string, unknown> & { zestawienie: Record<string, unknown>[] };

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'calculator-save-hrs-hdg.json'), 'utf8')) as Data;

const PGL: Record<string, number> = { HRS: 660, HDG: 770 };

const env: BuildEnv = {
  settings: DEFAULT_SETTINGS,
  book: DEFAULT_PRICE_BOOK,
  pglOf: (type) => PGL[type] ?? 0,
  defaultMarginPct: DEFAULT_SETTINGS.minMarginPct,
  stamp: 1,
};

const draft: DraftInput = {
  clientInfo: { ...EMPTY_CLIENT_INFO },
  items: [
    { type: 'HRS', grade: 'S235JR+N', thickness: 3, width: 1500, length: 3000, tons: 20, margin_pct: 8 },
    { type: 'HDG', grade: 'DX51D+Z', thickness: 1, width: 1250, tons: 12, margin_pct: 7 },
  ],
  terms: { validFrom: '2026-11-20', validTo: '2026-11-30', paymentTermDays: 30, quoteValidityHours: 24, incoterm: 'CPT' },
};

function withFixtureIds(data: Data): Data {
  return { ...data, zestawienie: data.zestawienie.map((item, i) => ({ ...item, id: fixture.zestawienie[i].id })) };
}

describe('buildOfferData', () => {
  test('reproduces a real calculator save exactly', () => {
    // Act
    const built = buildOfferData(draft, env);

    // Assert
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // JSON round trip = what Postgres stores (drops undefined keys).
    expect(withFixtureIds(JSON.parse(JSON.stringify(built.offerData)) as Data)).toEqual(fixture);
  });

  test('worked example 7.3: 20 t HRS S235JR+N 3 x 1500 x 3000, margin 8%', () => {
    // PGL 660 + mill surcharges 48 = 708 (input price); margin 8% of 708 = 56,64;
    // SSC surcharges 55; transport 20 -> 708 + 56,64 + 55 + 20 = 839,64 EUR/t; x 20 t = 16 792,80 EUR.
    const built = buildOfferData({ ...draft, items: [draft.items[0]] }, env);

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const item = built.lines[0].item;
    expect(item.sumaHuta).toBe(48);
    expect(item.marza).toBeCloseTo(56.64, 10);
    expect(item.sumaSSC).toBe(55);
    expect(item.finalPrice).toBeCloseTo(839.64, 10);
    expect(item.totalValue).toBe(16792.8);
    expect(validateOfferItems(built.offerData)).toBeNull();
  });

  test('a grade not on the list without a surcharge stops the draft (D20)', () => {
    const built = buildOfferData(
      { ...draft, items: [{ type: 'HRS', grade: 'S999XYZ', thickness: 3, width: 1500, length: 3000, tons: 5 }] },
      env
    );

    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.problem.status).toBe('unknown_grade');
  });

  test('a grade not on the list with the user surcharge becomes a one-time grade (D20)', () => {
    const built = buildOfferData(
      { ...draft, items: [{ type: 'HRS', grade: 'S999XYZ', thickness: 3, width: 1500, length: 3000, tons: 5, one_time_grade_surcharge: 40 }] },
      env
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.lines[0].oneTimeGrade).toBe(true);
    const inputs = built.lines[0].item.inputs as { selectedGrade: { name: string; value: number } };
    expect(inputs.selectedGrade).toEqual({ name: 'S999XYZ', value: 40 });
    expect(built.offerData.gradeInput).toBe('S999XYZ');
    expect(validateOfferItems(built.offerData)).toBeNull();
  });

  test('a retired grade cannot start a new line, not even as a one-time grade', () => {
    const grade = DEFAULT_PRICE_BOOK.HRS.grades[0];
    const book = { ...DEFAULT_PRICE_BOOK, HRS: { ...DEFAULT_PRICE_BOOK.HRS, grades: DEFAULT_PRICE_BOOK.HRS.grades.map((g) => (g.name === grade.name ? { ...g, retired: true } : g)) } };
    const line = { type: 'HRS' as const, grade: grade.name, thickness: 3, width: 1500, length: 3000, tons: 5 };

    for (const item of [line, { ...line, one_time_grade_surcharge: 40 }]) {
      const built = buildOfferData({ ...draft, items: [item] }, { ...env, book });
      expect(built.ok).toBe(false);
      if (built.ok) return;
      expect(built.problem.status).toBe('retired_grade');
    }
  });

  test('FCA carries no transport, as the calculator forces it', () => {
    const built = buildOfferData({ ...draft, terms: { ...draft.terms, incoterm: 'FCA' } }, env);

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    for (const line of built.lines) {
      expect((line.item.inputs as { transport: number; incoterm: string }).transport).toBe(0);
      expect((line.item.inputs as { incoterm: string }).incoterm).toBe('FCA');
    }
  });

  test('a sheet line typed in sheets keeps the sheet count and tons from sheets', () => {
    const built = buildOfferData(
      { ...draft, items: [{ type: 'HRS', grade: 'S235JR+N', thickness: 3, width: 1500, length: 3000, sheets: 100 }] },
      env
    );

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // 3 x 1500 x 3000 mm x 7,85 = 105,975 kg per sheet -> 100 sheets = 10,598 t (to the kg).
    expect(built.lines[0].item.tons).toBe(10.598);
    expect(built.offerData.quantitySource).toBe('sheets');
    expect(built.offerData.sheetCount).toBe(100);
  });
});
