// The assistant's metric catalog and the one function that answers aggregate questions
// (docs/ai-assistant-plan.md section 3: the accuracy contract).
//
// Rules this file enforces in code:
//   - the model can only ask for metrics by ID from METRICS; each has ONE definition and date basis,
//   - every figure comes out of the analytics engine (normalizeOffers -> computeKpi /
//     computeLostReasons), the same reduction /analytics draws - the two can never disagree,
//   - all formatting happens here; the model copies `text` verbatim and never does arithmetic.
//
// No database access: the rows arrive through MetricsDeps, so the catalog is unit-testable and
// the tool wrapper (tools/queryMetrics.ts) owns visibility and the clock.

import { z } from 'zod';
import {
  CLIENT_DECISIONS,
  DATE_BASES,
  OFFER_STATUSES,
  OTHER_KEY,
  STEEL_TYPE_SERIES_ORDER,
  type AnalyticsFilters,
  type AnalyticsKpi,
  type ClientDecision,
  type DateBasis,
  type Granularity,
  type OfferStatus,
} from '../analytics';
import { computeKpi, computeLostReasons, normalizeOffers, withinWindow, type NormalizedOffer } from '../analyticsAggregate';
import { bucketStart } from '../analyticsPeriods';
import type { AnalyticsOfferRow, RowQueryWindow } from '../analyticsQuery';
import type { SteelType } from '../calculatorData';
import type { LostReasonDef } from '../lostReasons';
import {
  formatCount, formatDateRange, formatMoney, formatPercent, formatTons, monthLabel, quarterLabel, type Lang,
} from './format';
import { periodInputSchema, resolvePeriod, type PeriodChoice, type ResolvedWindow } from './periods';

// --- catalog --------------------------------------------------------------------------

type Unit = 'count' | 'tons' | 'money' | 'money_eur' | 'percent1' | 'percent2' | 'table';

interface MetricDef {
  /** Fixed date basis, or 'param' when the question's verb decides (plan 3.2). */
  basis: DateBasis | 'param';
  unit: Unit;
  label: Record<Lang, string>;
  /** One-sentence definition for the server-written footer. */
  definition: Record<Lang, string>;
  pick: (kpi: AnalyticsKpi) => { value: number | null; valuePln?: number | null };
}

const def = (
  basis: MetricDef['basis'],
  unit: Unit,
  label: [string, string],
  definition: [string, string],
  pick: MetricDef['pick']
): MetricDef => ({ basis, unit, label: { pl: label[0], en: label[1] }, definition: { pl: definition[0], en: definition[1] }, pick });

