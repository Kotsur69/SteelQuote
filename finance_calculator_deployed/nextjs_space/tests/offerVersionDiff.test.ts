import { describe, expect, test } from 'vitest';
import {
  buildChangeSummary,
  diffOfferVersions,
  withChangeSummary,
  type OfferChange,
} from '@/lib/offerVersionDiff';
import * as fmt from '@/lib/offerVersionDiffFormat';
import { en, pl } from '@/lib/translations';

// The app groups thousands with a narrow no-break space (lib/numberFormat.ts); the expected
// strings below use a plain space for readability.
const plain = (text: string) => text.replace(/ /g, ' ');
const formatChange: typeof fmt.formatChange = (c, s) => plain(fmt.formatChange(c, s));
const formatChangeShort: typeof fmt.formatChangeShort = (c, s) => plain(fmt.formatChangeShort(c, s));
const formatSummaryShort: typeof fmt.formatSummaryShort = (c, s) => plain(fmt.formatSummaryShort(c, s));
const { changeTrend, changeShortParts } = fmt;

const PL = pl.versionDiff;
const EN = en.versionDiff;

// One zestawienie item. totalValue = finalPrice × tons, all in EUR, as the calculator stores it.
function item(id: number, over: Record<string, unknown> = {}) {
  const tons = (over.tons as number) ?? 10;
  const finalPrice = (over.finalPrice as number) ?? 1000;
  return {
    id,
    type: 'HDG',
    grade: 'DX51D',
    thickness: 2,
    width: 1250,
    length: 3000,
    pgl: 645,
    sumaHuta: 80,
    sumaSSC: 30,
    marza: 52,
    inputs: { marginPct: 8, transport: 20, extra: 0, extraComment: '' },
    ...over,
    tons,
    finalPrice,
    totalValue: finalPrice * tons,
  };
}

function offer(items: unknown[], over: Record<string, unknown> = {}) {
  return {
    // Calculator "next item" form state - never part of the diff.
    currentType: 'HRS',
    thickness: 4,
    width: 1500,
    length: 3000,
    isCoilMode: false,
    gradeInput: 'S235JR+N',
    selectedGrade: { name: 'S235JR+N', value: 24 },
    selectedCoating: 'Z275',
    certIdx: 0,
    pglBase: 645,
    marginPct: 7,
    extra: 0,
    transport: 20,
    tons: 1,
    // The offer itself.
    zestawienie: items,
    paymentTermDays: 30,
    validFrom: '2026-10-01',
    validTo: '2026-10-31',
    displayCurrency: 'EUR',
    eurPlnRate: 4.3,
    clientInfo: { company: 'Stal-Bud Sp. z o.o.', sapId: '100200', firstName: 'Jan', lastName: 'Kowalski' },
    transportRoute: { destAddress: 'Katowice', distanceKm: 80, selfPickup: false },
    ...over,
  };
}

const fields = (changes: OfferChange[]) => changes.map((c) => c.field);

describe('items', () => {
  test('item added: + HDG 2×1250 · 5 t', () => {
    const prev = offer([item(1, { type: 'HRS', thickness: 4, width: 1500 })]);
    const curr = offer([...prev.zestawienie, item(2, { tons: 5 })]);
    const changes = diffOfferVersions(prev, curr);

    expect(changes[0]).toEqual({ field: 'item_added', item: 'HDG 2×1250', old: null, new: 5 });
    expect(formatChangeShort(changes[0], PL)).toBe('+ HDG 2×1250 · 5 t');
    expect(formatChange(changes[0], EN)).toBe('Item added: HDG 2×1250 · 5 t');
  });

  test('item removed: − HDG 2×1250 · 10 t', () => {
    const prev = offer([item(1, { type: 'HRS', thickness: 4, width: 1500 }), item(2)]);
    const curr = offer([prev.zestawienie[0]]);
    const changes = diffOfferVersions(prev, curr);

    expect(changes[0]).toEqual({ field: 'item_removed', item: 'HDG 2×1250', old: 10, new: null });
    expect(formatChangeShort(changes[0], EN)).toBe('− HDG 2×1250 · 10 t');
  });

  test('tons changed 10 t -> 15 t = +5 t', () => {
    const changes = diffOfferVersions(offer([item(1)]), offer([item(1, { tons: 15 })]));
    const tons = changes.find((c) => c.field === 'tons')!;

    expect(tons).toMatchObject({ item: 'HDG 2×1250', old: 10, new: 15, delta: 5 });
    expect(formatChangeShort(tons, PL)).toBe('HDG 2×1250 +5 t');
    expect(formatChange(tons, PL)).toBe('HDG 2×1250: Tonaż 10 t → 15 t (+5 t)');
  });

  test('items without an id are matched by spec, not position: removing the middle one is one change', () => {
    const noId = (thickness: number) => {
      const { id: _id, ...rest } = item(0, { thickness });
      return rest;
    };
    const prev = offer([noId(2), noId(3), noId(4)]);
    const curr = offer([noId(2), noId(4)]);
    // Only the 3 mm item is gone; 10 t × 1 000 €/t = 10 000 € less (30 000 € -> 20 000 €).
    expect(fields(diffOfferVersions(prev, curr))).toEqual(['item_removed', 'total']);
    expect(diffOfferVersions(prev, curr)[0]).toMatchObject({ item: 'HDG 3×1250', old: 10 });
  });

  test('an item edited into another product is reported, matched by item.id', () => {
    const changes = diffOfferVersions(offer([item(1)]), offer([item(1, { thickness: 3 })]));
    expect(changes[0]).toMatchObject({ field: 'item_spec', old: 'HDG 2×1250×3000 DX51D', new: 'HDG 3×1250×3000 DX51D' });
  });
});

