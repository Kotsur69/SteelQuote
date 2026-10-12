// Editable price book: every surcharge number of the calculator, per steel type.
//
// Effective book = code defaults (lib/calculatorData.ts) + overrides stored in the database
// (price_book_entries, steel_grades - migration 031). Band boundaries, labels and option
// lists stay fixed in code; only the numbers are overridable, and grades are the only rows
// that can be added or retired. Everything here is pure, so the calculator, the API route
// and the tests share exactly the same structure and validation.
import {
  GRADE_TABLES,
  YIELD_GRADES,
  DIMENSION_MATRIX_HRS,
  DIMENSION_MATRIX_CR,
  DIMENSION_MATRIX_HDG,
  DIMENSION_MATRIX_PICKLED,
  DIMENSION_MATRIX_TEARDROP,
  DIMENSION_MATRIX_ZM,
  COATING_MATRIX_HDG,
  COATING_MATRIX_ZM,
  LENGTH_SURCHARGE_HRS,
  BASE_SURCHARGE_CR_HDG,
  PICKLING_SURCHARGE,
  TEARDROP_SURCHARGE_BY_WIDTH,
  TEARDROP_OVER_MAX_WIDTH_SURCHARGE,
  BASE_SURCHARGE_FALLBACK,
  YIELD_SURCHARGE_AMOUNT,
  TOL_THICK_OPTIONS,
  CERT_OPTIONS,
  CR_PROTECTION_OPTIONS,
  HDG_PROTECTION_OPTIONS,
  ZM_PROTECTION_OPTIONS,
  SSC_MAX_WEIGHT_OPTIONS,
  SSC_PACKING_OPTIONS,
  HUTA_SSC_DEFAULT_VALUES,
  type ItemInputs,
  type SteelType,
} from './calculatorData';

export const PRICE_BOOK_STEEL_TYPES: readonly SteelType[] = ['HRS', 'CR', 'HDG', 'PICKLED', 'TEARDROP', 'ZM'];


// ---------------------------------------------------------------------------------------
// Option groups (toggle buttons in the calculator)
// ---------------------------------------------------------------------------------------

export const OPTION_GROUPS = [
  'tolerance', 'cert',
  'crProtection', 'crPackaging', 'crSurface', 'crFinish', 'crWeld',
  'hdgProtection', 'hdgPackaging', 'hdgSurface', 'hdgFinish', 'hdgWeld',
  'zmProtection', 'zmPackaging', 'zmSurface', 'zmWeld',
  'sscLenTol', 'sscFlatness', 'sscSurface', 'sscMaxWeight', 'sscMarking', 'sscEdging', 'sscPacking', 'sscLabels',
] as const;
export type OptionGroup = (typeof OPTION_GROUPS)[number];

type NumericInputKey = { [K in keyof ItemInputs]-?: NonNullable<ItemInputs[K]> extends number ? K : never }[keyof ItemInputs];

interface OptionGroupSpec {
  section: 'huta' | 'ssc';
  types: readonly SteelType[];
  valueField: NumericInputKey;
  idxField: NumericInputKey;
  defaults: (type: SteelType) => readonly number[];
}

const ALL = PRICE_BOOK_STEEL_TYPES;
const values = (options: readonly { value: number }[]) => options.map((o) => o.value);
const fixed = (list: readonly number[]) => () => list;

