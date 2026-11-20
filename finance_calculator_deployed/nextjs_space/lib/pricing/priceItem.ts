// One steel item priced exactly as a freshly configured calculator line, plus the live settings
// and price book it is priced from. Shared by the assistant's price_item tool and the server-side
// offer builders (lib/offers/buildOfferData.ts, editOfferData.ts), so a quoted price, a proposed
// draft and a calculator save can never differ.
//
// priceItemCore is pure (no I/O, unit-tested against the real engine); the loaders read the LIVE
// price book, settings and grades. An item gets the default option selection of its steel type
// (lib/optionSelection.ts), the default coating, and the base transport rate for CPT.

import { z } from 'zod';
import type { Db } from '../access/config';
import { SELECTABLE_INCOTERMS, isTransportFreeIncoterm, type ItemInputs, type SteelType } from '../calculatorData';
import { DEFAULT_SETTINGS, settingsRowToAppSettings, type AppSettings } from '../currency';
import { defaultOptionSelection, optionSelectionFields } from '../optionSelection';
import {
  DEFAULT_PRICE_BOOK, activeGrades, mergePriceBook,
  type BookGrade, type GradeRow, type PriceBook, type PriceBookEntry,
} from '../priceBook';
import {
  computeItemPricing, getBaseSurchargeRaw, getCoatingSurcharge, getDimensionSurcharge, getPicklingSurcharge,
  resolveQuantity, sheetWeightTons, smallQuantitySurcharge, type RecomputedItemPricing,
} from '../pricingEngine';
import type { TariffBand } from '../transportTariff';

export const STEEL_TYPES = ['HRS', 'CR', 'HDG', 'PICKLED', 'TEARDROP', 'ZM'] as const;
// Same constants as components/Calculator.tsx (sheet weight density, default coating per type).
const STEEL_SHEET_DENSITY = 7.85;
const TEARDROP_SHEET_DENSITY = 8.25;

/** Sheet weight density (t/m3-equivalent factor) of a steel type, as Calculator.tsx uses it. */
export function sheetDensity(type: SteelType): number {
  return type === 'TEARDROP' ? TEARDROP_SHEET_DENSITY : STEEL_SHEET_DENSITY;
}
const DEFAULT_COATING: Partial<Record<SteelType, string>> = { HDG: 'Z275', ZM: 'ZM120' };
const CALCULATOR_DEFAULT_COATING = 'Z275';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const DELIVERY_TERMS = SELECTABLE_INCOTERMS;
export type DeliveryTerm = (typeof DELIVERY_TERMS)[number];

// --- price_item: pure core --------------------------------------------------------------------

export const priceItemSchema = z.object({
  type: z.enum(STEEL_TYPES),
  grade: z.string().trim().min(1).max(60),
  thickness: z.number().positive().max(100),
  width: z.number().positive().max(5000),
  /** mm; 0 or omitted = coil. */
  length: z.number().min(0).max(20000).optional(),
  tons: z.number().positive().max(100000).optional(),
  sheets: z.number().int().positive().max(1000000).optional(),
  margin_pct: z.number().min(-100).max(100).optional(),
  valid_from: z.string().regex(ISO_DATE).optional(),
  /** EUR/t for a grade that is NOT on the grade list (plan D20); ignored for a listed grade. */
  one_time_grade_surcharge: z.number().min(-1000).max(10000).optional(),
  /** Delivery term; FCA / FCA Kraków carry no transport (as in the calculator). Default CPT. */
  incoterm: z.enum(DELIVERY_TERMS).optional(),
}).strict();

export type PriceItemInput = z.infer<typeof priceItemSchema>;
export type OutOfRangeReason = 'dimension' | 'coating' | 'pickling';

