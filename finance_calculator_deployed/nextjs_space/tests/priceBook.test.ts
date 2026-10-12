import { describe, expect, test } from 'vitest';
import * as engine from '@/lib/pricingEngine';
import * as legacy from './fixtures/legacyPricingEngine';
import {
  COATING_CLASSES,
  DEFAULT_PRICE_BOOK,
  DIMENSION_BANDS,
  PRICE_BOOK_STEEL_TYPES,
  defaultGrades,
  mergePriceBook,
  resolveOptionIdx,
  type GradeRow,
  type PriceBookEntry,
} from '@/lib/priceBook';
import { validatePriceBookUpdate } from '@/lib/priceBookValidation';
import { defaultOptionSelection, optionSelectionFields, restoreOptionSelection } from '@/lib/optionSelection';
import { buildItemNotes } from '@/lib/itemNotes';
import { GRADE_TABLES, YIELD_GRADES, type ItemInputs, type SteelType } from '@/lib/calculatorData';
import { pl } from '@/lib/translations';

const TYPES = PRICE_BOOK_STEEL_TYPES;
const book = (entries: PriceBookEntry[], grades: GradeRow[] | null = null) => mergePriceBook(DEFAULT_PRICE_BOOK, entries, grades);
const entry = (steelType: SteelType, tableKey: string, rowKey: string, colKey: string, value: number): PriceBookEntry =>
  ({ steelType, tableKey, rowKey, colKey, value });

// DB-shaped grade rows equal to the code defaults (what migration 031 seeds).
function seededGrades(): GradeRow[] {
  let id = 1;
  return TYPES.flatMap((type) => defaultGrades(type).map((g) => ({ ...g, id: id++, steelType: type })));
}

// Sample points: every band boundary, just inside/outside it, and values in the gaps.
const uniq = (xs: number[]) => Array.from(new Set(xs.map((x) => Math.round(x * 1000) / 1000)));
const THICKNESSES = uniq(TYPES.flatMap((t) => DIMENSION_BANDS[t].flatMap((b) => [b.thicknessMin, b.thicknessMax, b.thicknessMin - 0.005, b.thicknessMax + 0.005])))
  .concat([0.19, 0.2, 0.3, 1.22, 2.505, 4.5, 6.2, 6.35, 13, 16.005, 16.01, 30]);
const WIDTHS = uniq(TYPES.flatMap((t) => DIMENSION_BANDS[t].flatMap((b) => [b.widthMin, b.widthMax])))
  .concat([100, 298, 299, 299.5, 300, 1500.5, 1501, 2050, 2051, 5000]);
const LENGTHS = [0, 500, 650, 999, 1500, 1999.5, 3000, 6000, 6000.5, 7000, 10000, 12300, 13000];

