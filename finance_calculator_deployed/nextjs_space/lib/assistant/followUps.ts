// Proactive follow-ups after an aggregate answer (docs/ai-assistant-plan.md 6.2, D24).
//
// The SERVER decides what is suggested, from fixed rules over the query that was just run.
// Every chip is a fully specified tool call, so it can never lead to an invalid question, a view
// that does not exist, or something the user may not do - and the model cannot add chips at all.
//
// Pure: returns calls; the tool wrapper signs them (lib/assistant/tokens.ts).

import type { Lang } from './format';
import { comparisonWindow, type CompareInput } from './compare';
import type { ScopeKind } from './footer';
import { METRICS, type MetricId, type MetricsOk, type MetricsQuery } from './metrics';
import { effectiveDecisions, isLostMetric } from './panelLink';

export const MAX_CHIPS = 3;
/** "Pokaż te oferty" only while the list is short enough to read as cards. */
export const MAX_OFFERS_TO_LIST = 50;
const MAX_METRICS = 8;

export interface FollowUpCall {
  tool: 'query_metrics' | 'search_offers';
  input: Record<string, unknown>;
  /** What the chip says; also the text of the user's turn when clicked. */
  label: string;
}

const T = {
  pl: {
    question: 'Mogę też:',
    compareWith: (label: string) => `Porównaj z: ${label}`,
    comparePrevious: 'Porównaj z poprzednim okresem',
    compareLastYear: 'Porównaj z rokiem wcześniej',
    byPerson: 'Rozbij na handlowców',
    byClient: 'Rozbij na klientów',
    bySteel: 'Rozbij na typy stali',
    showOffers: 'Pokaż te oferty',
    lostReasons: 'Pokaż powody przegranej',
    without: (what: string) => `Bez filtra: ${what}`,
    filters: { people: 'handlowiec', clients: 'klient', steel_types: 'typ stali', status: 'status', decision: 'decyzja' },
  },
  en: {
    question: 'I can also:',
    compareWith: (label: string) => `Compare with ${label}`,
    comparePrevious: 'Compare with the previous period',
    compareLastYear: 'Compare with a year earlier',
    byPerson: 'Break down by salesperson',
    byClient: 'Break down by client',
    bySteel: 'Break down by steel type',
    showOffers: 'Show these offers',
    lostReasons: 'Show the lost reasons',
    without: (what: string) => `Without the filter: ${what}`,
    filters: { people: 'salesperson', clients: 'client', steel_types: 'steel type', status: 'status', decision: 'decision' },
  },
} as const;

export const followUpQuestion = (lang: Lang): string => T[lang].question;

export interface FollowUpContext {
  today: string;
  lang: Lang;
  scope: ScopeKind;
}

type FilterKey = keyof (typeof T)['pl']['filters'];
const FILTER_KEYS: FilterKey[] = ['people', 'clients', 'steel_types', 'status', 'decision'];

/** The query without compare / group_by / sort / limit: a plain total again. */
function plain(query: MetricsQuery): MetricsQuery {
  const { compare: _c, group_by: _g, sort: _s, limit: _l, ...rest } = query;
  return rest;
}

function compareChip(query: MetricsQuery, result: MetricsOk, kind: CompareInput, ctx: FollowUpContext): FollowUpCall | null {
  const { from, to, label } = result.period;
  if (!from || !to) return null;
  const t = T[ctx.lang];
  // A running period gets the generic label - the click leads to the D12 question.
  const other = to > ctx.today
    ? null
    : comparisonWindow({ kind: 'resolved', from, to, label, inProgress: result.period.in_progress }, kind, ctx.today, ctx.lang);
  const text = other?.kind === 'resolved'
    ? t.compareWith(other.label)
    : kind === 'previous_period' ? t.comparePrevious : t.compareLastYear;
  return { tool: 'query_metrics', input: { ...plain(query), compare: kind }, label: text };
}

