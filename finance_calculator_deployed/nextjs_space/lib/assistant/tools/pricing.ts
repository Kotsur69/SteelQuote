// price_item / calculate_transport: the calculator as read-only tools. The model never does
// arithmetic - it passes dimensions and quotes the formatted numbers returned here.
//
// Both tools are a pure core (priceItemCore, transportCore: no database, unit-tested against the
// real engine) plus a thin run() that loads the LIVE price book, settings and PGL. An item is
// priced as a fresh calculator item: default option selection of its steel type
// (lib/optionSelection.ts), default coating, CPT with the base transport rate from settings.

import { z } from 'zod';
import { loadBaseResolver, loadDefaultMarginPct, type Db } from '../../access/config';
import type { ItemInputs, SteelType } from '../../calculatorData';
import { DEFAULT_SETTINGS, sanitizeRate, settingsRowToAppSettings, type AppSettings } from '../../currency';
import { defaultOptionSelection, optionSelectionFields } from '../../optionSelection';
import {
  DEFAULT_PRICE_BOOK, PRICE_BOOK_STEEL_TYPES, activeGrades, mergePriceBook,
  type BookGrade, type GradeRow, type PriceBook, type PriceBookEntry,
} from '../../priceBook';
import {
  computeItemPricing, getBaseSurchargeRaw, getCoatingSurcharge, getDimensionSurcharge, getPicklingSurcharge,
  sheetWeightTons, smallQuantitySurcharge, tonsFromSheets, type RecomputedItemPricing,
} from '../../pricingEngine';
import { quarterOfDateString } from '../../quarterUtils';
import { addressCacheKey, normalizeAddress, resolveRoute, RoutingError } from '../../transportRouting';
import {
  OVERSIZE_LONG_FROM_M, computeTransport, dimensionsRequireManualQuote,
  type TariffBand, type TransportBreakdown,
} from '../../transportTariff';
import type { TableBlock } from '../blocks';
import { formatCount, formatMoney, formatNumber, formatPercent, formatTons, quarterLabel, type Lang } from '../format';
import { defineTool, pick, type ToolOutput } from './types';

const STEEL_TYPES = ['HRS', 'CR', 'HDG', 'PICKLED', 'TEARDROP', 'ZM'] as const;
// Same constants as components/Calculator.tsx (sheet weight density, default coating per type).
const STEEL_SHEET_DENSITY = 7.85;
const TEARDROP_SHEET_DENSITY = 8.25;
const DEFAULT_COATING: Partial<Record<SteelType, string>> = { HDG: 'Z275', ZM: 'ZM120' };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
}).strict();

export type PriceItemInput = z.infer<typeof priceItemSchema>;
export type OutOfRangeReason = 'dimension' | 'coating' | 'pickling';

export type PriceItemResult =
  | { status: 'invalid'; reason: 'quantity' | 'sheets_for_coil' }
  | { status: 'unknown_grade'; grade: string; knownGrades: string[] }
  | { status: 'out_of_range'; reason: OutOfRangeReason }
  | {
      status: 'ok';
      grade: string;
      isCoil: boolean;
      length: number;
      tons: number;
      sheets: number | null;
      marginPct: number;
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

  const grade = matchGrade(book, type, input.grade);
  if (!grade) {
    return { status: 'unknown_grade', grade: input.grade, knownGrades: activeGrades(book, type).map((g) => g.name) };
  }

  const coating = DEFAULT_COATING[type] ?? '';
  if (getDimensionSurcharge(book, type, thickness, width) === null) return { status: 'out_of_range', reason: 'dimension' };
  if (coating && getCoatingSurcharge(book, type, thickness, coating) === null) return { status: 'out_of_range', reason: 'coating' };
  if (type === 'PICKLED' && getPicklingSurcharge(book, type, thickness) === null) return { status: 'out_of_range', reason: 'pickling' };

  const density = type === 'TEARDROP' ? TEARDROP_SHEET_DENSITY : STEEL_SHEET_DENSITY;
  const tons = input.sheets !== undefined
    ? tonsFromSheets(input.sheets, sheetWeightTons(thickness, width, length, density))
    : (input.tons as number);
  const marginPct = input.margin_pct ?? defaultMarginPct;
  const smallQty = smallQuantitySurcharge(book, type, tons);

  const inputs = {
    ...optionSelectionFields(book, type, defaultOptionSelection(type)),
    selectedGrade: { name: grade.name, value: grade.surcharge },
    selectedCoating: coating,
    marginPct,
    extra: 0,
    transport: settings.transportBase,
    smallQtySurcharge: smallQty,
    incoterm: 'CPT',
  } as unknown as ItemInputs;

  const pricing = computeItemPricing(
    { type, thickness, width, length, grade: grade.name, tons, isCoil, inputs }, pgl, settings, book
  );
  if (!pricing) throw new Error('computeItemPricing returned null for an item with inputs');

  return {
    status: 'ok', grade: grade.name, isCoil, length, tons, sheets: input.sheets ?? null, marginPct,
    transport: settings.transportBase, smallQtySurcharge: smallQty,
    baseFallbackUsed: !isCoil && getBaseSurchargeRaw(book, type, thickness, width, length) === null,
    pricing,
  };
}