export const OPTION_GROUP_SPECS: Readonly<Record<OptionGroup, OptionGroupSpec>> = {
  tolerance: { section: 'huta', types: ALL, valueField: 'tolThick', idxField: 'tolThickIdx', defaults: (type) => values(TOL_THICK_OPTIONS[type]) },
  cert: { section: 'huta', types: ALL, valueField: 'cert', idxField: 'certIdx', defaults: fixed(values(CERT_OPTIONS)) },
  crProtection: { section: 'huta', types: ['CR'], valueField: 'crZabezp', idxField: 'crZabezpIdx', defaults: fixed(values(CR_PROTECTION_OPTIONS)) },
  crPackaging: { section: 'huta', types: ['CR'], valueField: 'crOpak', idxField: 'crOpakIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.crPackaging) },
  crSurface: { section: 'huta', types: ['CR'], valueField: 'crPowierz', idxField: 'crPowierzIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.crSurface) },
  crFinish: { section: 'huta', types: ['CR'], valueField: 'crWykon', idxField: 'crWykonIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.crFinish) },
  crWeld: { section: 'huta', types: ['CR'], valueField: 'crZgrzew', idxField: 'crZgrzewIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.crWeld) },
  hdgProtection: { section: 'huta', types: ['HDG'], valueField: 'hdgZabezp', idxField: 'hdgZabezpIdx', defaults: fixed(values(HDG_PROTECTION_OPTIONS)) },
  hdgPackaging: { section: 'huta', types: ['HDG'], valueField: 'hdgOpak', idxField: 'hdgOpakIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.hdgPackaging) },
  hdgSurface: { section: 'huta', types: ['HDG'], valueField: 'hdgPowierz', idxField: 'hdgPowierzIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.hdgSurface) },
  hdgFinish: { section: 'huta', types: ['HDG'], valueField: 'hdgWykon', idxField: 'hdgWykonIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.hdgFinish) },
  hdgWeld: { section: 'huta', types: ['HDG'], valueField: 'hdgZgrzew', idxField: 'hdgZgrzewIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.hdgWeld) },
  zmProtection: { section: 'huta', types: ['ZM'], valueField: 'zmZabezp', idxField: 'zmZabezpIdx', defaults: fixed(values(ZM_PROTECTION_OPTIONS)) },
  zmPackaging: { section: 'huta', types: ['ZM'], valueField: 'zmOpak', idxField: 'zmOpakIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.zmPackaging) },
  zmSurface: { section: 'huta', types: ['ZM'], valueField: 'zmPowierz', idxField: 'zmPowierzIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.zmSurface) },
  zmWeld: { section: 'huta', types: ['ZM'], valueField: 'zmZgrzew', idxField: 'zmZgrzewIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.zmWeld) },
  sscLenTol: { section: 'ssc', types: ALL, valueField: 'sscLenTol', idxField: 'sscLenTolIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.lengthTolerance) },
  sscFlatness: { section: 'ssc', types: ALL, valueField: 'sscFlatness', idxField: 'sscFlatnessIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.flatness) },
  sscSurface: { section: 'ssc', types: ALL, valueField: 'sscSurface', idxField: 'sscSurfaceIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.surface) },
  sscMaxWeight: { section: 'ssc', types: ALL, valueField: 'sscMaxWeight', idxField: 'sscMaxWeightIdx', defaults: fixed(values(SSC_MAX_WEIGHT_OPTIONS)) },
  sscMarking: { section: 'ssc', types: ALL, valueField: 'sscMarking', idxField: 'sscMarkingIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.marking) },
  sscEdging: { section: 'ssc', types: ALL, valueField: 'sscEdging', idxField: 'sscEdgingIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.edging) },
  sscPacking: { section: 'ssc', types: ALL, valueField: 'sscPacking', idxField: 'sscPackingIdx', defaults: fixed(values(SSC_PACKING_OPTIONS)) },
  sscLabels: { section: 'ssc', types: ALL, valueField: 'sscLabels', idxField: 'sscLabelsIdx', defaults: fixed(HUTA_SSC_DEFAULT_VALUES.labels) },
};

export function optionGroupsFor(type: SteelType, section: 'huta' | 'ssc'): OptionGroup[] {
  return OPTION_GROUPS.filter((g) => OPTION_GROUP_SPECS[g].section === section && OPTION_GROUP_SPECS[g].types.includes(type));
}

// ---------------------------------------------------------------------------------------
// Band structure (fixed in code) with stable keys used to address overrides
// ---------------------------------------------------------------------------------------

export const thicknessKey = (min: number, max: number) => `${min.toFixed(2)}-${max.toFixed(2)}`;
export const widthKey = (min: number, max: number) => `${min}-${max}`;

export interface DimensionBand { thicknessMin: number; thicknessMax: number; widthMin: number; widthMax: number; rowKey: string; colKey: string; value: number }
export interface ThicknessBand { thMin: number; thMax: number; rowKey: string }

const DIMENSION_SOURCE: Record<SteelType, readonly { thicknessMin: number; thicknessMax: number; widthMin: number; widthMax: number; value: number }[]> = {
  HRS: DIMENSION_MATRIX_HRS,
  CR: DIMENSION_MATRIX_CR,
  HDG: DIMENSION_MATRIX_HDG,
  PICKLED: DIMENSION_MATRIX_PICKLED,
  TEARDROP: DIMENSION_MATRIX_TEARDROP,
  ZM: DIMENSION_MATRIX_ZM,
};

export const DIMENSION_BANDS: Readonly<Record<SteelType, readonly DimensionBand[]>> = Object.fromEntries(
  PRICE_BOOK_STEEL_TYPES.map((type) => [
    type,
    DIMENSION_SOURCE[type].map((r) => ({ ...r, rowKey: thicknessKey(r.thicknessMin, r.thicknessMax), colKey: widthKey(r.widthMin, r.widthMax) })),
  ])
) as Record<SteelType, DimensionBand[]>;

export const COATING_CLASSES: Readonly<Partial<Record<SteelType, readonly string[]>>> = {
  HDG: ['Z100', 'Z140', 'Z200', 'Z225', 'Z275', 'Z350', 'Z450', 'Z600', 'Z725', 'Z800'],
  ZM: ['ZM70', 'ZM90', 'ZM120', 'ZM175', 'ZM195', 'ZM200', 'ZM250', 'ZM310', 'ZM430'],
};

type CoatingBand = ThicknessBand & { defaults: Readonly<Record<string, number | null>> };

function coatingDefaults(row: Record<string, unknown>, type: 'HDG' | 'ZM'): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const c of COATING_CLASSES[type] ?? []) {
    const v = row[c];
    out[c] = typeof v === 'number' ? v : null;
  }
  return out;
}

export const COATING_BANDS: Readonly<Partial<Record<SteelType, readonly CoatingBand[]>>> = {
  HDG: COATING_MATRIX_HDG.map((r) => ({ thMin: r.th.min, thMax: r.th.max, rowKey: thicknessKey(r.th.min, r.th.max), defaults: coatingDefaults(r, 'HDG') })),
  ZM: COATING_MATRIX_ZM.map((r) => ({ thMin: r.th.min, thMax: r.th.max, rowKey: thicknessKey(r.th.min, r.th.max), defaults: coatingDefaults(r, 'ZM') })),
};

// Base length (sheet length bands, mm) for HRS/PICKLED/TEARDROP; base width for CR/HDG/ZM.
// Boundaries are copied 1:1 from the pre-price-book engine, including the w < 299 / 300 gap.
export const BASE_LENGTH_COLUMNS = ['l1', 'l2', 'l3', 'l4', 'l5'] as const;
export const BASE_WIDTH_COLUMNS = ['w1', 'w2', 'w3', 'w4', 'w5'] as const;
export const BASE_COLUMN_LABELS: Readonly<Record<string, string>> = {
  l1: '650–999', l2: '1000–1999', l3: '2000–6000', l4: '6001–8999', l5: '9000–12300',
  w1: '<299', w2: '300–599', w3: '600–899', w4: '900–1500', w5: '>1500',
};

type BaseBand = ThicknessBand & { defaults: Readonly<Record<string, number>> };

export const BASE_LENGTH_BANDS: readonly BaseBand[] = LENGTH_SURCHARGE_HRS.map((r) => ({
  thMin: r.thMin, thMax: r.thMax, rowKey: thicknessKey(r.thMin, r.thMax),
  defaults: { l1: r.l1, l2: r.l2, l3: r.l3, l4: r.l4, l5: r.l5 },
}));
export const BASE_WIDTH_BANDS: readonly BaseBand[] = BASE_SURCHARGE_CR_HDG.map((r) => ({
  thMin: r.thMin, thMax: r.thMax, rowKey: thicknessKey(r.thMin, r.thMax),
  defaults: { w1: r.w1, w2: r.w2, w3: r.w3, w4: r.w4, w5: r.w5 },
}));
export const PICKLING_BANDS: readonly (ThicknessBand & { value: number })[] = PICKLING_SURCHARGE.map((r) => ({
  thMin: r.thicknessMin, thMax: r.thicknessMax, rowKey: thicknessKey(r.thicknessMin, r.thicknessMax), value: r.value,
}));
export const TEARDROP_BANDS: readonly { widthMin: number; widthMax: number; rowKey: string; value: number }[] = TEARDROP_SURCHARGE_BY_WIDTH.map((r) => ({
  ...r, rowKey: widthKey(r.widthMin, r.widthMax),
}));

export const BASE_LENGTH_TYPES: readonly SteelType[] = ['HRS', 'PICKLED', 'TEARDROP'];

// ---------------------------------------------------------------------------------------
// Book types
// ---------------------------------------------------------------------------------------

export const PRICE_TABLE_KEYS = ['option', 'dimension', 'coating', 'baseLength', 'baseWidth', 'pickling', 'teardrop', 'scalar'] as const;
export type PriceTableKey = (typeof PRICE_TABLE_KEYS)[number];
export const SCALAR_KEYS = ['baseFallback', 'teardropOver2050', 'yieldAmount'] as const;
export type ScalarKey = (typeof SCALAR_KEYS)[number];
export const VALUE_COL = 'value';

/** row -> col -> value. Only cells that exist are present; a missing cell renders as '—'. */
export type CellMap = Readonly<Record<string, Readonly<Record<string, number>>>>;

export interface BookGrade {
  id: number | null;
  name: string;
  surcharge: number;
  hasYieldSurcharge: boolean;
  retired: boolean;
  sortOrder: number;
}

export interface TypePriceBook {
  tables: Readonly<Partial<Record<PriceTableKey, CellMap>>>;
  grades: readonly BookGrade[];
}

export type PriceBook = Readonly<Record<SteelType, TypePriceBook>>;

export interface PriceBookEntry {
  steelType: SteelType;
  tableKey: string;
  rowKey: string;
  colKey: string;
  value: number;
}

export interface GradeRow {
  id: number;
  steelType: SteelType;
  name: string;
  surcharge: number;
  hasYieldSurcharge: boolean;
  retired: boolean;
  sortOrder: number;
}

// ---------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------

function defaultTables(type: SteelType): Partial<Record<PriceTableKey, CellMap>> {
  const option: Record<string, Record<string, number>> = {};
  for (const group of OPTION_GROUPS) {
    const spec = OPTION_GROUP_SPECS[group];
    if (!spec.types.includes(type)) continue;
    option[group] = Object.fromEntries(spec.defaults(type).map((v, i) => [String(i), v]));
  }

  const dimension: Record<string, Record<string, number>> = {};
  for (const band of DIMENSION_BANDS[type]) {
    dimension[band.rowKey] = { ...(dimension[band.rowKey] ?? {}), [band.colKey]: band.value };
  }

  const scalar: Record<string, Record<string, number>> = {
    baseFallback: { [VALUE_COL]: BASE_SURCHARGE_FALLBACK },
    yieldAmount: { [VALUE_COL]: YIELD_SURCHARGE_AMOUNT },
  };

  const tables: Partial<Record<PriceTableKey, CellMap>> = { option, dimension, scalar };

  const coatingBands = COATING_BANDS[type];
  if (coatingBands) {
    tables.coating = Object.fromEntries(coatingBands.map((b) => [
      b.rowKey,
      Object.fromEntries(Object.entries(b.defaults).filter((e): e is [string, number] => e[1] !== null)),
    ]));
  }
  if (BASE_LENGTH_TYPES.includes(type)) {
    tables.baseLength = Object.fromEntries(BASE_LENGTH_BANDS.map((b) => [b.rowKey, { ...b.defaults }]));
  } else {
    tables.baseWidth = Object.fromEntries(BASE_WIDTH_BANDS.map((b) => [b.rowKey, { ...b.defaults }]));
  }
  if (type === 'PICKLED') {
    tables.pickling = Object.fromEntries(PICKLING_BANDS.map((b) => [b.rowKey, { [VALUE_COL]: b.value }]));
  }
  if (type === 'TEARDROP') {
    tables.teardrop = Object.fromEntries(TEARDROP_BANDS.map((b) => [b.rowKey, { [VALUE_COL]: b.value }]));
    scalar.teardropOver2050 = { [VALUE_COL]: TEARDROP_OVER_MAX_WIDTH_SURCHARGE };
  }
  return tables;
}

export function defaultGrades(type: SteelType): BookGrade[] {
  return GRADE_TABLES[type].map((g, i) => ({
    id: null,
    name: g.name,
    surcharge: g.value,
    hasYieldSurcharge: type === 'HRS' && YIELD_GRADES.includes(g.name),
    retired: false,
    sortOrder: i,
  }));
}

export const DEFAULT_PRICE_BOOK: PriceBook = Object.fromEntries(
  PRICE_BOOK_STEEL_TYPES.map((type) => [type, { tables: defaultTables(type), grades: defaultGrades(type) }])
) as unknown as PriceBook;

// ---------------------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------------------

export function defaultCell(type: SteelType, tableKey: string, rowKey: string, colKey: string): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_PRICE_BOOK[type]?.tables ?? {}, tableKey)) return undefined;
  const table = DEFAULT_PRICE_BOOK[type].tables[tableKey as PriceTableKey];
  if (!table || !Object.prototype.hasOwnProperty.call(table, rowKey)) return undefined;
  const row = table[rowKey];
  return Object.prototype.hasOwnProperty.call(row, colKey) ? row[colKey] : undefined;
}

/**
 * Pure: base book + DB overrides (+ DB grades). Overrides addressing a cell that does not
 * exist in the base structure are ignored (stale rows must never invent cells). `grades`
 * null = the steel_grades table does not exist yet -> keep the base grades; a type with no
 * rows in it also keeps its base grades, so a calculator can never end up with no grades.
 */
export function mergePriceBook(
  base: PriceBook,
  entries: readonly PriceBookEntry[],
  grades: readonly GradeRow[] | null
): PriceBook {
  const out = {} as Record<SteelType, TypePriceBook>;
  for (const type of PRICE_BOOK_STEEL_TYPES) {
    const tables: Partial<Record<PriceTableKey, Record<string, Record<string, number>>>> = {};
    for (const [key, cells] of Object.entries(base[type].tables) as [PriceTableKey, CellMap][]) {
      tables[key] = Object.fromEntries(Object.entries(cells).map(([row, cols]) => [row, { ...cols }]));
    }
    for (const e of entries) {
      if (e.steelType !== type || !Number.isFinite(e.value)) continue;
      if (!Object.prototype.hasOwnProperty.call(tables, e.tableKey)) continue;
      const table = tables[e.tableKey as PriceTableKey];
      if (!table || !Object.prototype.hasOwnProperty.call(table, e.rowKey)) continue;
      const row = table[e.rowKey];
      if (Object.prototype.hasOwnProperty.call(row, e.colKey)) row[e.colKey] = e.value;
    }

    const typeGrades = grades?.filter((g) => g.steelType === type) ?? [];
    const mergedGrades: BookGrade[] = typeGrades.length > 0
      ? [...typeGrades]
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
          .map(({ id, name, surcharge, hasYieldSurcharge, retired, sortOrder }) => ({ id, name, surcharge, hasYieldSurcharge, retired, sortOrder }))
      : base[type].grades.map((g) => ({ ...g }));

    out[type] = { tables, grades: mergedGrades };
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------------------

export function bookCell(book: PriceBook, type: SteelType, tableKey: PriceTableKey, rowKey: string, colKey: string): number | undefined {
  return book[type]?.tables[tableKey]?.[rowKey]?.[colKey];
}

export function scalarValue(book: PriceBook, type: SteelType, key: ScalarKey): number {
  return bookCell(book, type, 'scalar', key, VALUE_COL) ?? defaultCell(type, 'scalar', key, VALUE_COL) ?? 0;
}

/** Prices of an option group by index. Groups a type does not use fall back to the code defaults. */
export function optionValues(book: PriceBook, type: SteelType, group: OptionGroup): number[] {
  const defaults = OPTION_GROUP_SPECS[group].defaults(type);
  const row = book[type]?.tables.option?.[group];
  return defaults.map((v, i) => row?.[String(i)] ?? v);
}

export function optionValue(book: PriceBook, type: SteelType, group: OptionGroup, idx: number): number {
  return optionValues(book, type, group)[idx] ?? 0;
}

/** Labeled options from code with prices swapped for the book's, by index. */
export function withBookPrices<T extends { label: string; value: number }>(
  book: PriceBook, type: SteelType, group: OptionGroup, labeled: readonly T[]
): T[] {
  const prices = optionValues(book, type, group);
  return labeled.map((o, i) => ({ ...o, value: prices[i] ?? o.value }));
}

/**
 * Selected option index of a saved item/offer. A stored index wins; items saved before the
 * price book only have the value, matched against the CODE DEFAULTS (never the live book -
 * once a price changes, the live value no longer identifies the option). null = unresolvable.
 */
export function resolveOptionIdx(type: SteelType, group: OptionGroup, idx: unknown, value: unknown): number | null {
  const defaults = OPTION_GROUP_SPECS[group].defaults(type);
  if (typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < defaults.length) return idx;
  if (typeof value === 'number') {
    const found = defaults.indexOf(value);
    return found >= 0 ? found : null;
  }
  return null;
}

export function findGrade(book: PriceBook, type: SteelType, name: string): BookGrade | undefined {
  return book[type]?.grades.find((g) => g.name === name);
}

export function activeGrades(book: PriceBook, type: SteelType): BookGrade[] {
  return (book[type]?.grades ?? []).filter((g) => !g.retired);
}