describe('mergePriceBook', () => {
  test('no overrides and no grade table = the code defaults', () => {
    expect(book([])).toEqual(DEFAULT_PRICE_BOOK);
  });

  test('applies overrides only to their own type and cell', () => {
    const b = book([entry('HRS', 'option', 'sscEdging', '1', 20)]);
    expect(b.HRS.tables.option?.sscEdging?.['1']).toBe(20);
    expect(b.TEARDROP.tables.option?.sscEdging?.['1']).toBe(18);
    expect(DEFAULT_PRICE_BOOK.HRS.tables.option?.sscEdging?.['1']).toBe(18); // base untouched
  });

  test('ignores overrides of cells that do not exist in the structure', () => {
    const b = book([
      entry('HRS', 'coating', '1.00-1.24', 'Z275', 99), // HRS has no coating table
      entry('HDG', 'coating', '0.19-0.20', 'Z800', 99), // empty cell '—'
      entry('HRS', 'option', 'sscEdging', '7', 99), // no such option
      entry('HRS', 'nope', 'x', 'y', 99),
    ]);
    expect(b).toEqual(DEFAULT_PRICE_BOOK);
  });

  test('DB grades replace the code list per type; a type without rows keeps the defaults', () => {
    const rows: GradeRow[] = [
      { id: 1, steelType: 'ZM', name: 'B', surcharge: 2, hasYieldSurcharge: false, retired: false, sortOrder: 1 },
      { id: 2, steelType: 'ZM', name: 'A', surcharge: 1, hasYieldSurcharge: true, retired: true, sortOrder: 0 },
    ];
    const b = book([], rows);
    expect(b.ZM.grades.map((g) => g.name)).toEqual(['A', 'B']);
    expect(b.ZM.grades[0]).toMatchObject({ id: 2, retired: true, hasYieldSurcharge: true });
    expect(b.HRS.grades).toEqual(DEFAULT_PRICE_BOOK.HRS.grades);
  });

  test('seed defaults: grade tables have unique names, yield flags = YIELD_GRADES on HRS only', () => {
    for (const type of TYPES) {
      const names = GRADE_TABLES[type].map((g) => g.name);
      expect(new Set(names).size).toBe(names.length);
    }
    const flagged = TYPES.flatMap((t) => DEFAULT_PRICE_BOOK[t].grades.filter((g) => g.hasYieldSurcharge).map((g) => `${t}:${g.name}`));
    expect(flagged.sort()).toEqual(YIELD_GRADES.map((n) => `HRS:${n}`).sort());
  });

  test('band keys are unique within every matrix', () => {
    for (const type of TYPES) {
      const keys = DIMENSION_BANDS[type].map((b) => `${b.rowKey}|${b.colKey}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('engine with no overrides equals the pre-price-book engine', () => {
  const b = book([], seededGrades());

  test('dimension, base, pickling, teardrop and coating lookups', () => {
    for (const type of TYPES) {
      for (const th of THICKNESSES) {
        for (const w of WIDTHS) {
          expect(engine.getDimensionSurcharge(b, type, th, w)).toBe(legacy.getDimensionSurcharge(type, th, w));
          expect(engine.computeTeardropSurcharge(b, type, w)).toBe(legacy.computeTeardropSurcharge(type, w));
          for (const len of LENGTHS) {
            expect(engine.computeBaseSurcharge(b, type, th, w, len, false)).toBe(legacy.computeBaseSurcharge(type, th, w, len, false));
          }
        }
        expect(engine.computePicklingSurcharge(b, type, th)).toBe(legacy.computePicklingSurcharge(type, th));
        for (const coating of [...(COATING_CLASSES.HDG ?? []), ...(COATING_CLASSES.ZM ?? []), 'X']) {
          expect(engine.computeCoatingSurcharge(b, type, th, coating)).toBe(legacy.computeCoatingSurcharge(type, th, coating));
        }
      }
    }
  });

  test('grade surcharge and yield for every grade name of every type', () => {
    const allNames = Array.from(new Set(TYPES.flatMap((t) => GRADE_TABLES[t].map((g) => g.name)))).concat(['unknown grade']);
    for (const type of TYPES) {
      for (const name of allNames) {
        expect(engine.gradeValueFor(b, type, name)).toBe(legacy.gradeValueFor(type, name));
        expect(engine.computeYieldValue(b, type, name)).toBe(legacy.computeYieldValue(type, name));
      }
    }
  });

  test('Σ Huta, Σ SSC and computeItemPricing for every type with default options', () => {
    const settings = { scrapPct: 1.5 } as Parameters<typeof engine.computeItemPricing>[2];
    for (const type of TYPES) {
      const inputs = {
        ...optionSelectionFields(DEFAULT_PRICE_BOOK, type, defaultOptionSelection(type)),
        selectedGrade: { name: GRADE_TABLES[type][0].name, value: GRADE_TABLES[type][0].value },
        selectedCoating: type === 'ZM' ? 'ZM120' : 'Z275',
        marginPct: 7, extra: 3, transport: 20,
      } as unknown as ItemInputs;
      for (const th of [0.5, 1.5, 2, 3, 4, 8]) {
        for (const w of [800, 1250, 1500, 2100]) {
          for (const isCoil of [false, true]) {
            const item = { type, thickness: th, width: w, length: 3000, grade: inputs.selectedGrade!.name, tons: 2.5, isCoil, inputs };
            expect(engine.computeItemPricing(item, 645, settings, b)).toEqual(legacy.computeItemPricing(item, 645, settings));
          }
        }
      }
    }
  });
});

describe('worked examples', () => {
  // HRS 4 × 1500 × 3000, S235JR+N, defaults (surface improved = 10), edging = yes, scrap 0 %:
  //   base 31 + surface 10 + edging 18 = Σ SSC 59  ->  with edging 20: 61 (+2 €/t).
  test('1: HRS edging 18 -> 20 adds 2 €/t to Σ SSC of HRS only', () => {
    const edited = book([entry('HRS', 'option', 'sscEdging', '1', 20)]);
    const ssc = (b: typeof edited, type: SteelType) => {
      const sel = { ...defaultOptionSelection(type), sscEdging: 1 };
      const f = optionSelectionFields(b, type, sel) as unknown as ItemInputs;
      return engine.computeSumaSSC(b, type, 4, 1500, 3000, false, 'S235JR+N', 645, 0, f).sumaSSC;
    };
    expect(ssc(DEFAULT_PRICE_BOOK, 'HRS')).toBe(59);
    expect(ssc(edited, 'HRS')).toBe(61);
    expect(ssc(edited, 'TEARDROP')).toBe(ssc(DEFAULT_PRICE_BOOK, 'TEARDROP'));
    expect(optionSelectionFields(edited, 'TEARDROP', { ...defaultOptionSelection('TEARDROP'), sscEdging: 1 }).sscEdging).toBe(18);
  });

  test('2: TEARDROP dimension 3.00 mm × 1250 mm -> 5 leaves HRS at 19', () => {
    const edited = book([entry('TEARDROP', 'dimension', '3.00-3.99', '1100-1499', 5)]);
    expect(engine.getDimensionSurcharge(edited, 'TEARDROP', 3, 1250)).toBe(5);
    expect(engine.getDimensionSurcharge(edited, 'HRS', 3, 1250)).toBe(19);
  });

  test('3: added grade S355TEST (HRS, 60, yield) prices Σ Huta and Σ SSC; retired stays priced', () => {
    const rows = seededGrades();
    rows.push({ id: 9999, steelType: 'HRS', name: 'S355TEST', surcharge: 60, hasYieldSurcharge: true, retired: false, sortOrder: 999 });
    const b = book([], rows);
    expect(b.HRS.grades.some((g) => g.name === 'S355TEST' && !g.retired)).toBe(true);
    expect(engine.effectiveGradeValue(b, 'HRS', { name: 'S355TEST', value: 0 })).toBe(60);
    expect(engine.computeYieldValue(b, 'HRS', 'S355TEST')).toBe(7);

    const retired = book([], rows.map((r) => (r.name === 'S355TEST' ? { ...r, retired: true } : r)));
    expect(retired.HRS.grades.filter((g) => !g.retired).some((g) => g.name === 'S355TEST')).toBe(false);
    expect(engine.gradeValueFor(retired, 'HRS', 'S355TEST')).toBe(60);
  });

  test('fallbacks are editable: base 29 and teardrop above 2050', () => {
    const b = book([entry('HRS', 'scalar', 'baseFallback', 'value', 33), entry('TEARDROP', 'scalar', 'teardropOver2050', 'value', 50)]);
    expect(engine.computeBaseSurcharge(b, 'HRS', 30, 1500, 3000, false)).toBe(33);
    expect(engine.computeBaseSurcharge(b, 'CR', 30, 1500, 3000, false)).toBe(29);
    expect(engine.computeTeardropSurcharge(b, 'TEARDROP', 2100)).toBe(50);
  });
});

describe('legacy option resolution', () => {
  test('a stored index wins; without it the value is matched against the code defaults', () => {
    expect(resolveOptionIdx('HRS', 'cert', 2, 5)).toBe(2);
    expect(resolveOptionIdx('HRS', 'cert', undefined, 5)).toBe(1);
    expect(resolveOptionIdx('HRS', 'sscMaxWeight', undefined, -3)).toBe(5);
    expect(resolveOptionIdx('HRS', 'sscEdging', undefined, 20)).toBeNull(); // not a default price
    expect(resolveOptionIdx('HRS', 'cert', 9, undefined)).toBeNull();
  });

  test('a legacy item (values only) restores the right options and its notes ignore the live book', () => {
    const legacyInputs = {
      tolThick: 15, tolThickIdx: 2, cert: 10, sscEdging: 18, sscMaxWeight: 7.5, sscSurface: 10,
      crOpakIdx: 1, crWykonIdx: 0, hdgZabezpIdx: 3, hdgOpakIdx: 1, zmZabezpIdx: 2, zmOpakIdx: 1, sscPackingIdx: 3,
    };
    const sel = restoreOptionSelection(defaultOptionSelection('HRS'), 'HRS', legacyInputs);
    expect(sel).toMatchObject({ tolerance: 2, cert: 2, sscEdging: 1, sscMaxWeight: 2, sscSurface: 1, sscPacking: 3 });

    // Re-priced from the current book on edit:
    const edited = book([entry('HRS', 'option', 'sscEdging', '1', 20)]);
    expect(optionSelectionFields(edited, 'HRS', sel).sscEdging).toBe(20);

    const notes = buildItemNotes('HRS', legacyInputs as unknown as ItemInputs, pl, 'pl');
    expect(notes).toContain(`${pl.huta.certificate}: 3.2`);
    expect(notes).toContain(`${pl.ssc.edging}: ${pl.common.yes}`);
    expect(notes).toContain(`${pl.ssc.maxPackWeight}: 1,5–2,25T`);
  });

  test('a new item with indices keeps its notes when the price changes', () => {
    const fields = optionSelectionFields(book([entry('HRS', 'option', 'cert', '1', 6)]), 'HRS', defaultOptionSelection('HRS'));
    expect(fields.cert).toBe(6);
    const notes = buildItemNotes('HRS', fields as unknown as ItemInputs, pl, 'pl');
    expect(notes).toContain(`${pl.huta.certificate}: 3.1`);
  });
});

describe('validatePriceBookUpdate', () => {
  const existing = [{ id: 1, name: 'S235JR+N' }, { id: 2, name: 'S355MC' }];
  const ok = (body: unknown) => validatePriceBookUpdate(body, existing);

  test('accepts a valid diff (negatives allowed, 2 decimals)', () => {
    const r = ok({
      steelType: 'CR',
      entries: [{ tableKey: 'option', rowKey: 'crWeld', colKey: '0', value: -3.5 }, { tableKey: 'baseWidth', rowKey: '0.50-0.59', colKey: 'w1', value: 96.25 }],
      grades: { add: [{ name: ' NEW1 ', surcharge: 10, hasYieldSurcharge: true }], update: [{ id: 1, retired: true }] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.gradeAdds[0].name).toBe('NEW1');
  });

  test('rejects unknown keys and cells of other types', () => {
    expect(ok({ steelType: 'HRS', entries: [{ tableKey: 'option', rowKey: 'nope', colKey: '0', value: 1 }] }).ok).toBe(false);
    expect(ok({ steelType: 'HRS', entries: [{ tableKey: 'coating', rowKey: '1.00-1.24', colKey: 'Z275', value: 1 }] }).ok).toBe(false);
    expect(ok({ steelType: 'HDG', entries: [{ tableKey: 'coating', rowKey: '0.19-0.20', colKey: 'Z800', value: 1 }] }).ok).toBe(false);
    expect(ok({ steelType: 'HRS', entries: [{ tableKey: 'option', rowKey: 'constructor', colKey: '0', value: 1 }] }).ok).toBe(false);
    expect(ok({ steelType: 'XX', entries: [] }).ok).toBe(false);
  });

  test('rejects out-of-range, non-finite and over-precise values', () => {
    const cell = (value: unknown) => ok({ steelType: 'HRS', entries: [{ tableKey: 'option', rowKey: 'cert', colKey: '1', value }] }).ok;
    expect(cell(5001)).toBe(false);
    expect(cell(-1000.01)).toBe(false);
    expect(cell(Number.NaN)).toBe(false);
    expect(cell('5')).toBe(false);
    expect(cell(1.005)).toBe(false);
    expect(cell(-1000)).toBe(true);
    expect(cell(5000)).toBe(true);
  });

  test('rounds float noise to cents, like NUMERIC(10,2) stores it', () => {
    const r = ok({ steelType: 'HRS', entries: [{ tableKey: 'option', rowKey: 'cert', colKey: '1', value: 12.3500000001 }] });
    expect(r.ok && r.value.entries[0].value).toBe(12.35);
  });

  test('rejects duplicate and empty grade names', () => {
    const add = (...names: string[]) => ok({ steelType: 'HRS', grades: { add: names.map((name) => ({ name, surcharge: 1 })) } }).ok;
    expect(add('s235jr+n')).toBe(false);
    expect(add('NEW', 'new ')).toBe(false);
    expect(add('   ')).toBe(false);
    expect(add('NEW')).toBe(true);
  });

  test('rejects updates of unknown grades and empty saves', () => {
    expect(ok({ steelType: 'HRS', grades: { update: [{ id: 77, surcharge: 1 }] } }).ok).toBe(false);
    expect(ok({ steelType: 'HRS' }).ok).toBe(false);
  });
});
