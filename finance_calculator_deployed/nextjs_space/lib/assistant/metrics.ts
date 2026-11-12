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

import {
  OTHER_KEY,
  STEEL_TYPE_SERIES_ORDER,
  type AnalyticsFilters,
  type AnalyticsKpi,
  type ClientDecision,
  type DateBasis,
  type OfferStatus,
} from '../analytics';
import { computeKpi, computeLostReasons, normalizeOffers, withinWindow, type NormalizedOffer } from '../analyticsAggregate';
import { bucketStart } from '../analyticsPeriods';
import type { AnalyticsOfferRow, RowQueryWindow } from '../analyticsQuery';
import type { LostReasonDef } from '../lostReasons';
import { comparisonWindow, delta, incompleteChoices, type ComparisonChoice } from './compare';
import {
  formatCount, formatDateRange, formatMoney, formatNumber, formatPercent, formatTons, monthLabel, quarterLabel, type Lang,
} from './format';
import { resolvePeriod, type PeriodChoice, type ResolvedWindow } from './periods';

import {
  DEFAULT_PARAM_BASIS, MARGIN_METRICS, METRICS, TIME_GRANULARITY,
  type GroupDimension, type MetricDef, type MetricId, type MetricsFilters, type MetricsQuery, type Unit,
} from './metricCatalog';

export {
  GROUP_DIMENSIONS, METRICS, METRIC_IDS, metricsFiltersSchema, metricsQuerySchema,
  type GroupDimension, type MetricId, type MetricsFilters, type MetricsQuery,
} from './metricCatalog';

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
  tons: number;
  value_eur: number;
  value_pln: number;
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

export interface DeltaCell {
  metric: MetricId;
  /** current - previous, in the metric's unit (percentage points for % metrics). */
  delta_abs: number | null;
  delta_abs_pln?: number | null;
  /** Relative change in %, one decimal. null when the comparison value is not positive or missing. */
  delta_pct: number | null;
  /** Both changes formatted for the answer language - copy verbatim. */
  text: string;
}

export interface ComparisonSide {
  period: { from: string; to: string; label: string; in_progress: boolean };
  values: MetricCell[];
  coverage: BasisCoverage[];
  deltas: DeltaCell[];
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
  /** Present when `compare` was asked: the second window and the change per metric. */
  comparison?: ComparisonSide;
  /** The filters as applied, for the footer. */
  applied: { filters: MetricsFilters; userIds: number[] };
  /** Offers behind the figures, per basis - only with deps.includeOffers (Excel export). */
  offers?: { basis: DateBasis; offers: NormalizedOffer[] }[];
}

export type MetricsResult =
  | MetricsOk
  | { status: 'needs_clarification'; question: 'period'; options: PeriodChoice[] }
  | { status: 'needs_clarification'; question: 'comparison'; options: ComparisonChoice[] }
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
  /** Also return the offers behind the figures (the Excel export). */
  includeOffers?: boolean;
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

interface WindowRun {
  slices: Map<DateBasis, Slice>;
  values: MetricCell[];
  coverage: BasisCoverage[];
}