export const METRICS = {
  offers_created: def('created', 'count', ['Utworzone oferty', 'Offers created'],
    ['oferty wg daty utworzenia (najnowsza wersja)', 'offers by creation date (latest version)'], (k) => ({ value: k.offers })),
  offers_sent: def('sent', 'count', ['Wysłane oferty', 'Offers sent'],
    ['oferty wysłane do klienta, wg daty wysłania', 'offers sent to the client, by sent date'], (k) => ({ value: k.offers })),
  offers_won: def('decided', 'count', ['Wygrane oferty', 'Offers won'],
    ['oferty wygrane, wg daty decyzji klienta', 'offers won, by client decision date'], (k) => ({ value: k.offersWon })),
  offers_lost: def('decided', 'count', ['Przegrane oferty', 'Offers lost'],
    ['oferty przegrane, wg daty decyzji klienta', 'offers lost, by client decision date'], (k) => ({ value: k.offersLost })),
  offers_pending: def('created', 'count', ['Oferty bez decyzji', 'Offers without a decision'],
    ['oferty bez decyzji klienta (także jeszcze niewysłane), wg daty utworzenia', 'offers with no client decision yet (incl. not yet sent), by creation date'],
    (k) => ({ value: k.offersPending })),
  tons_offered: def('param', 'tons', ['Tonaż ofert', 'Tons offered'],
    ['suma ton z ofert', 'total tonnage of offers'], (k) => ({ value: k.tonsOffered })),
  tons_won: def('decided', 'tons', ['Sprzedany tonaż', 'Tons won'],
    ['tonaż ofert wygranych ("sprzedane"), wg daty decyzji klienta', 'tonnage of won offers ("sold"), by client decision date'], (k) => ({ value: k.tonsWon })),
  tons_lost: def('decided', 'tons', ['Przegrany tonaż', 'Tons lost'],
    ['tonaż ofert przegranych, wg daty decyzji klienta', 'tonnage of lost offers, by client decision date'], (k) => ({ value: k.tonsLost })),
  value_offered: def('param', 'money', ['Wartość ofert', 'Value offered'],
    ['wartość ofert; EUR to źródło, PLN wg zamrożonego kursu każdej oferty', "value of offers; EUR is the source, PLN by each offer's frozen rate"],
    (k) => ({ value: k.valueOfferedEur, valuePln: k.valueOfferedPln })),
  value_won: def('decided', 'money', ['Wartość sprzedaży', 'Value won'],
    ['wartość ofert wygranych, wg daty decyzji klienta; PLN wg zamrożonego kursu oferty', "value of won offers, by client decision date; PLN by the offer's frozen rate"],
    (k) => ({ value: k.valueWonEur, valuePln: k.valueWonPln })),
  value_lost: def('decided', 'money', ['Wartość przegranych ofert', 'Value lost'],
    ['wartość ofert przegranych, wg daty decyzji klienta; PLN wg zamrożonego kursu oferty', "value of lost offers, by client decision date; PLN by the offer's frozen rate"],
    (k) => ({ value: k.valueLostEur, valuePln: k.valueLostPln })),
  clients_offered: def('param', 'count', ['Klienci z ofertą', 'Clients offered'],
    ['liczba różnych klientów z co najmniej jedną ofertą', 'distinct clients with at least one offer'], (k) => ({ value: k.clients })),
  clients_won: def('decided', 'count', ['Klienci z wygraną ofertą', 'Clients won'],
    ['liczba różnych klientów z wygraną ofertą, wg daty decyzji', 'distinct clients with a won offer, by decision date'], (k) => ({ value: k.clientsWon })),
  clients_lost: def('decided', 'count', ['Klienci z przegraną ofertą', 'Clients lost'],
    ['liczba różnych klientów z przegraną ofertą, wg daty decyzji', 'distinct clients with a lost offer, by decision date'], (k) => ({ value: k.clientsLost })),
  win_rate_offers: def('decided', 'percent1', ['Skuteczność (oferty)', 'Win rate (offers)'],
    ['wygrane / (wygrane + przegrane) oferty, wg daty decyzji', 'won / (won + lost) offers, by decision date'], (k) => ({ value: k.winRateOffers })),
  win_rate_tons: def('decided', 'percent1', ['Skuteczność (tony)', 'Win rate (tons)'],
    ['wygrane / (wygrane + przegrane) tony, wg daty decyzji', 'won / (won + lost) tons, by decision date'], (k) => ({ value: k.winRateTons })),
  margin_weighted: def('param', 'percent2', ['Marża ważona tonażem', 'Tonnage-weighted margin'],
    ['średnia marża ważona tonażem (jak w panelu analizy)', 'tonnage-weighted average margin (as in the analytics panel)'], (k) => ({ value: k.avgMarginPct })),
  margin_simple: def('param', 'percent2', ['Marża średnia na ofertę', 'Simple average margin'],
    ['zwykła średnia marż ofert (każda oferta waży tyle samo)', 'plain average of per-offer margins (every offer weighs the same)'],
    (k) => ({ value: k.avgMarginSimplePct })),
  avg_tons_per_offer: def('param', 'tons', ['Średni tonaż oferty', 'Average tons per offer'],
    ['tonaż ofert / liczba ofert', 'tonnage of offers / number of offers'], (k) => ({ value: k.avgTonsPerOffer })),
  avg_value_per_offer: def('param', 'money_eur', ['Średnia wartość oferty', 'Average value per offer'],
    ['wartość ofert w EUR / liczba ofert', 'value of offers in EUR / number of offers'], (k) => ({ value: k.avgValuePerOfferEur })),
  lost_reasons: def('decided', 'table', ['Powody przegranej', 'Lost reasons'],
    ['przegrane oferty wg powodu z listy aplikacji, udział = % przegranych ofert', "lost offers by the reason from the app's list, share = % of lost offers"],
    () => ({ value: null })),
} as const satisfies Record<string, MetricDef>;