export type PriceItemResult =
  | { status: 'invalid'; reason: 'quantity' | 'sheets_for_coil' }
  /** Not on the grade list and no one-time surcharge given: ask the user for it (D20). */
  | { status: 'unknown_grade'; grade: string; knownGrades: string[] }
  /** On the list but retired: a new calculator line cannot use it (nor as a one-time grade). */
  | { status: 'retired_grade'; grade: string; knownGrades: string[] }
  | { status: 'out_of_range'; reason: OutOfRangeReason }
  | {
      status: 'ok';
      grade: string;
      isCoil: boolean;
      length: number;
      tons: number;
      sheets: number | null;
      /** Sheets the calculator shows for this quantity (0 for a coil). */
      sheetCount: number;
      quantitySource: 'tons' | 'sheets';
      marginPct: number;
      incoterm: DeliveryTerm;
      /** The grade is not on the list: priced as the calculator's one-time grade (D20). */
      oneTimeGrade: boolean;
      /** Saved on the item exactly as the calculator stores it (ItemInputs). */
      inputs: ItemInputs;
      transport: number;
      smallQtySurcharge: number;
      /** Sheet dimensions outside the base-surcharge table: priced with the book's fallback rate. */
      baseFallbackUsed: boolean;
      pricing: RecomputedItemPricing;
    };

function matchGrade(book: PriceBook, type: SteelType, name: string): BookGrade | undefined {
  const grades = book[type]?.grades ?? [];
  const wanted = name.trim().toLowerCase();
  return grades.find((g) => g.name === name) ?? grades.find((g) => g.name.toLowerCase() === wanted);
}

/** Prices one item exactly as a freshly configured calculator item. Pure: no I/O. */
export function priceItemCore(
  input: PriceItemInput,
  pgl: number,
  settings: AppSettings,
  book: PriceBook,
  defaultMarginPct: number
): PriceItemResult {
  const { type, thickness, width } = input;
  const length = input.length ?? 0;
  const isCoil = length === 0;
  if ((input.tons === undefined) === (input.sheets === undefined)) return { status: 'invalid', reason: 'quantity' };
  if (input.sheets !== undefined && isCoil) return { status: 'invalid', reason: 'sheets_for_coil' };

  const listed = matchGrade(book, type, input.grade);
  const knownGrades = () => activeGrades(book, type).map((g) => g.name);
  if (listed?.retired) return { status: 'retired_grade', grade: listed.name, knownGrades: knownGrades() };
  // A one-time grade keeps the name the user typed and the surcharge they gave
  // (pricingEngine.effectiveGradeValue prices it from the stored value because the name is not in the book).
  const surcharge = listed ? listed.surcharge : input.one_time_grade_surcharge;
  if (surcharge === undefined) return { status: 'unknown_grade', grade: input.grade, knownGrades: knownGrades() };
  const grade = { name: listed ? listed.name : input.grade.trim(), surcharge };

  const coating = DEFAULT_COATING[type] ?? '';
  if (getDimensionSurcharge(book, type, thickness, width) === null) return { status: 'out_of_range', reason: 'dimension' };
  if (coating && getCoatingSurcharge(book, type, thickness, coating) === null) return { status: 'out_of_range', reason: 'coating' };
  if (type === 'PICKLED' && getPicklingSurcharge(book, type, thickness) === null) return { status: 'out_of_range', reason: 'pickling' };

  const sheetWeight = isCoil ? 0 : sheetWeightTons(thickness, width, length, sheetDensity(type));
  const quantitySource = input.sheets !== undefined ? 'sheets' : 'tons';
  const { tons, sheets: sheetCount } = resolveQuantity(
    { source: quantitySource, tons: input.tons ?? 0, sheets: input.sheets ?? 0 }, sheetWeight
  );
  const marginPct = input.margin_pct ?? defaultMarginPct;
  const smallQty = smallQuantitySurcharge(book, type, tons);
  const incoterm: DeliveryTerm = input.incoterm ?? 'CPT';

  // Field set and order of the calculator's item snapshot (Calculator.tsx addToZestawienie).
  // Types without a coating keep the calculator's untouched coating state ('Z275'); it is
  // never priced for them.
  const inputs = {
    ...optionSelectionFields(book, type, defaultOptionSelection(type)),
    selectedGrade: { name: grade.name, value: grade.surcharge },
    selectedCoating: coating || CALCULATOR_DEFAULT_COATING,
    marginPct,
    extra: 0,
    extraComment: '',
    extraCommentInPdf: false,
    transport: isTransportFreeIncoterm(incoterm) ? 0 : settings.transportBase,
    smallQtySurcharge: smallQty,
    incoterm,
    ...(isCoil ? {} : { quantitySource, sheetCount }),
  } as unknown as ItemInputs;

  const pricing = computeItemPricing(
    { type, thickness, width, length, grade: grade.name, tons, isCoil, inputs }, pgl, settings, book
  );
  if (!pricing) throw new Error('computeItemPricing returned null for an item with inputs');

  return {
    status: 'ok', grade: grade.name, isCoil, length, tons, sheets: input.sheets ?? null, sheetCount, quantitySource,
    marginPct, incoterm, oneTimeGrade: !listed, inputs,
    transport: inputs.transport, smallQtySurcharge: smallQty,
    baseFallbackUsed: !isCoil && getBaseSurchargeRaw(book, type, thickness, width, length) === null,
    pricing,
  };
}