/** Every metric of the query over one window: one engine run per date basis involved. */
async function runWindow(
  query: MetricsQuery,
  metrics: MetricId[],
  window: { from: string | null; to: string | null },
  userIds: number[],
  deps: MetricsDeps
): Promise<WindowRun> {
  const f = query.filters ?? {};
  // "ile wysłaliśmy i ile wygraliśmy" mixes two bases - each metric runs on its own date.
  const slices = new Map<DateBasis, Slice>();
  for (const basis of uniq(metrics.map((m) => basisOf(m, query.basis)))) {
    const filters: AnalyticsFilters = {
      dateFrom: window.from ?? '',
      dateTo: window.to ?? '',
      basis,
      granularity: 'month',
      userIds,
      steelTypes: f.steel_types ?? [],
      statuses: f.status ?? [],
      decisions: f.decision ?? [],
      clientIds: f.clients ?? [],
    };
    const rows = await deps.fetchRows(filters, { from: window.from, to: window.to });
    slices.set(basis, { basis, filters, rows, offers: withinWindow(normalizeOffers(rows, filters), window.from, window.to) });
  }

  const kpis = new Map<DateBasis, AnalyticsKpi>();
  for (const [basis, slice] of slices) kpis.set(basis, computeKpi(slice.offers));

  const values = metrics
    .filter((m) => METRICS[m].unit !== 'table')
    .map((m) => {
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
  return { slices, values, coverage };
}

// A change is stated with the precision of the metric itself.
const DELTA_DECIMALS: Record<Unit, number> = { count: 0, tons: 3, money: 2, money_eur: 2, percent1: 1, percent2: 2, table: 0 };
const NO_BASE: Record<Lang, string> = { pl: 'brak zmiany % (wartość porównawcza nie jest dodatnia)', en: 'no % change (comparison value is not positive)' };
const PP: Record<Lang, string> = { pl: 'p.p.', en: 'pp' };

const signed = (text: string, value: number) => (value > 0 ? `+${text}` : text);

function deltaCell(current: MetricCell, previous: MetricCell, lang: Lang): DeltaCell {
  const d: MetricDef = METRICS[current.metric];
  const decimals = DELTA_DECIMALS[d.unit];
  const { abs, pct } = delta(current.value, previous.value, decimals);
  if (abs === null) return { metric: current.metric, delta_abs: null, delta_pct: null, text: NO_DATA[lang] };

  let absText: string;
  let absPln: number | undefined;
  if (d.unit === 'money') {
    absPln = delta(current.value_pln ?? null, previous.value_pln ?? null, 2).abs ?? 0;
    absText = `${signed(formatMoney(abs, 'EUR', lang), abs)} (${signed(formatMoney(absPln, 'PLN', lang), absPln)})`;
  } else if (d.unit === 'percent1' || d.unit === 'percent2') {
    absText = `${signed(formatNumber(abs, decimals, lang), abs)} ${PP[lang]}`;
  } else {
    absText = signed(cellText(d.unit, abs, null, lang), abs);
  }
  const pctText = pct === null ? NO_BASE[lang] : signed(formatPercent(pct, 1, lang), pct);
  return {
    metric: current.metric,
    delta_abs: abs,
    ...(absPln !== undefined ? { delta_abs_pln: absPln } : {}),
    delta_pct: pct,
    text: `${absText}; ${pctText}`,
  };
}

/** The second window of a comparison, or the reason it cannot be computed (yet). */
async function runComparison(
  query: MetricsQuery,
  metrics: MetricId[],
  current: ResolvedWindow,
  currentValues: MetricCell[],
  userIds: number[],
  deps: MetricsDeps
): Promise<Exclude<MetricsResult, MetricsOk> | ComparisonSide> {
  const compare = query.compare!;
  if (query.group_by) {
    return { status: 'invalid', message: 'compare cannot be combined with group_by. Ask for the comparison and the breakdown separately.' };
  }
  if (metrics.includes('lost_reasons')) {
    return { status: 'invalid', message: 'compare cannot be combined with lost_reasons. Ask for the comparison and the lost reasons separately.' };
  }

  // D12: a running period is never compared silently - the user picks what it means.
  if (current.to !== null && current.to > deps.today) {
    const options = incompleteChoices(current, compare, deps.today, deps.lang);
    if (options.length > 0) return { status: 'needs_clarification', question: 'comparison', options };
  }

  const other = comparisonWindow(current, compare, deps.today, deps.lang);
  if (other.kind === 'invalid') return { status: 'invalid', message: other.message };
  if (other.kind === 'future') return { status: 'future_period', label: other.label };
  if (other.kind === 'clarify') return { status: 'invalid', message: 'The comparison period is ambiguous - pass it with a year.' };
  if (!other.from || !other.to) return { status: 'invalid', message: 'The comparison period must be bounded.' };
  if (other.to > deps.today) {
    return { status: 'invalid', message: 'The comparison period is still running. Put the running period in "period" and the finished one in "compare".' };
  }

  const run = await runWindow(query, metrics, other, userIds, deps);
  return {
    period: { from: other.from, to: other.to, label: other.label, in_progress: other.inProgress },
    values: run.values,
    coverage: run.coverage,
    deltas: currentValues.map((v, i) => deltaCell(v, run.values[i], deps.lang)),
  };
}

export async function runMetricsQuery(query: MetricsQuery, deps: MetricsDeps): Promise<MetricsResult> {
  const resolved = resolvePeriod(query.period, deps.today, deps.lang);
  if (resolved.kind === 'clarify') return { status: 'needs_clarification', question: 'period', options: resolved.options };
  if (resolved.kind === 'future') return { status: 'future_period', label: resolved.label };
  if (resolved.kind === 'invalid') return { status: 'invalid', message: resolved.message };

  const metrics = uniq(query.metrics);
  const f = query.filters ?? {};
  const userIds = uniq([...(f.people ?? []), ...(f.my_team ? [deps.selfId, ...deps.teamUserIds] : [])]);
  const scalar = metrics.filter((m) => METRICS[m].unit !== 'table');

  const run = await runWindow(query, metrics, resolved, userIds, deps);

  let comparison: ComparisonSide | undefined;
  if (query.compare) {
    const outcome = await runComparison(query, metrics, resolved, run.values, userIds, deps);
    if ('status' in outcome) return outcome;
    comparison = outcome;
  }

  const noOffers = (coverage: BasisCoverage[]) => coverage.every((c) => c.offers === 0);
  const result: MetricsOk = {
    status: 'ok',
    period: { from: resolved.from, to: resolved.to, label: resolved.label, in_progress: resolved.inProgress },
    // A comparison with an empty current window still has a figure to report.
    empty: noOffers(run.coverage) && (!comparison || noOffers(comparison.coverage)),
    values: run.values,
    coverage: run.coverage,
    ...(comparison ? { comparison } : {}),
    applied: { filters: f, userIds },
  };

  if (query.group_by && scalar.length > 0) {
    result.groups = buildGroups(query, scalar, run.slices, resolved, deps);
  }

  if (metrics.includes('lost_reasons')) {
    const reasons = await deps.loadLostReasons();
    const lang = deps.lang;
    result.lost_reasons = computeLostReasons(run.slices.get('decided')!.offers, reasons)
      // The answer ranks by count; the panel keeps the admin's list order.
      .sort((a, b) => b.offers - a.offers)
      .map((r) => ({
        reason: r.reason,
        label: r.labels[lang] || r.labels.pl || r.reason,
        archived: r.archived,
        offers: r.offers,
        tons: r.tonsLost,
        value_eur: r.valueLostEur,
        value_pln: r.valueLostPln,
        tons_text: formatTons(r.tonsLost, lang),
        value_text: `${formatMoney(r.valueLostEur, 'EUR', lang)} (${formatMoney(r.valueLostPln, 'PLN', lang)})`,
        share_text: formatPercent(r.sharePct, 1, lang),
        share_pct: r.sharePct,
      }));
  }

  if (deps.includeOffers) {
    result.offers = [...run.slices.values()].map((slice) => ({ basis: slice.basis, offers: slice.offers }));
  }

  return result;
}