export type MetricId = keyof typeof METRICS;
export const METRIC_IDS = Object.keys(METRICS) as [MetricId, ...MetricId[]];

const MARGIN_METRICS: readonly MetricId[] = ['margin_weighted', 'margin_simple'];
/** Basis of a 'param' metric when the model gives none: the offer went out to a client. */
const DEFAULT_PARAM_BASIS: DateBasis = 'sent';

// --- query schema ---------------------------------------------------------------------

export const GROUP_DIMENSIONS = ['person', 'client', 'steel_type', 'status', 'decision', 'month', 'week', 'quarter'] as const;
export type GroupDimension = (typeof GROUP_DIMENSIONS)[number];

const TIME_GRANULARITY: Partial<Record<GroupDimension, Granularity>> = { month: 'month', week: 'week', quarter: 'quarter' };

const idList = z.array(z.number().int().positive()).max(50);

export const metricsFiltersSchema = z
  .object({
    people: idList.optional(),
    /** The asking user plus everyone sharing a team with them. */
    my_team: z.boolean().optional(),
    clients: idList.optional(),
    steel_types: z.array(z.enum(STEEL_TYPE_SERIES_ORDER as [SteelType, ...SteelType[]])).optional(),
    status: z.array(z.enum(OFFER_STATUSES as [OfferStatus, ...OfferStatus[]])).optional(),
    decision: z.array(z.enum(CLIENT_DECISIONS as [ClientDecision, ...ClientDecision[]])).optional(),
  })
  .strict();

export type MetricsFilters = z.infer<typeof metricsFiltersSchema>;