describe('margin and price', () => {
  test('margin 8% -> 9.5% = +1.5 pp', () => {
    const curr = item(1, { inputs: { marginPct: 9.5, transport: 20, extra: 0, extraComment: '' } });
    const margin = diffOfferVersions(offer([item(1)]), offer([curr])).find((c) => c.field === 'margin')!;

    expect(margin).toEqual({ field: 'margin', item: 'HDG 2×1250', old: 8, new: 9.5, delta: 1.5 });
    expect(formatChange(margin, EN)).toBe('HDG 2×1250: Margin 8% → 9.5% (+1.5 pp)');
    expect(formatChangeShort(margin, PL)).toBe('HDG 2×1250: Marża +1.5 pp');
  });

  test('legacy item without inputs: margin amount 52 -> 60.5 €/t = +8.5 €/t', () => {
    const legacy = (marza: number) => {
      const { inputs: _inputs, ...rest } = item(1, { marza });
      return rest;
    };
    const changes = diffOfferVersions(offer([legacy(52)]), offer([legacy(60.5)]));
    const marza = changes.find((c) => c.field === 'marza')!;

    expect(fields(changes)).not.toContain('margin');
    expect(marza).toMatchObject({ old: 52, new: 60.5, delta: 8.5, currency: 'EUR' });
    expect(formatChange(marza, EN)).toBe('HDG 2×1250: Margin (amount) 52 €/t → 60.50 €/t (+8.50 €/t)');
  });

  test('offer total 120 000 -> 126 500 EUR = +6 500 EUR', () => {
    // 100 t × 1 200 €/t = 120 000 €; 100 t × 1 265 €/t = 126 500 €.
    const prev = offer([item(1, { tons: 100, finalPrice: 1200 })]);
    const curr = offer([item(1, { tons: 100, finalPrice: 1265 })]);
    const changes = diffOfferVersions(prev, curr);
    const total = changes.find((c) => c.field === 'total')!;

    expect(total).toEqual({ field: 'total', old: 120000, new: 126500, delta: 6500, currency: 'EUR' });
    expect(formatChange(total, PL)).toBe('Wartość oferty 120 000 € → 126 500 € (+6 500 €)');
    expect(changes.find((c) => c.field === 'final_price')).toMatchObject({ old: 1200, new: 1265, delta: 65 });
  });

  test('PLN offer total uses its frozen rate: 120 000 € × 4.3 = 516 000 zł -> 543 950 zł = +27 950 zł', () => {
    const pln = { displayCurrency: 'PLN', eurPlnRate: 4.3 };
    const prev = offer([item(1, { tons: 100, finalPrice: 1200 })], pln);
    const curr = offer([item(1, { tons: 100, finalPrice: 1265 })], pln);
    const total = diffOfferVersions(prev, curr).find((c) => c.field === 'total')!;

    expect(total).toMatchObject({ old: 516000, new: 543950, delta: 27950, currency: 'PLN' });
    expect(formatChangeShort(total, EN)).toBe('Offer value +27 950 zł');
  });

  test('a currency switch shows both totals without a meaningless delta', () => {
    const prev = offer([item(1, { tons: 100, finalPrice: 1200 })]);
    const curr = offer(prev.zestawienie, { displayCurrency: 'PLN', eurPlnRate: 4.3 });
    const total = diffOfferVersions(prev, curr).find((c) => c.field === 'total')!;

    expect(total).toEqual({ field: 'total', old: 120000, new: 516000, currency: 'PLN', oldCurrency: 'EUR' });
    expect(formatChange(total, EN)).toBe('Offer value 120 000 € → 516 000 zł');
  });
});

