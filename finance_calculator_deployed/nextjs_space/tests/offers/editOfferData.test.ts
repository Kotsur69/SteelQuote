// applyOfferEdit: what propose_offer_edit changes in an offer, priced by the real engine.
// Base offer = the calculator fixture (HRS 20 t margin 8% + HDG coil 12 t margin 7%, Q4 2026).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/currency';
import { EMPTY_CLIENT_INFO } from '@/lib/pdfGenerator';
import { DEFAULT_PRICE_BOOK } from '@/lib/priceBook';
import { applyOfferEdit, type EditEnv } from '@/lib/offers/editOfferData';
import { validateOfferItems } from '@/lib/offerItemValidation';

type Item = Record<string, unknown> & { inputs: Record<string, unknown> };
const base = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'calculator-save-hrs-hdg.json'), 'utf8')) as Record<string, unknown>;
const items = (data: Record<string, unknown>) => data.zestawienie as Item[];

const env: EditEnv = {
  settings: DEFAULT_SETTINGS,
  book: DEFAULT_PRICE_BOOK,
  pglOf: (type) => ({ HRS: 660, HDG: 770 } as Record<string, number>)[type] ?? 0,
  defaultMarginPct: 7,
  stamp: 100,
};

describe('applyOfferEdit', () => {
  test('margin for every line re-prices both lines and keeps everything else', () => {
    // HRS: input 660 + 48 = 708; 10% margin = 70,80; + SSC 55 + transport 20 = 853,80 EUR/t; x 20 t = 17 076,00.
    const edited = applyOfferEdit(base, { marginPct: 10 }, env);

    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const [hrs, hdg] = items(edited.offerData);
    expect(hrs.finalPrice).toBeCloseTo(853.8, 10);
    expect(hrs.totalValue).toBe(17076);
    expect(hrs.inputs.marginPct).toBe(10);
    expect(hdg.inputs.marginPct).toBe(10);
    // Untouched settings stay exactly as saved.
    expect({ ...hrs.inputs, marginPct: 8 }).toEqual(items(base)[0].inputs);
    expect(hrs.pgl).toBe(660);
    expect(edited.offerData.clientInfo).toEqual(base.clientInfo);
    expect(validateOfferItems(edited.offerData)).toBeNull();
  });

  test('a per-line margin wins over the all-lines margin', () => {
    const edited = applyOfferEdit(base, { marginPct: 10, lines: [{ line: 2, margin_pct: 6 }] }, env);

    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(items(edited.offerData).map((i) => i.inputs.marginPct)).toEqual([10, 6]);
  });

  test('tons of a sheet line update value and the sheet count, price per ton unchanged', () => {
    const edited = applyOfferEdit(base, { lines: [{ line: 1, tons: 10 }] }, env);

    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const [hrs, hdg] = items(edited.offerData);
    expect(hrs.tons).toBe(10);
    expect(hrs.finalPrice).toBe(items(base)[0].finalPrice);
    expect(hrs.totalValue).toBe(8396.4);
    // 3 x 1500 x 3000 mm sheet = 0,105975 t -> 10 t = 94,36 -> 94 sheets.
    expect(hrs.inputs.sheetCount).toBe(94);
    expect(hdg).toEqual(items(base)[1]);
  });

  test('remove, add a fresh line, change client and terms', () => {
    const client = { info: { ...EMPTY_CLIENT_INFO, company: 'Profilex Łódź Sp. z o.o.', nip: '7251000011' }, paymentTermDays: 45 };
    const edited = applyOfferEdit(base, {
      lines: [{ line: 2, remove: true }],
      addItems: [{ type: 'HRS', grade: 'S355J2+N', thickness: 5, width: 1500, length: 6000, tons: 8 }],
      client,
      quoteValidityHours: 48,
    }, env);

    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const list = items(edited.offerData);
    expect(list.map((i) => `${i.type} ${i.grade}`)).toEqual(['HRS S235JR+N', 'HRS S355J2+N']);
    expect(list[1].id).toBe(100);
    expect(list[1].pgl).toBe(660);
    expect(edited.offerData.clientInfo).toEqual(client.info);
    expect(edited.offerData.paymentTermDays).toBe(45);
    expect(edited.offerData.quoteValidityHours).toBe(48);
    expect(validateOfferItems(edited.offerData)).toBeNull();
  });

  test('refuses a line that does not exist, a legacy line and removing every line', () => {
    expect(applyOfferEdit(base, { lines: [{ line: 3, margin_pct: 9 }] }, env)).toEqual({ ok: false, problem: { kind: 'no_line', line: 3 } });

    const legacy = { ...base, zestawienie: items(base).map(({ inputs: _inputs, ...rest }) => rest) };
    expect(applyOfferEdit(legacy, { marginPct: 9 }, env)).toEqual({ ok: false, problem: { kind: 'legacy_line', line: 1 } });

    expect(applyOfferEdit(base, { lines: [{ line: 1, remove: true }, { line: 2, remove: true }] }, env))
      .toEqual({ ok: false, problem: { kind: 'no_lines_left' } });
  });

  test('an added line takes the delivery term the offer already uses (FCA: no transport)', () => {
    const fca = { ...base, zestawienie: items(base).map((i) => ({ ...i, inputs: { ...i.inputs, incoterm: 'FCA', transport: 0 } })) };
    const edited = applyOfferEdit(fca, { addItems: [{ type: 'HRS', grade: 'S235JR+N', thickness: 3, width: 1500, length: 3000, tons: 20, margin_pct: 8 }] }, env);

    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const added = items(edited.offerData)[2];
    expect([added.inputs.incoterm, added.inputs.transport]).toEqual(['FCA', 0]);
    // 839,64 at CPT minus the 20 EUR/t transport.
    expect(added.finalPrice).toBeCloseTo(819.64, 10);
  });

  test('lines with mixed delivery terms: adding a line asks which term', () => {
    const mixed = { ...base, zestawienie: items(base).map((i, n) => (n === 1 ? { ...i, inputs: { ...i.inputs, incoterm: 'FCA', transport: 0 } } : i)) };
    const add = [{ type: 'HRS' as const, grade: 'S235JR+N', thickness: 3, width: 1500, length: 3000, tons: 1 }];
    expect(applyOfferEdit(mixed, { addItems: add }, env)).toEqual({ ok: false, problem: { kind: 'needs_incoterm' } });
    expect(applyOfferEdit(mixed, { addItems: add, addIncoterm: 'CPT' }, env).ok).toBe(true);
  });

  test('the same line twice is refused, not silently merged', () => {
    expect(applyOfferEdit(base, { lines: [{ line: 1, tons: 5 }, { line: 1, margin_pct: 9 }] }, env))
      .toEqual({ ok: false, problem: { kind: 'duplicate_line', line: 1 } });
  });

  test('a margin-only edit reports surcharges that moved with the current settings', () => {
    // Scrap 3% instead of 2%: SSC of the HRS sheet line moves, the HDG coil line (no SSC) does not.
    const edited = applyOfferEdit(base, { marginPct: 8 }, { ...env, settings: { ...env.settings, scrapPct: 3 } });

    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.repriced.map((r) => r.line)).toEqual([1]);
    expect(edited.repriced[0].sumaHuta).toEqual([48, 48]);
    expect(edited.repriced[0].sumaSSC[0]).toBe(55);
    expect(edited.repriced[0].sumaSSC[1]).toBeGreaterThan(55);
    expect(applyOfferEdit(base, { marginPct: 8 }, env)).toMatchObject({ ok: true, repriced: [] });
  });

  test('an added line with an unknown grade and no surcharge is a problem, not a guess', () => {
    const edited = applyOfferEdit(base, { addItems: [{ type: 'HRS', grade: 'S999XYZ', thickness: 3, width: 1500, length: 3000, tons: 2 }] }, env);

    expect(edited.ok).toBe(false);
    if (edited.ok) return;
    expect(edited.problem.kind).toBe('added_line');
  });
});
