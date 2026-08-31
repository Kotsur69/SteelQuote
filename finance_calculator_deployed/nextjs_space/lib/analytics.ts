// Shared vocabulary of the analytics panel (app/analytics): the filter shape, the payload
// /api/analytics returns, and the enums both sides validate against.
//
// Imported by the browser too, so this file must stay free of `pg` and other server-only
// modules. The aggregation itself lives in lib/analyticsAggregate.ts.

import type { SteelType } from './calculatorData';

export type OfferStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'sent';
export type ClientDecision = 'pending' | 'won' | 'lost';

// Which date a row is bucketed on. An offer written in January and won in March belongs to
// a different bucket depending on the question being asked, so the reader picks:
//   created - when the offer was written (default; "what did I quote in Q1")
//   sent    - when it went to the client
//   decided - when the client answered ("what did I close in Q1")
export type DateBasis = 'created' | 'sent' | 'decided';

export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

// Dimension a breakdown or a split series is grouped by.
export type Dimension = 'steelType' | 'status' | 'decision' | 'salesperson' | 'client';

// Measure plotted on the (single) value axis. Never two of these on one chart - see the
// one-axis note in components/analytics/TimeSeriesPanel.tsx.
export type Measure = 'tons' | 'value' | 'offers' | 'clients' | 'marginPct';

export const OFFER_STATUSES: OfferStatus[] = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'sent',
];

export const CLIENT_DECISIONS: ClientDecision[] = ['pending', 'won', 'lost'];

export const DATE_BASES: DateBasis[] = ['created', 'sent', 'decided'];

export const GRANULARITIES: Granularity[] = ['day', 'week', 'month', 'quarter', 'year'];

export const DIMENSIONS: Dimension[] = [
  'steelType',
  'status',
  'decision',
  'salesperson',
  'client',
];

export const MEASURES: Measure[] = ['tons', 'value', 'offers', 'clients', 'marginPct'];

// Fixed order the steel types are drawn in. NOT the canonical business order (HRS first)
// but a colour-separation order: the app --accent-* hues double as the chart palette, and
// this permutation maximises the colour-blind deltaE between neighbouring series
// (10.6 -> 15.7) without touching a single hue, so a steel type keeps the exact colour it
// already has in the settings panel. See lib/chartColors.ts.
export const STEEL_TYPE_SERIES_ORDER: SteelType[] = [
  'PICKLED',
  'HRS',
  'TEARDROP',
  'CR',
  'HDG',
  'ZM',
];

// Categorical breakdowns fold into "Other" past this many entries instead of inventing new
// hues - a generated 8th colour is never distinguishable from the 7 before it.
export const MAX_CATEGORICAL_SERIES = 7;

/** Key of the synthetic bucket everything past MAX_CATEGORICAL_SERIES is folded into. */
export const OTHER_KEY = '__other__';

export interface AnalyticsFilters {
  /** Inclusive, YYYY-MM-DD. Empty string = unbounded on that end ("all time"). */
  dateFrom: string;
  dateTo: string;
  basis: DateBasis;
  granularity: Granularity;
  /** Salespeople to include. Empty = everyone the caller may see. Admin only. */
  userIds: number[];
  /** Empty = all. A non-empty filter narrows to MATCHING LINE ITEMS, not whole offers. */
  steelTypes: SteelType[];
  statuses: OfferStatus[];
  decisions: ClientDecision[];
  clientIds: number[];
}

export interface AnalyticsKpi {
  offers: number;
  tonsOffered: number;
  /** EUR is the single source of truth (lib/currency.ts). */
  valueOfferedEur: number;
  /** The same money converted with each offer's own frozen rate, then summed. */
  valueOfferedPln: number;
  tonsWon: number;
  tonsLost: number;
  tonsPending: number;
  valueWonEur: number;
  valueWonPln: number;
  valueLostEur: number;
  offersWon: number;
  offersLost: number;
  offersPending: number;
  /** Distinct clients with at least one offer in the period. */
  clients: number;
  /** Distinct clients with at least one WON offer in the period. */
  clientsWon: number;
  /** tonsWon / (tonsWon + tonsLost) * 100. null while nothing is decided yet. */
  winRateTons: number | null;
  /** offersWon / (offersWon + offersLost) * 100. null while nothing is decided yet. */
  winRateOffers: number | null;
  /** Tonnage-weighted average of the per-item margin %. null when no item carries one. */
  avgMarginPct: number | null;
  avgTonsPerOffer: number | null;
  avgValuePerOfferEur: number | null;
}

