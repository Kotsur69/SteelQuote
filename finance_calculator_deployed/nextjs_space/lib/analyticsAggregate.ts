// Turns the offer rows from lib/analyticsQuery.ts into the numbers the panel draws.
//
// Pure functions over plain data, deliberately: every figure on the page is traceable to one
// reduction here, and the whole thing is testable without a database.
//
// The two judgement calls worth knowing about:
//
// * A steel-type filter narrows LINE ITEMS, not offers. Filtering to HDG on an offer that
//   mixes HRS and HDG keeps the offer and counts only its HDG tonnage - anything else would
//   attribute HRS tonnage to an HDG question. An offer left with no matching item drops out.
//
// * Money is summed in EUR, the app's single source of truth, and separately in PLN using
//   each offer's OWN frozen rate (offer_data.eurPlnRate) rather than today's rate, so a rate
//   change by the admin never rewrites history. An offer saved before rates were frozen
//   falls back to the default rate - see lib/currency.ts.

import type { SteelType } from './calculatorData';
import { offerRate } from './currency';
import {
  CLIENT_DECISIONS,
  STEEL_TYPE_SERIES_ORDER,
  type AnalyticsFilters,
  type AnalyticsKpi,
  type AnalyticsRow,
  type ClientDecision,
} from './analytics';
import type { AnalyticsOfferRow } from './analyticsQuery';

/** One offer reduced to the figures every aggregation needs. */
export interface NormalizedOffer {
  id: number;
  label: string;
  status: AnalyticsRow['status'];
  decision: ClientDecision;
  userId: number | null;
  ownerName: string | null;
  clientId: number | null;
  clientCompany: string | null;
  steelTypes: SteelType[];
  tons: number;
  valueEur: number;
  valuePln: number;
  /**
   * Exact per-steel-type split of this offer. A mixed HRS + HDG offer records each type's own
   * tonnage here, so the by-steel-type breakdown is real rather than an offer-level figure
   * divided by the number of types present.
   */
  byType: Partial<Record<SteelType, TypeTotals>>;
  /** Tonnage-weighted margin %, or null when no line item carries one. */
  marginPct: number | null;
  /** The date this row is bucketed and filtered on, per the chosen basis. */
  basisDate: string | null;
  createdAt: string | null;
  sentAt: string | null;
  decidedAt: string | null;
}

export interface TypeTotals {
  tons: number;
  valueEur: number;
  valuePln: number;
  /** Sum of marginPct * tons over the items of this type, for weighted averaging. */
  marginWeighted: number;
  /** Tonnage that actually carried a margin %, i.e. the divisor for marginWeighted. */
  marginTons: number;
}

interface RawItem {
  type?: unknown;
  tons?: unknown;
  totalValue?: unknown;
  inputs?: { marginPct?: unknown } | null;
}

