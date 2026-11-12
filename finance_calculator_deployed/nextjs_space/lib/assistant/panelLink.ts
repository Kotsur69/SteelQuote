// "Otwórz panel analizy": the /analytics view behind a query_metrics answer
// (docs/ai-assistant-plan.md 6.1, D23).
//
// The link is built from the exact query the answer was computed with, through the panel's own
// URL schema (lib/analyticsUrlState.ts), so the two cannot drift. A metric the panel has no
// view for is never linked to a view that shows something else: it is listed as "not in the
// panel" instead (plan 6.1, point 6).

import type { ClientDecision, DateBasis, Dimension, Granularity, Measure } from '../analytics';
import { DEFAULT_URL_STATE, toSearch, type AnalyticsUrlState, type FocusSection } from '../analyticsUrlState';
import type { FooterLink } from './blocks';
import type { Lang } from './format';
import { METRICS, basisOf, type GroupDimension, type MetricId, type MetricsOk, type MetricsQuery } from './metrics';

/**
 * Where a metric shows on /analytics. `decision` = visible only once the page is narrowed to
 * that client decision (value of won offers = "value offered" of the won ones).
 */
interface PanelView {
  measure: Measure;
  decision?: ClientDecision;
}

export const PANEL_VIEW: Record<MetricId, PanelView | null> = {
  offers_created: { measure: 'offers' },
  offers_sent: { measure: 'offers' },
  offers_won: { measure: 'offers' },
  offers_lost: { measure: 'offers' },
  offers_pending: { measure: 'offers' },
  tons_offered: { measure: 'tons' },
  tons_won: { measure: 'tons' },
  tons_lost: { measure: 'tons' },
  value_offered: { measure: 'value' },
  value_won: { measure: 'value', decision: 'won' },
  value_lost: { measure: 'value', decision: 'lost' },
  clients_offered: { measure: 'clients' },
  clients_won: { measure: 'clients' },
  clients_lost: { measure: 'clients', decision: 'lost' },
  // The panel shows the win rate by tons only.
  win_rate_offers: null,
  win_rate_tons: { measure: 'tons' },
  margin_weighted: { measure: 'marginPct' },
  margin_simple: { measure: 'marginPct' },
  avg_tons_per_offer: { measure: 'tons' },
  avg_value_per_offer: null,
  lost_reasons: { measure: 'offers' },
};

/** Metrics about one client decision - a link or an offer list for them narrows to it. */
const DECISION_FAMILY: Partial<Record<MetricId, ClientDecision>> = {
  offers_won: 'won', tons_won: 'won', value_won: 'won', clients_won: 'won',
  offers_lost: 'lost', tons_lost: 'lost', value_lost: 'lost', clients_lost: 'lost', lost_reasons: 'lost',
};

/** The decision every metric is about, if they all agree on one. */
export function sharedDecision(metrics: readonly MetricId[]): ClientDecision | null {
  const decisions = new Set(metrics.map((m) => DECISION_FAMILY[m] ?? null));
  return decisions.size === 1 ? [...decisions][0] : null;
}

export const isLostMetric = (metric: MetricId): boolean => DECISION_FAMILY[metric] === 'lost';

/** The decision filter the answer's offers really have: the user's, else the metrics' family. */
export function effectiveDecisions(query: MetricsQuery, metrics: readonly MetricId[]): ClientDecision[] {
  const own = query.filters?.decision ?? [];
  if (own.length > 0) return own;
  const shared = sharedDecision(metrics);
  return shared ? [shared] : [];
}

const BREAKDOWN: Partial<Record<GroupDimension, Dimension>> = {
  person: 'salesperson', client: 'client', steel_type: 'steelType', status: 'status', decision: 'decision',
};
const TIME: Partial<Record<GroupDimension, Granularity>> = { week: 'week', month: 'month', quarter: 'quarter' };