export interface AnalyticsBucket {
  /** Bucket start, YYYY-MM-DD. Ascending, gaps filled with zero rows. */
  bucket: string;
  offers: number;
  tonsOffered: number;
  tonsWon: number;
  tonsLost: number;
  tonsPending: number;
  valueOfferedEur: number;
  valueOfferedPln: number;
  valueWonEur: number;
  clients: number;
  avgMarginPct: number | null;
  winRateTons: number | null;
  /** Per-series values when a split dimension is requested; keyed by series key. */
  split: BucketSplit;
}

/**
 * A bucket's per-series values, kept for every switchable measure at once so the reader can
 * flip tons <-> value <-> offer count without another round trip. Margin % and client counts
 * are not splittable: a weighted average and a distinct count do not sum across series.
 */
export interface BucketSplit {
  tons: Record<string, number>;
  valueEur: Record<string, number>;
  valuePln: Record<string, number>;
  offers: Record<string, number>;
}

export interface AnalyticsGroup {
  /** Stable key (steel type, status, decision, user id, client id, or __other__). */
  key: string;
  /** Human label; the resolved name for salesperson/client, otherwise the key. */
  label: string;
  offers: number;
  tonsOffered: number;
  tonsWon: number;
  tonsLost: number;
  valueOfferedEur: number;
  valueOfferedPln: number;
  valueWonEur: number;
  clients: number;
  avgMarginPct: number | null;
  winRateTons: number | null;
}

/** One offer as the data table and the .xlsx export see it. */
export interface AnalyticsRow {
  id: number;
  label: string;
  status: OfferStatus;
  decision: ClientDecision;
  ownerName: string | null;
  clientCompany: string | null;
  steelTypes: SteelType[];
  tons: number;
  valueEur: number;
  valuePln: number;
  marginPct: number | null;
  createdAt: string;
  sentAt: string | null;
  decidedAt: string | null;
}

export interface AnalyticsFacets {
  users: { id: number; name: string }[];
  clients: { id: number; name: string }[];
  steelTypes: SteelType[];
}

export interface AnalyticsPayload {
  scope: {
    role: 'junior' | 'senior' | 'admin';
    userId: number;
    /** true for admin - the whole company, and the salesperson filter is live. */
    canSeeAll: boolean;
  };
  filters: AnalyticsFilters;
  /** The window actually queried, after preset expansion. null = unbounded. */
  period: { from: string | null; to: string | null };
  /** Equal-length window immediately before `period`, for the KPI deltas. */
  previousPeriod: { from: string | null; to: string | null };
  kpi: AnalyticsKpi;
  previousKpi: AnalyticsKpi | null;
  series: AnalyticsBucket[];
  /** The dimension `series[].split` is broken down by; 'none' when it is not split. */
  split: Dimension | 'none';
  /** Series keys present in series[].split, in draw order. */
  splitKeys: { key: string; label: string }[];
  bySteelType: AnalyticsGroup[];
  byStatus: AnalyticsGroup[];
  byDecision: AnalyticsGroup[];
  bySalesperson: AnalyticsGroup[];
  byClient: AnalyticsGroup[];
  rows: AnalyticsRow[];
  facets: AnalyticsFacets;
}

// --- parsing helpers (shared by the route and the query builder on the page) -----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

/** Keeps only members of `allowed` - sanitises every enum arriving from a query string. */
export function parseEnumList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const set = new Set<string>(allowed);
  const kept = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => set.has(s));
  return Array.from(new Set(kept)) as T[];
}

export function parseEnum<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  return (allowed as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback;
}

export function parseIdList(raw: string | null): number[] {
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  return Array.from(new Set(ids));
}