describe('transport and extras', () => {
  test('transport 20 -> 25 €/t, extra 0 -> 3 €/t, surcharge comment added', () => {
    const curr = item(1, { inputs: { marginPct: 8, transport: 25, extra: 3, extraComment: 'pallets' } });
    const changes = diffOfferVersions(offer([item(1)]), offer([curr]));

    expect(changes.find((c) => c.field === 'transport')).toMatchObject({ old: 20, new: 25, delta: 5 });
    expect(changes.find((c) => c.field === 'extra')).toMatchObject({ old: 0, new: 3, delta: 3 });
    expect(changes.find((c) => c.field === 'extra_comment')).toMatchObject({ old: null, new: 'pallets' });
    expect(formatChange(changes.find((c) => c.field === 'transport')!, PL)).toBe(
      'HDG 2×1250: Transport 20 €/t → 25 €/t (+5 €/t)'
    );
  });

  test('transport route address/km and self pickup', () => {
    const prev = offer([item(1)]);
    const moved = diffOfferVersions(prev, offer([item(1)], { transportRoute: { destAddress: 'Gliwice', distanceKm: 105 } }));
    expect(moved).toEqual([{ field: 'transport_route', old: 'Katowice (80 km)', new: 'Gliwice (105 km)' }]);

    const pickup = diffOfferVersions(prev, offer([item(1)], { transportRoute: { selfPickup: true } }));
    expect(formatChange(pickup[0], EN)).toBe('Transport route Katowice (80 km) → self pickup');
  });
});

describe('terms and client', () => {
  test('payment term, validity, currency, rate, client and name', () => {
    const prev = offer([item(1)]);
    const curr = offer([item(1)], {
      paymentTermDays: 45,
      validTo: '2026-11-15',
      displayCurrency: 'PLN',
      eurPlnRate: 4.25,
      clientInfo: { company: 'Huta Nowa S.A.', sapId: '100200', firstName: 'Anna', lastName: 'Nowak' },
    });
    const changes = diffOfferVersions(prev, curr, { prev: null, curr: 'Rama Q4' });
    const byField = Object.fromEntries(changes.map((c) => [c.field, c]));

    expect(byField.payment_term).toMatchObject({ old: 30, new: 45 });
    expect(formatChange(byField.payment_term, PL)).toBe('Termin płatności 30 dni → 45 dni');
    expect(byField.valid_to).toMatchObject({ old: '2026-10-31', new: '2026-11-15' });
    expect(byField.currency).toMatchObject({ old: 'EUR', new: 'PLN' });
    expect(byField.eur_pln_rate).toMatchObject({ old: 4.3, new: 4.25 });
    expect(byField.company).toMatchObject({ old: 'Stal-Bud Sp. z o.o.', new: 'Huta Nowa S.A.' });
    expect(byField.contact).toMatchObject({ old: 'Jan Kowalski', new: 'Anna Nowak' });
    expect(byField.offer_name).toMatchObject({ old: null, new: 'Rama Q4' });
    expect(byField.sap_id).toBeUndefined();
    expect(byField.valid_from).toBeUndefined();
  });

  test('a rate change on an EUR offer is not a change', () => {
    expect(diffOfferVersions(offer([item(1)]), offer([item(1)], { eurPlnRate: 4.4 }))).toEqual([]);
  });
});

describe('calculator form state is ignored', () => {
  test('changing only next-item form fields produces no change entries', () => {
    const prev = offer([item(1)]);
    const curr = {
      ...prev,
      currentType: 'CR',
      thickness: 1.5,
      width: 1000,
      length: 2000,
      isCoilMode: true,
      gradeInput: 'DC01',
      selectedGrade: { name: 'DC01', value: 10 },
      selectedCoating: 'Z100',
      certIdx: 2,
      pglBase: 700,
      marginPct: 12,
      extra: 9,
      transport: 40,
      tons: 33,
    };
    expect(diffOfferVersions(prev, curr)).toEqual([]);
  });

  test('JSONB key order does not matter', () => {
    const prev = offer([item(1)]);
    const reordered = Object.fromEntries(Object.entries(prev).reverse());
    expect(diffOfferVersions(prev, reordered)).toEqual([]);
  });
});