export const metricsQuerySchema = z
  .object({
    metrics: z.array(z.enum(METRIC_IDS)).min(1).max(8),
    period: periodInputSchema,
    basis: z.enum(DATE_BASES as [DateBasis, ...DateBasis[]]).optional(),
    filters: metricsFiltersSchema.optional(),
    group_by: z.enum(GROUP_DIMENSIONS).optional(),
    sort: z.enum(['desc', 'asc']).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export type MetricsQuery = z.infer<typeof metricsQuerySchema>;

// --- result ---------------------------------------------------------------------------

export interface MetricCell {
  metric: MetricId;
  label: string;
  basis: DateBasis;
  /** Raw value (EUR for money). null = no data to compute it from. */
  value: number | null;
  value_pln?: number | null;
  /** The value formatted for the answer language - copy verbatim. */
  text: string;
}

export interface GroupRow {
  key: string;
  label: string;
  values: MetricCell[];
}

export interface LostReasonRow {
  reason: string;
  label: string;
  archived: boolean;
  offers: number;
  tons_text: string;
  value_text: string;
  share_text: string;
  share_pct: number;
}

export interface BasisCoverage {
  basis: DateBasis;
  /** Offers (latest version per family) the figures on this basis were computed from. */
  offers: number;
  /** Only when a margin metric was asked: offers that carry a margin / that do not. */
  offers_with_margin?: number;
  offers_without_margin?: number;
}

export interface MetricsOk {
  status: 'ok';
  period: { from: string | null; to: string | null; label: string; in_progress: boolean };
  /** true when no offer matched on any basis - say so, never guess. */
  empty: boolean;
  values: MetricCell[];
  groups?: {
    dimension: GroupDimension;
    sorted_by: MetricId | 'time';
    order: 'asc' | 'desc';
    total_groups: number;
    rows: GroupRow[];
  };
  lost_reasons?: LostReasonRow[];
  coverage: BasisCoverage[];
  /** The filters as applied, for the footer. */
  applied: { filters: MetricsFilters; userIds: number[] };
}

export type MetricsResult =
  | MetricsOk
  | { status: 'needs_clarification'; question: 'period'; options: PeriodChoice[] }
  | { status: 'future_period'; label: string }
  | { status: 'invalid'; message: string };

export interface MetricsDeps {
  /** YYYY-MM-DD "today" - the database clock in production, a fixed date in the eval. */
  today: string;
  lang: Lang;
  selfId: number;
  teamUserIds: readonly number[];
  /** Visibility-scoped rows (lib/analyticsQuery.fetchAnalyticsRows bound to the asking user). */
  fetchRows: (filters: AnalyticsFilters, window: RowQueryWindow) => Promise<AnalyticsOfferRow[]>;
  /** Admin-managed lost reasons, archived included. */
  loadLostReasons: () => Promise<readonly LostReasonDef[]>;
}

// --- formatting -----------------------------------------------------------------------

const NO_DATA: Record<Lang, string> = { pl: 'brak danych', en: 'no data' };

function cellText(unit: Unit, value: number | null, valuePln: number | null | undefined, lang: Lang): string {
  if (value === null) return NO_DATA[lang];
  switch (unit) {
    case 'count': return formatCount(value, lang);
    case 'tons': return formatTons(value, lang);
    case 'money': return `${formatMoney(value, 'EUR', lang)} (${formatMoney(valuePln ?? 0, 'PLN', lang)})`;
    case 'money_eur': return formatMoney(value, 'EUR', lang);
    case 'percent1': return formatPercent(value, 1, lang);
    case 'percent2': return formatPercent(value, 2, lang);
    case 'table': return '';
  }
}

export function basisOf(metric: MetricId, requested: DateBasis | undefined): DateBasis {
  const fixed = METRICS[metric].basis;
  return fixed === 'param' ? (requested ?? DEFAULT_PARAM_BASIS) : fixed;
}

function cell(metric: MetricId, basis: DateBasis, kpi: AnalyticsKpi, lang: Lang): MetricCell {
  const d: MetricDef = METRICS[metric];
  const { value, valuePln } = d.pick(kpi);
  const out: MetricCell = { metric, label: d.label[lang], basis, value, text: cellText(d.unit, value, valuePln, lang) };
  return d.unit === 'money' ? { ...out, value_pln: valuePln ?? null } : out;
}

const STATUS_LABELS: Record<Lang, Record<OfferStatus, string>> = {
  pl: { draft: 'szkic', pending_review: 'czeka na akceptację', approved: 'zatwierdzona', rejected: 'odrzucona', sent: 'wysłana' },
  en: { draft: 'draft', pending_review: 'pending review', approved: 'approved', rejected: 'rejected', sent: 'sent' },
};
const DECISION_LABELS: Record<Lang, Record<ClientDecision, string>> = {
  pl: { pending: 'bez decyzji', won: 'wygrana', lost: 'przegrana' },
  en: { pending: 'no decision', won: 'won', lost: 'lost' },
};
const UNASSIGNED: Record<Lang, string> = { pl: '(brak)', en: '(none)' };

// --- engine ---------------------------------------------------------------------------

interface Slice {
  basis: DateBasis;
  filters: AnalyticsFilters;
  rows: AnalyticsOfferRow[];
  offers: NormalizedOffer[];
}

interface Part {
  label: string;
  offers: NormalizedOffer[];
}

function timeLabel(bucket: string, dimension: GroupDimension, lang: Lang): string {
  const year = Number(bucket.slice(0, 4));
  const month = Number(bucket.slice(5, 7));
  if (dimension === 'month') return monthLabel(year, month, lang);
  if (dimension === 'quarter') return quarterLabel(year, Math.floor((month - 1) / 3) + 1, lang);
  const end = new Date(Date.UTC(year, month - 1, Number(bucket.slice(8, 10)) + 6)).toISOString().slice(0, 10);
  return formatDateRange(bucket, end, lang);
}

/** One slice split along a dimension. Steel type re-runs the engine's item-level filter per type. */
function partition(slice: Slice, dimension: GroupDimension, window: ResolvedWindow, lang: Lang): Map<string, Part> {
  const parts = new Map<string, Part>();

  if (dimension === 'steel_type') {
    const types = slice.filters.steelTypes.length > 0 ? slice.filters.steelTypes : STEEL_TYPE_SERIES_ORDER;
    for (const type of types) {
      // Exactly what a steel-type filter does on /analytics: the offer stays, only its
      // matching line items count - a mixed HRS + HDG offer is never double-counted in tons.
      const narrowed = { ...slice.filters, steelTypes: [type] };
      const offers = withinWindow(normalizeOffers(slice.rows, narrowed), window.from, window.to);
      if (offers.length > 0) parts.set(type, { label: type, offers });
    }
    return parts;
  }

  const granularity = TIME_GRANULARITY[dimension];
  for (const offer of slice.offers) {
    let key: string;
    let label: string;
    if (granularity) {
      if (!offer.basisDate) continue;
      key = bucketStart(offer.basisDate, granularity);
      label = timeLabel(key, dimension, lang);
    } else if (dimension === 'person') {
      key = offer.userId === null ? OTHER_KEY : String(offer.userId);
      label = offer.ownerName ?? UNASSIGNED[lang];
    } else if (dimension === 'client') {
      key = offer.clientId === null ? OTHER_KEY : String(offer.clientId);
      label = offer.clientCompany ?? UNASSIGNED[lang];
    } else if (dimension === 'status') {
      key = offer.status;
      label = STATUS_LABELS[lang][offer.status];
    } else {
      key = offer.decision;
      label = DECISION_LABELS[lang][offer.decision];
    }
    const part = parts.get(key);
    if (part) part.offers.push(offer);
    else parts.set(key, { label, offers: [offer] });
  }
  return parts;
}

const DEFAULT_GROUP_LIMIT = 10;

function buildGroups(
  query: MetricsQuery,
  metrics: MetricId[],
  slices: Map<DateBasis, Slice>,
  window: ResolvedWindow,
  deps: MetricsDeps
): NonNullable<MetricsOk['groups']> {
  const dimension = query.group_by!;
  const perBasis = new Map<DateBasis, Map<string, Part>>();
  const labels = new Map<string, string>();
  for (const [basis, slice] of slices) {
    const parts = partition(slice, dimension, window, deps.lang);
    perBasis.set(basis, parts);
    for (const [key, part] of parts) labels.set(key, part.label);
  }

  const rows: GroupRow[] = [...labels.entries()].map(([key, label]) => ({
    key,
    label,
    values: metrics.map((metric) => {
      const basis = basisOf(metric, query.basis);
      return cell(metric, basis, computeKpi(perBasis.get(basis)?.get(key)?.offers ?? []), deps.lang);
    }),
  }));

  // A time breakdown reads chronologically unless a ranking was asked for explicitly.
  const chronological = TIME_GRANULARITY[dimension] !== undefined && query.sort === undefined;
  const order = query.sort ?? (chronological ? 'asc' : 'desc');
  const sign = order === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    if (chronological) return a.key < b.key ? -1 : 1;
    const av = a.values[0]?.value ?? null;
    const bv = b.values[0]?.value ?? null;
    // Groups with nothing to compute go last whatever the direction.
    if (av === null || bv === null) return av === bv ? a.label.localeCompare(b.label, 'pl') : av === null ? 1 : -1;
    return (av - bv) * sign || a.label.localeCompare(b.label, 'pl');
  });

  return {
    dimension,
    sorted_by: chronological ? 'time' : metrics[0],
    order,
    total_groups: sorted.length,
    rows: sorted.slice(0, query.limit ?? (chronological ? 50 : DEFAULT_GROUP_LIMIT)),
  };
}