function showOffersChip(query: MetricsQuery, result: MetricsOk, metrics: MetricId[], ctx: FollowUpContext): FollowUpCall | null {
  const f = query.filters ?? {};
  // search_offers has no steel-type filter: the list would not be the offers that were counted.
  if (f.steel_types?.length) return null;
  const bases = Array.from(new Set(result.values.map((v) => v.basis)));
  if (bases.length !== 1) return null;
  const counted = result.coverage.find((c) => c.basis === bases[0])?.offers ?? 0;
  if (counted === 0 || counted > MAX_OFFERS_TO_LIST) return null;

  const decision = effectiveDecisions(query, metrics);
  const input: Record<string, unknown> = {
    ...(result.applied.userIds.length ? { people: result.applied.userIds } : {}),
    ...(f.clients?.length ? { clients: f.clients } : {}),
    ...(f.status?.length ? { status: f.status } : {}),
    ...(decision.length ? { decision } : {}),
    ...(result.period.from && result.period.to ? { period: { from: result.period.from, to: result.period.to } } : {}),
    basis: bases[0],
  };
  return { tool: 'search_offers', input, label: T[ctx.lang].showOffers };
}

/** No offers matched: the only useful next step is dropping a narrowing filter. */
function emptyChips(query: MetricsQuery, ctx: FollowUpContext): FollowUpCall[] {
  const f = query.filters ?? {};
  const t = T[ctx.lang];
  return FILTER_KEYS.filter((key) => (f[key]?.length ?? 0) > 0).map((key) => {
    const { [key]: _dropped, ...rest } = f;
    return { tool: 'query_metrics' as const, input: { ...query, filters: rest }, label: t.without(t.filters[key]) };
  });
}

export function buildFollowUps(query: MetricsQuery, result: MetricsOk, ctx: FollowUpContext): FollowUpCall[] {
  if (result.empty) return emptyChips(query, ctx).slice(0, MAX_CHIPS);

  const t = T[ctx.lang];
  const metrics = Array.from(new Set(query.metrics));
  const f = query.filters ?? {};
  const scalar = metrics.filter((m) => METRICS[m].unit !== 'table');
  const candidates: (FollowUpCall | null)[] = [];

  if (metrics.some(isLostMetric) && !metrics.includes('lost_reasons') && metrics.length < MAX_METRICS) {
    // Lost reasons cover one window, so a comparison answer drops the comparison for this chip.
    const { compare: _compare, ...single } = query;
    candidates.push({ tool: 'query_metrics', input: { ...single, metrics: [...metrics, 'lost_reasons'] }, label: t.lostReasons });
  }

  const breakdown = (group_by: 'person' | 'client' | 'steel_type', label: string): FollowUpCall | null =>
    scalar.length > 0 ? { tool: 'query_metrics', input: { ...plain(query), metrics: scalar, group_by, sort: 'desc' }, label } : null;
  const byPerson = ctx.scope !== 'own' && (f.people?.length ?? 0) !== 1 ? breakdown('person', t.byPerson) : null;
  const byClient = (f.clients?.length ?? 0) !== 1 ? breakdown('client', t.byClient) : null;
  const bySteel = (f.steel_types?.length ?? 0) !== 1 ? breakdown('steel_type', t.bySteel) : null;

  if (query.group_by) {
    // A breakdown answer: the totals behind it can still be compared.
    candidates.push(compareChip(query, result, 'previous_period', ctx));
  } else if (query.compare) {
    candidates.push(byPerson, byClient, showOffersChip(query, result, metrics, ctx));
  } else {
    candidates.push(
      compareChip(query, result, 'previous_period', ctx),
      showOffersChip(query, result, metrics, ctx),
      byPerson,
      byClient,
      compareChip(query, result, 'same_period_last_year', ctx),
      bySteel
    );
  }

  return candidates.filter((c): c is FollowUpCall => c !== null).slice(0, MAX_CHIPS);
}