const BASIS_SUFFIX: Record<Lang, Record<DateBasis, string>> = {
  pl: { created: 'wg daty utworzenia', sent: 'wg daty wysłania', decided: 'wg daty decyzji' },
  en: { created: 'by creation date', sent: 'by sent date', decided: 'by decision date' },
};
const OPEN: Record<Lang, string> = { pl: 'Otwórz panel analizy', en: 'Open the analytics panel' };

export interface PanelLinks {
  links: FooterLink[];
  /** Metrics the linked views show. */
  covered: MetricId[];
  /** Metrics the panel has no view for - said in the footer, never linked. */
  missing: MetricId[];
}

interface LinkWindow {
  from: string | null;
  to: string | null;
}

/** The panel state showing `metrics` on `basis` over `window`. */
export function panelState(query: MetricsQuery, result: MetricsOk, metrics: MetricId[], basis: DateBasis, window: LinkWindow): AnalyticsUrlState {
  const f = result.applied.filters;
  const group = query.group_by;
  const breakdown = group ? BREAKDOWN[group] : undefined;
  const granularity = group ? TIME[group] : undefined;
  const focus: FocusSection = metrics.includes('lost_reasons') ? 'lostReasons' : breakdown ? 'breakdown' : granularity ? 'timeline' : 'kpi';
  const bounded = window.from !== null && window.to !== null;

  return {
    ...DEFAULT_URL_STATE,
    preset: bounded ? 'custom' : 'all',
    from: bounded ? window.from! : '',
    to: bounded ? window.to! : '',
    basis,
    granularity: granularity ?? 'auto',
    users: result.applied.userIds.map(String),
    types: f.steel_types ?? [],
    statuses: f.status ?? [],
    decisions: effectiveDecisions(query, metrics),
    clients: (f.clients ?? []).map(String),
    measure: PANEL_VIEW[metrics[0]]?.measure ?? DEFAULT_URL_STATE.measure,
    breakdown: breakdown ?? DEFAULT_URL_STATE.breakdown,
    focus,
  };
}

/** True when the view for this metric shows exactly the figure of the answer. */
function inPanel(metric: MetricId, decisions: readonly ClientDecision[]): boolean {
  const view = PANEL_VIEW[metric];
  if (!view) return false;
  return !view.decision || (decisions.length === 1 && decisions[0] === view.decision);
}

export function buildPanelLinks(query: MetricsQuery, result: MetricsOk, lang: Lang): PanelLinks {
  const metrics = Array.from(new Set(query.metrics));
  const decisions = effectiveDecisions(query, metrics);
  const covered = metrics.filter((m) => inPanel(m, decisions));
  const missing = metrics.filter((m) => !covered.includes(m));
  if (covered.length === 0) return { links: [], covered, missing };

  // The panel shows one date basis at a time: one link per basis involved.
  const bases = Array.from(new Set(covered.map((m) => basisOf(m, query.basis))));
  const windows: (LinkWindow & { label: string | null })[] = result.comparison
    ? [
        { ...result.period },
        { ...result.comparison.period },
      ]
    : [{ from: result.period.from, to: result.period.to, label: null }];

  const links: FooterLink[] = [];
  for (const window of windows) {
    // A comparison gets one link per window (plan 6.1, point 4), on the first metric's basis.
    for (const basis of result.comparison ? bases.slice(0, 1) : bases) {
      const own = covered.filter((m) => basisOf(m, query.basis) === basis);
      const state = panelState(query, result, own, basis, window);
      const suffix = window.label ?? (bases.length > 1 ? BASIS_SUFFIX[lang][basis] : null);
      links.push({ kind: 'panel', label: suffix ? `${OPEN[lang]}: ${suffix}` : OPEN[lang], href: `/analytics?${toSearch(state)}` });
    }
  }
  return { links, covered, missing };
}

/** Footer note for metrics the panel cannot show, or null when every metric has a view. */
export function missingViewNote(missing: readonly MetricId[], lang: Lang): string | null {
  if (missing.length === 0) return null;
  const names = missing.map((m) => METRICS[m].label[lang]).join(', ');
  return lang === 'pl' ? `Brak widoku w panelu analizy dla: ${names}.` : `No view in the analytics panel for: ${names}.`;
}