describe('short label', () => {
  test('version 0: base · N items · X t', () => {
    const summary = buildChangeSummary({ offer_data: offer([item(1), item(2, { tons: 5 })]), prev_id: null });
    expect(summary).toMatchObject({ base: { items: 2, tons: 15 }, event: 'created', changes: [] });
    expect(formatSummaryShort(summary, EN)).toBe('base · 2 items · 15 t');
    expect(formatSummaryShort(summary, PL)).toBe('bazowa · 2 poz. · 15 t');
  });

  test('at most 3 changes by priority items/tons > margin > total > rest, then +N more', () => {
    const prev = offer([item(1, { tons: 100, finalPrice: 1200 })]);
    const curr = offer(
      [
        item(1, {
          tons: 100,
          finalPrice: 1265,
          inputs: { marginPct: 9.5, transport: 20, extra: 0, extraComment: '' },
        }),
        item(2, { tons: 5, finalPrice: 1000 }),
      ],
      { paymentTermDays: 45 }
    );
    const summary = buildChangeSummary({ offer_data: curr, prev_id: 7, prev_offer_data: prev });

    expect(fields(summary.changes)).toEqual(['item_added', 'margin', 'total', 'final_price', 'payment_term']);
    // total: 100 t × 1 265 €/t + 5 t × 1 000 €/t = 131 500 € vs 120 000 € -> +11 500 €
    expect(formatSummaryShort(summary, EN)).toBe(
      '+ HDG 2×1250 · 5 t, HDG 2×1250: Margin +1.5 pp, Offer value +11 500 € +2 more'
    );
    expect(formatSummaryShort(summary, PL)).toContain('+2 więcej');
  });

  test('a version that changed nothing in the offer says so', () => {
    const summary = buildChangeSummary({ offer_data: offer([item(1)]), prev_id: 3, prev_offer_data: offer([item(1)]) });
    expect(formatSummaryShort(summary, PL)).toBe('bez zmian w ofercie');
  });
});

describe('author and event', () => {
  const base = { offer_data: offer([item(1, { tons: 15 })]), prev_id: 10, prev_offer_data: offer([item(1)]), user_id: 5 };

  test("a reviewer's edit names the reviewer, not the owner", () => {
    const summary = buildChangeSummary({ ...base, created_by: 9, created_by_name: 'Anna Senior' });
    expect(summary).toMatchObject({ event: 'reviewer_edit', author: 'Anna Senior' });
  });

  test("the owner's own edit is a plain edit", () => {
    expect(buildChangeSummary({ ...base, created_by: 5, created_by_name: 'Jan' }).event).toBe('edit');
  });

  test('a new version of a lost offer is a renegotiation', () => {
    expect(buildChangeSummary({ ...base, created_by: 5, prev_client_decision: 'lost' }).event).toBe('renegotiation');
  });

  test('rows saved before migration 033 have no author and no error', () => {
    const summary = buildChangeSummary({ ...base, created_by: null, created_by_name: null });
    expect(summary).toMatchObject({ event: 'edit', author: null });
    expect(summary.changes.map((c) => c.field)).toEqual(['tons', 'total']);
  });

  test('withChangeSummary drops the raw predecessor columns', () => {
    const row = withChangeSummary({ id: 11, ...base, prev_offer_name: null, created_by: 9, created_by_name: 'Anna' });
    expect(row).not.toHaveProperty('prev_offer_data');
    expect(row).not.toHaveProperty('created_by_name');
    expect(row.change_summary.author).toBe('Anna');
    expect(row.id).toBe(11);
  });
});

describe('price direction (green up / red down)', () => {
  const withMargin = (marginPct: number, finalPrice: number) =>
    item(1, { tons: 100, finalPrice, inputs: { marginPct, transport: 20, extra: 0, extraComment: '' } });

  test('margin 8% -> 9.5% and total 120 000 -> 126 500 € go up', () => {
    const changes = diffOfferVersions(offer([withMargin(8, 1200)]), offer([withMargin(9.5, 1265)]));
    const trends = Object.fromEntries(changes.map((c) => [c.field, changeTrend(c)]));
    expect(trends).toEqual({ margin: 'up', total: 'up', final_price: 'up' });
  });

  test('margin 9.5% -> 8% and total 126 500 -> 120 000 € go down', () => {
    const changes = diffOfferVersions(offer([withMargin(9.5, 1265)]), offer([withMargin(8, 1200)]));
    const total = changes.find((c) => c.field === 'total')!;
    expect(total.delta).toBe(-6500);
    expect(changes.map(changeTrend)).toEqual(['down', 'down', 'down']);
    expect(plain(changeShortParts(total, EN).delta!)).toBe('-6 500 €');
  });

  test('tons, terms and a currency switch stay neutral', () => {
    const tons = diffOfferVersions(offer([item(1)]), offer([item(1, { tons: 15 })])).find((c) => c.field === 'tons')!;
    expect(changeTrend(tons)).toBeNull();
    const switched = diffOfferVersions(offer([item(1)]), offer([item(1)], { displayCurrency: 'PLN' }));
    expect(changeTrend(switched.find((c) => c.field === 'total')!)).toBeNull();
  });
});
