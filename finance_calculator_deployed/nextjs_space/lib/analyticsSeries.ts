// Grouping and time bucketing for the analytics panel. Consumes the NormalizedOffer list
// from lib/analyticsAggregate.ts; every breakdown table, pie, bar and line on the page comes
// out of one of the two functions here.

import {
  MAX_CATEGORICAL_SERIES,
  OTHER_KEY,
  STEEL_TYPE_SERIES_ORDER,
  type AnalyticsBucket,
  type AnalyticsGroup,
  type BucketSplit,
  type Dimension,
  type Granularity,
} from './analytics';
import { computeKpi, round, type NormalizedOffer } from './analyticsAggregate';
import { bucketStart, enumerateBuckets } from './analyticsPeriods';

/** How one offer maps onto a dimension. Steel type is one-to-many, everything else is 1:1. */
function keysFor(offer: NormalizedOffer, dimension: Dimension): string[] {
  switch (dimension) {
    case 'steelType':
      return offer.steelTypes;
    case 'status':
      return [offer.status];
    case 'decision':
      return [offer.decision];
    case 'salesperson':
      return [offer.userId === null ? OTHER_KEY : String(offer.userId)];
    case 'client':
      return [offer.clientId === null ? OTHER_KEY : String(offer.clientId)];
  }
}

/**
 * The tonnage / money one offer contributes to one key of a dimension.
 *
 * For every dimension except steel type an offer belongs to exactly one key and contributes
 * all of itself. A mixed HRS + HDG offer instead contributes each type's OWN line-item
 * tonnage, taken from NormalizedOffer.byType, so the breakdown adds up to the total instead
 * of over-counting the offer once per type it happens to contain.
 *
 * The offer COUNT is the one figure that cannot be divided: such an offer counts as one under
 * HRS and one under HDG, so per-type offer counts can legitimately sum above the headline
 * total. Tonnage and value never do.
 */
function contribution(
  offer: NormalizedOffer,
  dimension: Dimension,
  key: string
): { tons: number; valueEur: number; valuePln: number; marginWeighted: number; marginTons: number } {
  if (dimension === 'steelType') {
    const totals = offer.byType[key as keyof typeof offer.byType];
    return {
      tons: totals?.tons ?? 0,
      valueEur: totals?.valueEur ?? 0,
      valuePln: totals?.valuePln ?? 0,
      marginWeighted: totals?.marginWeighted ?? 0,
      marginTons: totals?.marginTons ?? 0,
    };
  }
  return {
    tons: offer.tons,
    valueEur: offer.valueEur,
    valuePln: offer.valuePln,
    marginWeighted: offer.marginPct !== null ? offer.marginPct * offer.tons : 0,
    marginTons: offer.marginPct !== null ? offer.tons : 0,
  };
}

interface Accumulator {
  key: string;
  offers: number;
  tonsOffered: number;
  tonsWon: number;
  tonsLost: number;
  valueOfferedEur: number;
  valueOfferedPln: number;
  valueWonEur: number;
  clients: Set<number>;
  marginWeighted: number;
  marginTons: number;
}

function emptyAccumulator(key: string): Accumulator {
  return {
    key,
    offers: 0,
    tonsOffered: 0,
    tonsWon: 0,
    tonsLost: 0,
    valueOfferedEur: 0,
    valueOfferedPln: 0,
    valueWonEur: 0,
    clients: new Set<number>(),
    marginWeighted: 0,
    marginTons: 0,
  };
}

function accumulate(
  acc: Accumulator,
  offer: NormalizedOffer,
  part: ReturnType<typeof contribution>
): void {
  acc.offers += 1;
  acc.tonsOffered += part.tons;
  acc.valueOfferedEur += part.valueEur;
  acc.valueOfferedPln += part.valuePln;
  if (offer.clientId !== null) acc.clients.add(offer.clientId);
  if (offer.decision === 'won') {
    acc.tonsWon += part.tons;
    acc.valueWonEur += part.valueEur;
  } else if (offer.decision === 'lost') {
    acc.tonsLost += part.tons;
  }
  acc.marginWeighted += part.marginWeighted;
  acc.marginTons += part.marginTons;
}