const num = (value: unknown): number => {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

const isSteelType = (value: unknown): value is SteelType =>
  typeof value === 'string' &&
  (STEEL_TYPE_SERIES_ORDER as readonly string[]).includes(value);

/** Rounds to `places` decimals; keeps sums from drifting into 0.30000000000000004. */
export function round(value: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

// --- normalisation --------------------------------------------------------------------

/**
 * One row -> one NormalizedOffer, or null when the steel-type filter leaves it with nothing.
 * `label` prefers the offer's own name and falls back to the generated display_name, which
 * the database guarantees is never empty.
 */
export function normalizeOffer(
  row: AnalyticsOfferRow,
  filters: AnalyticsFilters
): NormalizedOffer | null {
  const raw = Array.isArray(row.offer_data?.zestawienie)
    ? (row.offer_data!.zestawienie as RawItem[])
    : [];

  const wanted = filters.steelTypes.length > 0 ? new Set<string>(filters.steelTypes) : null;

  const rate = offerRate(row.offer_data);

  let tons = 0;
  let valueEur = 0;
  let marginWeighted = 0;
  let marginTons = 0;
  const byType: Partial<Record<SteelType, TypeTotals>> = {};
  let matched = 0;

  for (const item of raw) {
    const type = isSteelType(item?.type) ? item.type : null;
    if (wanted && (!type || !wanted.has(type))) continue;
    matched++;

    const itemTons = num(item?.tons);
    const itemValue = num(item?.totalValue);
    tons += itemTons;
    valueEur += itemValue;

    // Weight by tonnage: a 200 t line item at 6% and a 2 t one at 20% must not average to
    // 13%. Items with no recorded margin (saved before ItemInputs.marginPct existed) stay out
    // of the weighting entirely rather than counting as zero.
    const pct = item?.inputs?.marginPct;
    const hasMargin = typeof pct === 'number' && Number.isFinite(pct) && itemTons > 0;
    if (hasMargin) {
      marginWeighted += (pct as number) * itemTons;
      marginTons += itemTons;
    }

    if (type) {
      const totals =
        byType[type] ??
        (byType[type] = { tons: 0, valueEur: 0, valuePln: 0, marginWeighted: 0, marginTons: 0 });
      totals.tons += itemTons;
      totals.valueEur += itemValue;
      totals.valuePln += itemValue * rate;
      if (hasMargin) {
        totals.marginWeighted += (pct as number) * itemTons;
        totals.marginTons += itemTons;
      }
    }
  }

  // An offer whose every line item was filtered out is not an offer for this question.
  if (wanted && matched === 0) return null;

  const basisDate =
    filters.basis === 'created'
      ? row.created_date
      : filters.basis === 'sent'
        ? row.sent_date
        : row.decided_date;

  return {
    id: row.id,
    label: row.display_name,
    status: row.status,
    decision: CLIENT_DECISIONS.includes(row.client_decision) ? row.client_decision : 'pending',
    userId: row.user_id,
    ownerName: row.owner_name ?? row.owner_email ?? null,
    clientId: row.client_id,
    clientCompany: row.client_company,
    steelTypes: STEEL_TYPE_SERIES_ORDER.filter((t) => byType[t] !== undefined),
    tons: round(tons),
    valueEur: round(valueEur, 2),
    valuePln: round(valueEur * rate, 2),
    byType,
    marginPct: marginTons > 0 ? round(marginWeighted / marginTons, 2) : null,
    basisDate,
    createdAt: row.created_date,
    sentAt: row.sent_date,
    decidedAt: row.decided_date,
  };
}

export function normalizeOffers(
  rows: AnalyticsOfferRow[],
  filters: AnalyticsFilters
): NormalizedOffer[] {
  const out: NormalizedOffer[] = [];
  for (const row of rows) {
    const normalized = normalizeOffer(row, filters);
    if (normalized) out.push(normalized);
  }
  return out;
}

/** Offers whose basis date falls inside [from, to]. Unbounded ends match everything. */
export function withinWindow(
  offers: NormalizedOffer[],
  from: string | null,
  to: string | null
): NormalizedOffer[] {
  return offers.filter((o) => {
    if (!o.basisDate) return from === null && to === null;
    if (from && o.basisDate < from) return false;
    if (to && o.basisDate > to) return false;
    return true;
  });
}

// --- KPI ------------------------------------------------------------------------------

const EMPTY_KPI: AnalyticsKpi = {
  offers: 0,
  tonsOffered: 0,
  valueOfferedEur: 0,
  valueOfferedPln: 0,
  tonsWon: 0,
  tonsLost: 0,
  tonsPending: 0,
  valueWonEur: 0,
  valueWonPln: 0,
  valueLostEur: 0,
  offersWon: 0,
  offersLost: 0,
  offersPending: 0,
  clients: 0,
  clientsWon: 0,
  winRateTons: null,
  winRateOffers: null,
  avgMarginPct: null,
  avgTonsPerOffer: null,
  avgValuePerOfferEur: null,
};

/** Share of `won` in the decided total, as a percentage. null while nothing is decided. */
function winRate(won: number, lost: number): number | null {
  const decided = won + lost;
  return decided > 0 ? round((won / decided) * 100, 1) : null;
}

export function computeKpi(offers: NormalizedOffer[]): AnalyticsKpi {
  if (offers.length === 0) return { ...EMPTY_KPI };

  const clients = new Set<number>();
  const clientsWon = new Set<number>();
  let tonsOffered = 0;
  let valueEur = 0;
  let valuePln = 0;
  let tonsWon = 0;
  let tonsLost = 0;
  let tonsPending = 0;
  let valueWonEur = 0;
  let valueWonPln = 0;
  let valueLostEur = 0;
  let offersWon = 0;
  let offersLost = 0;
  let offersPending = 0;
  let marginWeighted = 0;
  let marginTons = 0;

  for (const o of offers) {
    tonsOffered += o.tons;
    valueEur += o.valueEur;
    valuePln += o.valuePln;
    if (o.clientId !== null) clients.add(o.clientId);

    if (o.decision === 'won') {
      offersWon++;
      tonsWon += o.tons;
      valueWonEur += o.valueEur;
      valueWonPln += o.valuePln;
      if (o.clientId !== null) clientsWon.add(o.clientId);
    } else if (o.decision === 'lost') {
      offersLost++;
      tonsLost += o.tons;
      valueLostEur += o.valueEur;
    } else {
      offersPending++;
      tonsPending += o.tons;
    }

    if (o.marginPct !== null && o.tons > 0) {
      marginWeighted += o.marginPct * o.tons;
      marginTons += o.tons;
    }
  }

  return {
    offers: offers.length,
    tonsOffered: round(tonsOffered),
    valueOfferedEur: round(valueEur, 2),
    valueOfferedPln: round(valuePln, 2),
    tonsWon: round(tonsWon),
    tonsLost: round(tonsLost),
    tonsPending: round(tonsPending),
    valueWonEur: round(valueWonEur, 2),
    valueWonPln: round(valueWonPln, 2),
    valueLostEur: round(valueLostEur, 2),
    offersWon,
    offersLost,
    offersPending,
    clients: clients.size,
    clientsWon: clientsWon.size,
    winRateTons: winRate(tonsWon, tonsLost),
    winRateOffers: winRate(offersWon, offersLost),
    avgMarginPct: marginTons > 0 ? round(marginWeighted / marginTons, 2) : null,
    avgTonsPerOffer: round(tonsOffered / offers.length),
    avgValuePerOfferEur: round(valueEur / offers.length, 2),
  };
}
