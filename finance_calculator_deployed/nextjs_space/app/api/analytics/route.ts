import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/access/context';
import { offerVisibilitySql } from '@/lib/access/scope';
import { OFFER_STATUSES, CLIENT_DECISIONS, STEEL_TYPE_SERIES_ORDER, type AnalyticsPayload } from '@/lib/analytics';
import { previousPeriod } from '@/lib/analyticsPeriods';
import { parseAnalyticsRequest } from '@/lib/analyticsRequest';
import { fetchAnalyticsRows, fetchFacets, fetchToday } from '@/lib/analyticsQuery';
import { computeKpi, computeLostReasons, normalizeOffers, withinWindow } from '@/lib/analyticsAggregate';
import { loadLostReasons } from '@/lib/lostReasonsDb';
import { buildSeries, groupBy, splitKeysFrom } from '@/lib/analyticsSeries';

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
  const auth = await requireAccess();
  if ('error' in auth) return auth.error;
  const session = auth.ctx;

  try {
    // Today comes from the database so a preset resolves on the same clock the rows carry.
    const today = await fetchToday();
    const { period, filters, split } = parseAnalyticsRequest(request.nextUrl.searchParams, today);

    const comparison = previousPeriod(period);

    // One round trip covers both windows: widen the query to the start of the comparison
    // period, then split the rows by date in memory.
    const rows = await fetchAnalyticsRows(session, filters, {
      from: comparison.from ?? period.from,
      to: period.to,
    });

    const facets = await fetchFacets(session);
    // The facet list always contains the caller; more than one entry means the visibility
    // scope covers other salespeople, which is what unlocks the salesperson controls.
    const canFilterSalespeople = facets.users.length > 1;
    const canSeeAll = offerVisibilitySql(session, []) === 'TRUE';
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

    const series = buildSeries(current, period.from, period.to, filters.granularity, {
      split,
      splitKeys: splitKeys.map((s) => s.key),
    });

    // Archived reasons included: they still explain past losses.
    const { reasons: lostReasons } = await loadLostReasons();

    const payload: AnalyticsPayload = {
      scope: {
        userId: session.userId,
        canSeeAll,
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
      byLostReason: computeLostReasons(current, lostReasons),
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
