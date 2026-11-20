// price_item / calculate_transport: the calculator as read-only tools. The model never does
// arithmetic - it passes dimensions and quotes the formatted numbers returned here.
//
// The pricing core and the live loaders live in lib/pricing/priceItem.ts (shared with the offer
// builders); transportCore is the pure core of calculate_transport. Both are unit-tested.

import { z } from 'zod';
import { loadBaseResolver, loadDefaultMarginPct, type Db } from '../../access/config';
import { sanitizeRate, type AppSettings } from '../../currency';
import { PRICE_BOOK_STEEL_TYPES } from '../../priceBook';
import {
  isMissingTable, loadPriceBook, loadSettings, priceItemCore, priceItemSchema, type OutOfRangeReason,
} from '../../pricing/priceItem';
import { quarterOfDateString } from '../../quarterUtils';
import { addressCacheKey, normalizeAddress, resolveRoute, RoutingError } from '../../transportRouting';
import {
  OVERSIZE_LONG_FROM_M, computeTransport, dimensionsRequireManualQuote, type TransportBreakdown,
} from '../../transportTariff';
import type { TableBlock } from '../blocks';
import { formatCount, formatMoney, formatNumber, formatPercent, formatTons, quarterLabel, type Lang } from '../format';
import { defineTool, pick, type ToolOutput } from './types';

// Callers and tests that know the core from its first home keep working.
export {
  DELIVERY_TERMS, loadPriceBook, loadSettings, priceItemCore, priceItemSchema,
  type DeliveryTerm, type OutOfRangeReason, type PriceItemInput, type PriceItemResult,
} from '../../pricing/priceItem';

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
    'incoterm: CPT (default, base transport), FCA or FCA_KRAKOW (client collects, no transport). ' +
    'one_time_grade_surcharge (EUR/t) only for a grade that is not on the list, and only with the value the USER gave - never invent it. ' +
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
    if (priced.status === 'retired_grade') {
      return { result: {
        status: 'retired_grade', grade: priced.grade, known_grades: priced.knownGrades,
        message: pick(lang,
          `Gatunek "${priced.grade}" jest wycofany z listy gatunków - nowej pozycji nie da się na nim wycenić. Powiedz to i zapytaj o gatunek z aktualnej listy.`,
          `Grade "${priced.grade}" is retired from the grade list - a new line cannot be priced on it. Say so and ask for a grade from the current list.`),
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
          priced.incoterm === 'CPT'
            ? 'Domyślne opcje kalkulatora dla tego typu stali, domyślna powłoka, CPT z bazową stawką transportu z Ustawień.'
            : `Domyślne opcje kalkulatora dla tego typu stali, domyślna powłoka, ${priced.incoterm} bez transportu.`,
          priced.incoterm === 'CPT'
            ? 'Calculator default options for this steel type, default coating, CPT with the base transport rate from Settings.'
            : `Calculator default options for this steel type, default coating, ${priced.incoterm} without transport.`),
        ...(priced.oneTimeGrade ? { one_time_grade: pick(lang,
          `Użyto gatunku jednorazowego, bo gatunku ${priced.grade} nie ma na naszej liście gatunków. Powiedz to wprost.`,
          `A one-time grade was used because grade ${priced.grade} is not on our grade list. Say so.`) } : {}),
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