function finalize(acc: Accumulator, label: string): AnalyticsGroup {
  const decided = acc.tonsWon + acc.tonsLost;
  return {
    key: acc.key,
    label,
    offers: acc.offers,
    tonsOffered: round(acc.tonsOffered),
    tonsWon: round(acc.tonsWon),
    tonsLost: round(acc.tonsLost),
    valueOfferedEur: round(acc.valueOfferedEur, 2),
    valueOfferedPln: round(acc.valueOfferedPln, 2),
    valueWonEur: round(acc.valueWonEur, 2),
    clients: acc.clients.size,
    avgMarginPct: acc.marginTons > 0 ? round(acc.marginWeighted / acc.marginTons, 2) : null,
    winRateTons: decided > 0 ? round((acc.tonsWon / decided) * 100, 1) : null,
  };
}

export interface GroupOptions {
  /** Resolves a key to a human label (salesperson / client names). Defaults to the key. */
  labels?: Map<string, string>;
  /** Label for the folded remainder. */
  otherLabel?: string;
  /**
   * Keep the natural order of the dimension (steel type, status, decision) instead of ranking
   * by size. Ranked dimensions (salespeople, clients) are the ones that get folded.
   */
  fixedOrder?: readonly string[];
  /** Fold everything past this many entries into OTHER_KEY. 0 disables folding. */
  limit?: number;
}

/**
 * Groups offers along one dimension.
 *
 * Dimensions with an inherent order (steel type, status, decision) keep it, so a series never
 * changes colour or position because the data moved. Open-ended dimensions (salespeople,
 * clients) are ranked by tonnage and everything past `limit` folds into a single "Other"
 * entry - an 8th generated hue would be indistinguishable from the 7 before it anyway.
 */
export function groupBy(
  offers: NormalizedOffer[],
  dimension: Dimension,
  options: GroupOptions = {}
): AnalyticsGroup[] {
  const accumulators = new Map<string, Accumulator>();

  for (const offer of offers) {
    for (const key of keysFor(offer, dimension)) {
      let acc = accumulators.get(key);
      if (!acc) {
        acc = emptyAccumulator(key);
        accumulators.set(key, acc);
      }
      accumulate(acc, offer, contribution(offer, dimension, key));
    }
  }

  const label = (key: string) =>
    key === OTHER_KEY
      ? (options.otherLabel ?? 'Other')
      : (options.labels?.get(key) ?? key);

  if (options.fixedOrder) {
    return options.fixedOrder
      .filter((key) => accumulators.has(key))
      .map((key) => finalize(accumulators.get(key)!, label(key)));
  }

  const ranked = Array.from(accumulators.values()).sort((a, b) => b.tonsOffered - a.tonsOffered);
  const limit = options.limit ?? MAX_CATEGORICAL_SERIES;
  if (limit <= 0 || ranked.length <= limit) {
    return ranked.map((acc) => finalize(acc, label(acc.key)));
  }

  const head = ranked.slice(0, limit);
  const tail = ranked.slice(limit);
  const other = emptyAccumulator(OTHER_KEY);
  for (const acc of tail) {
    other.offers += acc.offers;
    other.tonsOffered += acc.tonsOffered;
    other.tonsWon += acc.tonsWon;
    other.tonsLost += acc.tonsLost;
    other.valueOfferedEur += acc.valueOfferedEur;
    other.valueOfferedPln += acc.valueOfferedPln;
    other.valueWonEur += acc.valueWonEur;
    other.marginWeighted += acc.marginWeighted;
    other.marginTons += acc.marginTons;
    for (const id of acc.clients) other.clients.add(id);
  }

  return [
    ...head.map((acc) => finalize(acc, label(acc.key))),
    finalize(other, `${options.otherLabel ?? 'Other'} (${tail.length})`),
  ];
}