function uniq<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

export async function runMetricsQuery(query: MetricsQuery, deps: MetricsDeps): Promise<MetricsResult> {
  const resolved = resolvePeriod(query.period, deps.today, deps.lang);
  if (resolved.kind === 'clarify') return { status: 'needs_clarification', question: 'period', options: resolved.options };
  if (resolved.kind === 'future') return { status: 'future_period', label: resolved.label };
  if (resolved.kind === 'invalid') return { status: 'invalid', message: resolved.message };

  const metrics = uniq(query.metrics);
  const f = query.filters ?? {};
  const userIds = uniq([...(f.people ?? []), ...(f.my_team ? [deps.selfId, ...deps.teamUserIds] : [])]);

  // One engine run per date basis involved: "ile wysłaliśmy i ile wygraliśmy" mixes two.
  const slices = new Map<DateBasis, Slice>();
  for (const basis of uniq(metrics.map((m) => basisOf(m, query.basis)))) {
    const filters: AnalyticsFilters = {
      dateFrom: resolved.from ?? '',
      dateTo: resolved.to ?? '',
      basis,
      granularity: 'month',
      userIds,
      steelTypes: f.steel_types ?? [],
      statuses: f.status ?? [],
      decisions: f.decision ?? [],
      clientIds: f.clients ?? [],
    };
    const rows = await deps.fetchRows(filters, { from: resolved.from, to: resolved.to });
    slices.set(basis, { basis, filters, rows, offers: withinWindow(normalizeOffers(rows, filters), resolved.from, resolved.to) });
  }

  const kpis = new Map<DateBasis, AnalyticsKpi>();
  for (const [basis, slice] of slices) kpis.set(basis, computeKpi(slice.offers));

  const scalar = metrics.filter((m) => METRICS[m].unit !== 'table');
  const values = scalar.map((m) => {
    const basis = basisOf(m, query.basis);
    return cell(m, basis, kpis.get(basis)!, deps.lang);
  });

  const wantsMargin = metrics.some((m) => MARGIN_METRICS.includes(m));
  const marginBasis = wantsMargin ? basisOf('margin_weighted', query.basis) : null;
  const coverage: BasisCoverage[] = [...kpis.entries()].map(([basis, kpi]) =>
    basis === marginBasis
      ? { basis, offers: kpi.offers, offers_with_margin: kpi.offersWithMargin, offers_without_margin: kpi.offers - kpi.offersWithMargin }
      : { basis, offers: kpi.offers }
  );

  const result: MetricsOk = {
    status: 'ok',
    period: { from: resolved.from, to: resolved.to, label: resolved.label, in_progress: resolved.inProgress },
    empty: coverage.every((c) => c.offers === 0),
    values,
    coverage,
    applied: { filters: f, userIds },
  };

  if (query.group_by && scalar.length > 0) {
    result.groups = buildGroups(query, scalar, slices, resolved, deps);
  }

  if (metrics.includes('lost_reasons')) {
    const reasons = await deps.loadLostReasons();
    const lang = deps.lang;
    result.lost_reasons = computeLostReasons(slices.get('decided')!.offers, reasons)
      // The answer ranks by count; the panel keeps the admin's list order.
      .sort((a, b) => b.offers - a.offers)
      .map((r) => ({
        reason: r.reason,
        label: r.labels[lang] || r.labels.pl || r.reason,
        archived: r.archived,
        offers: r.offers,
        tons_text: formatTons(r.tonsLost, lang),
        value_text: `${formatMoney(r.valueLostEur, 'EUR', lang)} (${formatMoney(r.valueLostPln, 'PLN', lang)})`,
        share_text: formatPercent(r.sharePct, 1, lang),
        share_pct: r.sharePct,
      }));
  }

  return result;
}
