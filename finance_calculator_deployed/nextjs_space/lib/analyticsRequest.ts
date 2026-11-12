// /api/analytics query string -> the filters the engine runs with.
//
// Extracted from app/api/analytics/route.ts so the assistant's deep-link parity test can run the
// panel's exact parsing: a link the assistant builds is turned into filters by this function and
// nothing else, which is what makes "click the link and you see the same numbers" provable.
//
// Pure: `today` is injected (the route passes the database clock).

import {
  CLIENT_DECISIONS,
  DATE_BASES,
  DIMENSIONS,
  GRANULARITIES,
  OFFER_STATUSES,
  STEEL_TYPE_SERIES_ORDER,
  isIsoDate,
  parseEnum,
  parseEnumList,
  parseIdList,
  type AnalyticsFilters,
  type Dimension,
} from './analytics';
import {
  PERIOD_PRESETS,
  fitGranularity,
  resolvePreset,
  suggestGranularity,
  type PeriodPreset,
  type ResolvedPeriod,
} from './analyticsPeriods';
import type { SteelType } from './calculatorData';

export interface AnalyticsRequest {
  period: ResolvedPeriod;
  filters: AnalyticsFilters;
  split: Dimension | 'none';
}

export function parseAnalyticsRequest(sp: Pick<URLSearchParams, 'get'>, today: string): AnalyticsRequest {
  const preset = parseEnum<PeriodPreset>(sp.get('preset'), PERIOD_PRESETS, 'last90');
  const basis = parseEnum(sp.get('basis'), DATE_BASES, 'created');
  const split = parseEnum<Dimension | 'none'>(sp.get('split'), [...DIMENSIONS, 'none'] as const, 'none');

  // 'custom' is the only preset that reads from/to; anything invalid degrades to unbounded
  // rather than erroring, so a mistyped URL still renders a page.
  const rawFrom = sp.get('from');
  const rawTo = sp.get('to');
  let period: ResolvedPeriod =
    preset === 'custom'
      ? { from: isIsoDate(rawFrom) ? rawFrom : null, to: isIsoDate(rawTo) ? rawTo : null }
      : resolvePreset(preset, today);

  // A reversed range is a slip, not an empty result - swap it instead of showing nothing.
  if (period.from && period.to && period.from > period.to) {
    period = { from: period.to, to: period.from };
  }

  // An explicit granularity is honoured, but only as far as it can be DRAWN: fitGranularity
  // coarsens it if the window would otherwise blow past the bucket cap and leave the chart
  // showing a different period than the totals above it. Absent one, the window length picks.
  const rawGranularity = sp.get('granularity') ?? '';
  const requested = (GRANULARITIES as string[]).includes(rawGranularity)
    ? parseEnum(rawGranularity, GRANULARITIES, 'month')
    : suggestGranularity(period.from, period.to);
  const granularity = fitGranularity(period.from, period.to, requested);

  const filters: AnalyticsFilters = {
    dateFrom: period.from ?? '',
    dateTo: period.to ?? '',
    basis,
    granularity,
    // The id list is ANDed onto the visibility predicate in visibilityClause, so it can only
    // narrow what the caller already sees - safe to parse the raw ids for everyone.
    userIds: parseIdList(sp.get('users')),
    steelTypes: parseEnumList<SteelType>(sp.get('types'), STEEL_TYPE_SERIES_ORDER),
    statuses: parseEnumList(sp.get('statuses'), OFFER_STATUSES),
    decisions: parseEnumList(sp.get('decisions'), CLIENT_DECISIONS),
    clientIds: parseIdList(sp.get('clients')),
  };

  return { period, filters, split };
}