// --- time series ----------------------------------------------------------------------

function emptySplit(): BucketSplit {
  return { tons: {}, valueEur: {}, valuePln: {}, offers: {} };
}

function addSplit(split: BucketSplit, key: string, part: ReturnType<typeof contribution>): void {
  split.tons[key] = round((split.tons[key] ?? 0) + part.tons);
  split.valueEur[key] = round((split.valueEur[key] ?? 0) + part.valueEur, 2);
  split.valuePln[key] = round((split.valuePln[key] ?? 0) + part.valuePln, 2);
  split.offers[key] = (split.offers[key] ?? 0) + 1;
}

export interface SeriesOptions {
  /** Break each bucket down by this dimension as well. */
  split?: Dimension | 'none';
  /** Keys the split is restricted to, in draw order; anything else folds into OTHER_KEY. */
  splitKeys?: readonly string[];
}

/**
 * Offers bucketed over time at the requested granularity.
 *
 * Empty buckets are emitted as zero rows across the whole window: a line that simply skips
 * the quiet weeks draws a slope where there was a gap, which reads as steady activity that
 * never happened. `from`/`to` come from the resolved period, so the axis spans the period the
 * reader asked for rather than only the days that happen to hold data.
 */
export function buildSeries(
  offers: NormalizedOffer[],
  from: string | null,
  to: string | null,
  granularity: Granularity,
  options: SeriesOptions = {}
): AnalyticsBucket[] {
  const dated = offers.filter((o) => o.basisDate !== null);

  // With no explicit period, span the data itself.
  const dates = dated.map((o) => o.basisDate!).sort();
  const first = from ?? dates[0] ?? null;
  const last = to ?? dates[dates.length - 1] ?? null;
  if (!first || !last) return [];

  const split = options.split && options.split !== 'none' ? options.split : null;
  const allowed = options.splitKeys ? new Set(options.splitKeys) : null;

  const buckets = new Map<string, { offers: NormalizedOffer[]; split: BucketSplit }>();
  for (const key of enumerateBuckets(first, last, granularity)) {
    buckets.set(key, { offers: [], split: emptySplit() });
  }

  for (const offer of dated) {
    const key = bucketStart(offer.basisDate!, granularity);
    const bucket = buckets.get(key);
    // Outside the enumerated window (or past the bucket cap) - not this chart's business.
    if (!bucket) continue;
    bucket.offers.push(offer);

    if (split) {
      for (const rawKey of keysFor(offer, split)) {
        const seriesKey = allowed && !allowed.has(rawKey) ? OTHER_KEY : rawKey;
        addSplit(bucket.split, seriesKey, contribution(offer, split, rawKey));
      }
    }
  }

  return Array.from(buckets.entries()).map(([bucket, contents]) => {
    // The KPI reducer already knows how to turn a set of offers into these figures - reusing
    // it keeps a bucket's numbers identical to the headline numbers by construction.
    const kpi = computeKpi(contents.offers);
    return {
      bucket,
      offers: kpi.offers,
      tonsOffered: kpi.tonsOffered,
      tonsWon: kpi.tonsWon,
      tonsLost: kpi.tonsLost,
      tonsPending: kpi.tonsPending,
      valueOfferedEur: kpi.valueOfferedEur,
      valueOfferedPln: kpi.valueOfferedPln,
      valueWonEur: kpi.valueWonEur,
      clients: kpi.clients,
      avgMarginPct: kpi.avgMarginPct,
      winRateTons: kpi.winRateTons,
      split: contents.split,
    };
  });
}

/** Draw order for a split: the group ranking, so the biggest series is the first colour. */
export function splitKeysFrom(groups: AnalyticsGroup[]): { key: string; label: string }[] {
  return groups.map((g) => ({ key: g.key, label: g.label }));
}