// --- Live data --------------------------------------------------------------------------------

export const isMissingTable = (error: unknown): boolean => (error as { code?: string })?.code === '42P01';

/** Settings + tariff bands, as GET /api/settings builds them (code defaults before the migrations). */
export async function loadSettings(db: Db): Promise<AppSettings> {
  try {
    const result = await db.query('SELECT * FROM app_settings WHERE id = 1');
    if (result.rows.length === 0) return DEFAULT_SETTINGS;
    let bands: TariffBand[] = [];
    try {
      const rows = await db.query(
        `SELECT distance_from_km, distance_to_km, flat_price_pln, price_per_km_pln
         FROM transport_tariff_bands ORDER BY distance_from_km`
      );
      bands = rows.rows.map((r) => ({
        fromKm: Number(r.distance_from_km),
        toKm: r.distance_to_km === null ? null : Number(r.distance_to_km),
        flatPln: r.flat_price_pln === null ? null : Number(r.flat_price_pln),
        perKmPln: r.price_per_km_pln === null ? null : Number(r.price_per_km_pln),
      }));
    } catch (error) {
      if (!isMissingTable(error)) throw error;
    }
    return settingsRowToAppSettings(result.rows[0], bands);
  } catch (error) {
    if (isMissingTable(error)) return DEFAULT_SETTINGS;
    throw error;
  }
}

/** Effective price book, as GET /api/price-book + lib/usePriceBook.ts build it. */
export async function loadPriceBook(db: Db): Promise<PriceBook> {
  try {
    const [entries, grades] = await Promise.all([
      db.query('SELECT steel_type, table_key, row_key, col_key, value FROM price_book_entries'),
      db.query(
        `SELECT id, steel_type, name, surcharge, has_yield_surcharge, retired_at, sort_order
         FROM steel_grades ORDER BY steel_type, sort_order, name`
      ),
    ]);
    const bookEntries: PriceBookEntry[] = entries.rows.map((r) => ({
      steelType: r.steel_type as SteelType, tableKey: String(r.table_key), rowKey: String(r.row_key),
      colKey: String(r.col_key), value: Number(r.value),
    }));
    const gradeRows: GradeRow[] = grades.rows.map((r) => ({
      id: Number(r.id), steelType: r.steel_type as SteelType, name: String(r.name), surcharge: Number(r.surcharge),
      hasYieldSurcharge: r.has_yield_surcharge === true, retired: r.retired_at !== null, sortOrder: Number(r.sort_order),
    }));
    return mergePriceBook(DEFAULT_PRICE_BOOK, bookEntries, gradeRows);
  } catch (error) {
    if (isMissingTable(error)) return DEFAULT_PRICE_BOOK;
    throw error;
  }
}
