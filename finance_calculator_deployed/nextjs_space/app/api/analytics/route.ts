import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
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
  type AnalyticsPayload,
  type Dimension,
} from '@/lib/analytics';
import {
  PERIOD_PRESETS,
  fitGranularity,
  previousPeriod,
  resolvePreset,
  suggestGranularity,
  type PeriodPreset,
  type ResolvedPeriod,
} from '@/lib/analyticsPeriods';
import { fetchAnalyticsRows, fetchFacets, fetchToday } from '@/lib/analyticsQuery';
import { computeKpi, normalizeOffers, withinWindow } from '@/lib/analyticsAggregate';
import { buildSeries, groupBy, splitKeysFrom } from '@/lib/analyticsSeries';
import type { SteelType } from '@/lib/calculatorData';

// GET - everything the analytics panel draws, for the period and filters in the query string.
//
// Scope follows the role: a junior gets their own offers, a senior gets their own plus every
// team member's (migration 019), an admin gets the whole company. The `users` parameter is
// ignored for a junior; for a senior it can only narrow within the team; for an admin it can
// pick anyone. The decision is made server-side in visibilityClause (lib/analyticsQuery.ts),
// never trusted from the client.
//
// Query parameters (all optional):
//   preset      one of PERIOD_PRESETS, default last90. 'custom' uses from/to verbatim.
//   from, to    YYYY-MM-DD, inclusive. Only read when preset=custom.
//   basis       created | sent | decided        - which date the window applies to
//   granularity day | week | month | quarter | year, default: fitted to the window length
//   split       a dimension, or none            - extra per-series breakdown of the timeline
//   users       comma-separated user ids        - admin: anyone; senior: own team only
//   types       comma-separated steel types     - narrows LINE ITEMS, not whole offers
//   statuses    comma-separated offer statuses
//   decisions   comma-separated client decisions
//   clients     comma-separated client ids
export async function GET(request: NextRequest) {
  const auth = await requireRole(['junior', 'senior', 'admin']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  try {
    const sp = request.nextUrl.searchParams;
    const preset = parseEnum<PeriodPreset>(sp.get('preset'), PERIOD_PRESETS, 'last90');
    const basis = parseEnum(sp.get('basis'), DATE_BASES, 'created');
    const split = parseEnum<Dimension | 'none'>(
      sp.get('split'),
      [...DIMENSIONS, 'none'] as const,
      'none'
    );

    // Today comes from the database so a preset resolves on the same clock the rows carry.
    const today = await fetchToday();

    // 'custom' is the only preset that reads from/to; anything invalid degrades to unbounded
    // rather than erroring, so a mistyped URL still renders a page.
    const rawFrom = sp.get('from');
    const rawTo = sp.get('to');
    const period: ResolvedPeriod =
      preset === 'custom'
        ? {
            from: isIsoDate(rawFrom) ? rawFrom : null,
            to: isIsoDate(rawTo) ? rawTo : null,
          }
        : resolvePreset(preset, today);

    // A reversed range is a slip, not an empty result - swap it instead of showing nothing.
    if (period.from && period.to && period.from > period.to) {
      const swapped = period.from;
      period.from = period.to;
      period.to = swapped;
    }

    // An explicit granularity is honoured, but only as far as it can be DRAWN: fitGranularity
    // coarsens it if the window would otherwise blow past the bucket cap and leave the chart
    // showing a different period than the totals above it. Absent one, the window length picks.
    const requested = GRANULARITIES.includes(
      (sp.get('granularity') ?? '') as (typeof GRANULARITIES)[number]
    )
      ? parseEnum(sp.get('granularity'), GRANULARITIES, 'month')
      : suggestGranularity(period.from, period.to);
    const granularity = fitGranularity(period.from, period.to, requested);

    const filters: AnalyticsFilters = {
      dateFrom: period.from ?? '',
      dateTo: period.to ?? '',
      basis,
      granularity,
      // A junior has nobody to filter by; a senior's list is clamped to their team inside
      // visibilityClause, so it is safe to parse the raw ids here for both senior and admin.
      userIds: session.role === 'junior' ? [] : parseIdList(sp.get('users')),
      steelTypes: parseEnumList<SteelType>(sp.get('types'), STEEL_TYPE_SERIES_ORDER),
      statuses: parseEnumList(sp.get('statuses'), OFFER_STATUSES),
      decisions: parseEnumList(sp.get('decisions'), CLIENT_DECISIONS),
      clientIds: parseIdList(sp.get('clients')),
    };

    const comparison = previousPeriod(period);

    // One round trip covers both windows: widen the query to the start of the comparison
    // period, then split the rows by date in memory.
    const rows = await fetchAnalyticsRows(session.role, session.userId, filters, {
      from: comparison.from ?? period.from,
      to: period.to,
    });

    const facets = await fetchFacets(session.role, session.userId);
    // A senior's facet list always contains at least themselves; more than one entry means they
    // have a team, which is what unlocks the salesperson controls for them.
    const canFilterSalespeople =
      session.role === 'admin' ||
      (session.role === 'senior' && facets.users.length > 1);
    const userLabels = new Map(facets.users.map((u) => [String(u.id), u.name]));
    const clientLabels = new Map(facets.clients.map((c) => [String(c.id), c.name]));

    const all = normalizeOffers(rows, filters);
    const current = withinWindow(all, period.from, period.to);
    const previous = comparison.from
      ? withinWindow(all, comparison.from, comparison.to)
      : null;

    // Dimensions with an inherent order keep it; open-ended ones are ranked and folded.
    const bySteelType = groupBy(current, 'steelType', {
      fixedOrder: STEEL_TYPE_SERIES_ORDER,
    });
    const byStatus = groupBy(current, 'status', { fixedOrder: OFFER_STATUSES });
    const byDecision = groupBy(current, 'decision', { fixedOrder: CLIENT_DECISIONS });
    const bySalesperson = groupBy(current, 'salesperson', {
      labels: userLabels,
      otherLabel: 'Other',
    });
    const byClient = groupBy(current, 'client', {
      labels: clientLabels,
      otherLabel: 'Other',
    });

    // The split reuses the matching breakdown, so a timeline series and the bar chart beside
    // it agree on both the set of series and their draw order.
    const splitGroups =
      split === 'steelType'
        ? bySteelType
        : split === 'status'
          ? byStatus
          : split === 'decision'
            ? byDecision
            : split === 'salesperson'
              ? bySalesperson
              : split === 'client'
                ? byClient
                : [];
    const splitKeys = splitKeysFrom(splitGroups);

    const series = buildSeries(current, period.from, period.to, granularity, {
      split,
      splitKeys: splitKeys.map((s) => s.key),
    });

    const payload: AnalyticsPayload = {
      scope: {
        role: session.role,
        userId: session.userId,
        canSeeAll: session.role === 'admin',
        canFilterSalespeople,
      },
      filters,
      period: { from: period.from, to: period.to },
      previousPeriod: comparison,
      kpi: computeKpi(current),
      previousKpi: previous ? computeKpi(previous) : null,
      series,
      split,
      splitKeys,
      bySteelType,
      byStatus,
      byDecision,
      bySalesperson,
      byClient,
      rows: current.map((o) => ({
        id: o.id,
        label: o.label,
        status: o.status,
        decision: o.decision,
        ownerName: o.ownerName,
        clientCompany: o.clientCompany,
        steelTypes: o.steelTypes,
        tons: o.tons,
        valueEur: o.valueEur,
        valuePln: o.valuePln,
        marginPct: o.marginPct,
        createdAt: o.createdAt ?? '',
        sentAt: o.sentAt,
        decidedAt: o.decidedAt,
      })),
      facets: {
        users: facets.users,
        clients: facets.clients,
        steelTypes: STEEL_TYPE_SERIES_ORDER,
      },
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error building analytics:', error);
    return NextResponse.json({ error: 'Failed to build analytics' }, { status: 500 });
  }
}