// --- Live data --------------------------------------------------------------------------------

const isMissingTable = (error: unknown): boolean => (error as { code?: string })?.code === '42P01';

/** Settings + tariff bands, as GET /api/settings builds them (code defaults before the migrations). */
async function loadSettings(db: Db): Promise<AppSettings> {
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
async function loadPriceBook(db: Db): Promise<PriceBook> {
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

// --- price_item: tool -------------------------------------------------------------------------

const eurPerTon = (value: number, lang: Lang): string => `${formatMoney(value, 'EUR', lang)}/t`;

const RANGE_TABLE: Record<OutOfRangeReason, [string, string]> = {
  dimension: ['tabelą dopłat wymiarowych (grubość x szerokość)', 'the dimension surcharge table (thickness x width)'],
  coating: ['zakresem grubości dla domyślnej powłoki', 'the thickness range of the default coating'],
  pickling: ['tabelą dopłat za trawienie', 'the pickling surcharge table'],
};

export const priceItem = defineTool({
  name: 'price_item',
  description:
    'Price ONE item exactly as the calculator would for a new item with default options: PGL of the quarter + mill surcharges + margin + SSC surcharges + base transport. ' +
    `type: ${PRICE_BOOK_STEEL_TYPES.join(', ')}. thickness / width / length in mm; length 0 or omitted = coil. Give EXACTLY ONE of tons or sheets (sheets only for sheet items). ` +
    'margin_pct defaults to the calculator default; valid_from (YYYY-MM-DD) picks the PGL quarter, default today. Prices are EUR. ' +
    'Never calculate, estimate or convert prices yourself - quote the *_text values exactly. unknown_grade / out_of_range mean: ask the user, do not guess.',
  schema: priceItemSchema,
  run: async (input, rt): Promise<ToolOutput> => {
    const { lang, db } = rt;
    const validFrom = input.valid_from ?? rt.today;
    const [baseOf, settings, book, defaultMargin] = await Promise.all([
      loadBaseResolver(validFrom, db), loadSettings(db), loadPriceBook(db), loadDefaultMarginPct(db),
    ]);
    const priced = priceItemCore(input, baseOf(input.type), settings, book, defaultMargin);

    if (priced.status === 'invalid') {
      return { result: { status: 'invalid', message: priced.reason === 'quantity'
        ? pick(lang, 'Podaj dokładnie jedno: tony albo liczbę arkuszy. Jeśli użytkownik nie podał ilości, zapytaj.', 'Give exactly one of tons or sheets. If the user gave no quantity, ask.')
        : pick(lang, 'Krąg (długość 0) nie ma arkuszy - zapytaj o tony albo o długość arkusza.', 'A coil (length 0) has no sheets - ask for tons or for the sheet length.') } };
    }
    if (priced.status === 'unknown_grade') {
      return { result: {
        status: 'unknown_grade', grade: priced.grade, known_grades: priced.knownGrades,
        message: pick(lang,
          `Gatunku "${priced.grade}" nie ma na liście gatunków dla ${input.type}. Powiedz to wprost i zapytaj użytkownika o jednorazową dopłatę za gatunek (EUR/t) - nie wymyślaj jej i nie podstawiaj innego gatunku.`,
          `Grade "${priced.grade}" is not on the grade list for ${input.type}. Say so and ask the user for a one-time grade surcharge (EUR/t) - do not invent one and do not substitute another grade.`),
      } };
    }
    if (priced.status === 'out_of_range') {
      const [pl, en] = RANGE_TABLE[priced.reason];
      return { result: { status: 'out_of_range', reason: priced.reason, message: pick(lang,
        `Wymiary są poza ${pl} dla ${input.type}. Nie ma ceny - zapytaj użytkownika o poprawne wymiary, nigdy nie szacuj.`,
        `The dimensions are outside ${en} for ${input.type}. There is no price - ask the user for valid dimensions, never estimate.`) } };
    }

    const p = priced.pricing;
    const quarter = quarterOfDateString(validFrom);
    const money = (value: number) => ({ value, text: eurPerTon(value, lang) });
    const breakdown = {
      pgl: money(p.pgl), suma_huta: money(p.sumaHuta), margin: money(p.marza), suma_ssc: money(p.sumaSSC),
      transport: money(priced.transport), small_quantity_surcharge: money(priced.smallQtySurcharge),
      final_price_per_ton: money(p.finalPrice),
      total_value: { value: p.totalValue, text: formatMoney(p.totalValue, 'EUR', lang) },
    };
    const marginText = formatPercent(priced.marginPct, 2, lang);
    const table: TableBlock = {
      type: 'table',
      title: `${input.type} ${priced.grade} ${formatNumber(input.thickness, 2, lang)} x ${formatCount(input.width, lang)}${priced.isCoil ? '' : ` x ${formatCount(priced.length, lang)}`} mm, ${formatTons(priced.tons, lang)}`,
      columns: [pick(lang, 'Składnik', 'Component'), pick(lang, 'Kwota', 'Amount')],
      rows: [
        ['PGL', breakdown.pgl.text],
        [pick(lang, 'Suma dopłat huty', 'Mill surcharges'), breakdown.suma_huta.text],
        [pick(lang, `Marża ${marginText}`, `Margin ${marginText}`), breakdown.margin.text],
        [pick(lang, 'Suma dopłat SSC', 'SSC surcharges'), breakdown.suma_ssc.text],
        ['Transport', breakdown.transport.text],
        [pick(lang, 'Dopłata za małą ilość', 'Small quantity surcharge'), breakdown.small_quantity_surcharge.text],
        [pick(lang, 'Cena końcowa', 'Final price'), breakdown.final_price_per_ton.text],
        [pick(lang, 'Wartość pozycji', 'Item value'), breakdown.total_value.text],
      ],
    };
    return {
      result: {
        status: 'ok',
        item: {
          type: input.type, grade: priced.grade, thickness_mm: input.thickness, width_mm: input.width,
          length_mm: priced.length, form: priced.isCoil ? 'coil' : 'sheet',
          tons: priced.tons, tons_text: formatTons(priced.tons, lang),
          ...(priced.sheets !== null ? { sheets: priced.sheets } : {}),
        },
        breakdown,
        // What the calculator and the PDF print: the final price rounded UP to a full EUR.
        final_price_per_ton_displayed_text: `${formatCount(Math.ceil(p.finalPrice), lang)} EUR/t`,
        margin_pct_text: marginText,
        pgl_quarter: quarter ? quarterLabel(quarter.year, quarter.quarter, lang) : null,
        assumptions: pick(lang,
          'Domyślne opcje kalkulatora dla tego typu stali, domyślna powłoka, CPT z bazową stawką transportu z Ustawień.',
          'Calculator default options for this steel type, default coating, CPT with the base transport rate from Settings.'),
        ...(priced.baseFallbackUsed ? { warning: pick(lang,
          'Wymiary arkusza są poza tabelą dopłaty bazowej SSC - użyto stawki awaryjnej z cennika (kalkulator pokazuje to samo ostrzeżenie). Powiedz to użytkownikowi.',
          'The sheet dimensions are outside the SSC base surcharge table - the price book fallback rate was used (the calculator shows the same warning). Tell the user.') } : {}),
      },
      blocks: [table],
    };
  },
});

// --- calculate_transport ----------------------------------------------------------------------

export const transportSchema = z.object({
  destination: z.string().trim().min(1).max(300),
  weight_tons: z.number().positive().max(100000),
  length_mm: z.number().positive().max(30000).optional(),
  width_mm: z.number().positive().max(10000).optional(),
  /** Road kilometres given by the user: skips routing. */
  distance_km: z.number().positive().max(5000).optional(),
}).strict();

export interface TransportCoreInput {
  distanceKm: number;
  weightTons: number;
  lengthMm?: number;
  widthMm?: number;
}

export type TransportResult =
  | { status: 'manual_quote' }
  | { status: 'no_tariff' }
  | { status: 'ok'; hasLongElements: boolean; eurPlnRate: number; breakdown: TransportBreakdown };

/** Elements this long or wide are quoted by the carrier individually (no tariff price). */
export function needsManualQuote(lengthMm?: number, widthMm?: number): boolean {
  return dimensionsRequireManualQuote(lengthMm ?? 0, widthMm ?? 0);
}

/** Tariff price of a delivery, as the calculator's transport panel computes it. Pure: no I/O. */
export function transportCore(input: TransportCoreInput, settings: AppSettings): TransportResult {
  if (needsManualQuote(input.lengthMm, input.widthMm)) return { status: 'manual_quote' };
  const hasLongElements = (input.lengthMm ?? 0) / 1000 > OVERSIZE_LONG_FROM_M;
  const eurPlnRate = sanitizeRate(settings.eurPlnRate);
  const breakdown = computeTransport({
    distanceKm: input.distanceKm, totalTons: input.weightTons, truckCapacityT: settings.transportTruckCapacityT,
    bands: settings.tariffBands, hasLongElements, oversizeLongPln: settings.transportOversizeLongPln, eurPlnRate,
  });
  return breakdown ? { status: 'ok', hasLongElements, eurPlnRate, breakdown } : { status: 'no_tariff' };
}

/** Road distance with the same route_cache as POST /api/transport (cache problems never block). */
async function routeDistanceKm(origin: string, destination: string, db: Db): Promise<number> {
  const originAddress = normalizeAddress(origin);
  const destAddress = normalizeAddress(destination);
  const keys = [addressCacheKey(originAddress), addressCacheKey(destAddress)];
  try {
    const hit = await db.query('SELECT distance_km FROM route_cache WHERE origin_key = $1 AND dest_key = $2', keys);
    if (hit.rows.length > 0) return Number(hit.rows[0].distance_km);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  const route = await resolveRoute(originAddress, destAddress);
  await db.query(
    `INSERT INTO route_cache (origin_key, dest_key, origin_label, dest_label,
       origin_lat, origin_lng, dest_lat, dest_lng, distance_km, provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (origin_key, dest_key) DO UPDATE SET distance_km = EXCLUDED.distance_km, provider = EXCLUDED.provider`,
    [...keys, route.origin.label, route.dest.label, route.origin.lat, route.origin.lng,
      route.dest.lat, route.dest.lng, route.distanceKm, route.provider]
  ).catch(() => undefined); // the cache is an optimisation, never a condition of the answer
  return route.distanceKm;
}

export const calculateTransport = defineTool({
  name: 'calculate_transport',
  description:
    'Transport cost of a delivery from the warehouse to a destination (city or full address), as the calculator computes it: road distance, trucks needed, tariff price per truck, total PLN and EUR per ton. ' +
    'weight_tons = tons of the WHOLE delivery. length_mm / width_mm of the longest / widest element when known (oversize rules). ' +
    'Pass distance_km only when the user gave the kilometres. route_error: ask the user for kilometres; manual_quote: the carrier quotes it individually. Never estimate distances or costs yourself.',
  schema: transportSchema,
  run: async (input, rt): Promise<ToolOutput> => {
    const { lang, db } = rt;
    if (needsManualQuote(input.length_mm, input.width_mm)) {
      return { result: { status: 'manual_quote', message: pick(lang,
        'Elementy powyżej 15,1 m długości lub 2,4 m szerokości przewoźnik wycenia indywidualnie - cennik nie ma na to stawki. Powiedz to wprost, nie szacuj.',
        'Elements longer than 15.1 m or wider than 2.4 m are quoted by the carrier individually - the tariff has no rate. Say so, do not estimate.') } };
    }
    const settings = await loadSettings(db);
    let distanceKm = input.distance_km;
    if (distanceKm === undefined) {
      try {
        distanceKm = await routeDistanceKm(settings.transportOriginAddress, input.destination, db);
      } catch (error) {
        if (!(error instanceof RoutingError)) throw error;
        return { result: { status: 'route_error', code: error.code, message: pick(lang,
          `Nie udało się wyznaczyć trasy do "${input.destination}". Poproś użytkownika o liczbę kilometrów (albo dokładniejszy adres) - nie szacuj odległości.`,
          `No route could be found to "${input.destination}". Ask the user for the kilometres (or a more precise address) - do not estimate the distance.`) } };
      }
    }
    const outcome = transportCore({ distanceKm, weightTons: input.weight_tons, lengthMm: input.length_mm, widthMm: input.width_mm }, settings);
    if (outcome.status !== 'ok') {
      return { result: { status: 'no_tariff', message: pick(lang,
        'Cennik transportowy nie ma stawki dla tej odległości - transport trzeba wpisać ręcznie. Nie szacuj.',
        'The transport tariff has no rate for this distance - transport has to be entered manually. Do not estimate.') } };
    }

    const b = outcome.breakdown;
    const text = {
      distance: `${formatNumber(distanceKm, 1, lang)} km`,
      weight: formatTons(input.weight_tons, lang),
      trucks: formatCount(b.trucks, lang),
      price_per_truck: formatMoney(b.pricePerTruckPln, 'PLN', lang),
      oversize_per_truck: formatMoney(b.oversizePerTruckPln, 'PLN', lang),
      total: formatMoney(b.totalPln, 'PLN', lang),
      eur_per_ton: eurPerTon(b.eurPerTon, lang),
      eur_pln_rate: formatNumber(outcome.eurPlnRate, 4, lang),
    };
    const table: TableBlock = {
      type: 'table',
      title: `Transport: ${settings.transportOriginAddress} - ${input.destination}`,
      columns: [pick(lang, 'Składnik', 'Component'), pick(lang, 'Wartość', 'Value')],
      rows: [
        [pick(lang, 'Odległość', 'Distance'), text.distance],
        [pick(lang, 'Tonaż', 'Weight'), text.weight],
        [pick(lang, 'Ciężarówki', 'Trucks'), text.trucks],
        [pick(lang, 'Stawka za ciężarówkę', 'Price per truck'), text.price_per_truck],
        ...(outcome.hasLongElements ? [[pick(lang, 'Dopłata za długie elementy / ciężarówkę', 'Long element surcharge / truck'), text.oversize_per_truck]] : []),
        [pick(lang, 'Razem', 'Total'), text.total],
        [pick(lang, 'Transport na tonę', 'Transport per ton'), text.eur_per_ton],
      ],
    };
    return {
      result: {
        status: 'ok',
        origin: settings.transportOriginAddress, destination: input.destination,
        distance_km: distanceKm, distance_source: input.distance_km === undefined ? 'route' : 'user',
        trucks: b.trucks, truck_capacity_text: formatTons(settings.transportTruckCapacityT, lang),
        price_per_truck_pln: b.pricePerTruckPln, oversize_per_truck_pln: b.oversizePerTruckPln,
        total_pln: b.totalPln, eur_per_ton: b.eurPerTon, has_long_elements: outcome.hasLongElements,
        text,
      },
      blocks: [table],
    };
  },
});
