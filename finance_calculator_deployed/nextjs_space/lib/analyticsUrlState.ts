// Full state of the analytics panel as a URL (docs/ai-assistant-plan.md 6.1, D23).
//
// One schema, three users:
//   - /analytics reads it on load and writes it back on every change, so any view of the panel
//     is a link that can be bookmarked, shared or refreshed without losing the filters,
//   - the assistant builds its "Otwórz panel analizy" link with toSearch() from the exact query
//     it answered, so the link and the answer come from one object,
//   - toApiQuery() turns the same state into the /api/analytics query string.
//
// The URL carries filters and view settings only, never data. Visibility is enforced by
// /api/analytics on every request (`users` can only narrow), so a forwarded link shows each
// viewer only their own scope.
//
// Browser-safe: no server-only imports.

import { z } from 'zod';
import {
  CLIENT_DECISIONS,
  DATE_BASES,
  DIMENSIONS,
  GRANULARITIES,
  MEASURES,
  OFFER_STATUSES,
  STEEL_TYPE_SERIES_ORDER,
  isIsoDate,
  parseEnumList,
  parseIdList,
  type DateBasis,
  type Dimension,
  type Granularity,
  type Measure,
} from './analytics';
import { PERIOD_PRESETS, type PeriodPreset } from './analyticsPeriods';

export const TIME_CHART_KINDS = ['line', 'area', 'stackedArea', 'bar', 'stackedBar'] as const;
export type TimeChartKindValue = (typeof TIME_CHART_KINDS)[number];

export const BREAKDOWN_CHART_KINDS = ['bar', 'pie', 'donut', 'table'] as const;
export type BreakdownChartKindValue = (typeof BREAKDOWN_CHART_KINDS)[number];

/** Panel section a link scrolls into view after the data loads. */
export const FOCUS_SECTIONS = ['kpi', 'timeline', 'breakdown', 'lostReasons', 'table'] as const;
export type FocusSection = (typeof FOCUS_SECTIONS)[number];

/** DOM id of a focusable section on /analytics. */
export const sectionId = (focus: FocusSection): string => `analytics-${focus}`;

export interface AnalyticsUrlState {
  preset: PeriodPreset;
  /** YYYY-MM-DD, read only with preset "custom"; '' = open end. */
  from: string;
  to: string;
  basis: DateBasis;
  granularity: Granularity | 'auto';
  split: Dimension | 'none';
  /** Ids as strings - the shape the panel's multiselects work with. */
  users: string[];
  types: string[];
  statuses: string[];
  decisions: string[];
  clients: string[];
  measure: Measure;
  timeKind: TimeChartKindValue;
  breakdown: Dimension;
  breakdownKind: BreakdownChartKindValue;
  /** Hierarchy tier shown in the salespeople panel ('all' or a level code such as N0). */
  role: string;
  focus: FocusSection | null;
}

export const DEFAULT_URL_STATE: AnalyticsUrlState = {
  preset: 'last90',
  from: '',
  to: '',
  basis: 'created',
  granularity: 'auto',
  split: 'steelType',
  users: [],
  types: [],
  statuses: [],
  decisions: [],
  clients: [],
  measure: 'tons',
  timeKind: 'stackedBar',
  breakdown: 'steelType',
  breakdownKind: 'bar',
  role: 'all',
  focus: null,
};

const D = DEFAULT_URL_STATE;
const ROLE_RE = /^[\w+-]{1,20}$/;

/** A value of `allowed`, or the fallback - every field degrades to its default on its own. */
function oneOf<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback;
}

const isoOrEmpty = z.string().refine((v) => isIsoDate(v)).catch('');

type Params = Pick<URLSearchParams, 'get'>;

const ids = (raw: string | null): string[] => parseIdList(raw).map(String);

/**
 * URL -> panel state. A hand-edited or outdated link with one bad value still opens the panel
 * with everything else it asked for; it never throws.
 */
export function parseUrlState(params: Params): AnalyticsUrlState {
  const get = (key: string) => params.get(key);
  const preset = oneOf<PeriodPreset>(get('preset'), PERIOD_PRESETS, D.preset);
  const custom = preset === 'custom';
  const role = get('role');
  const focus = get('focus');
  return {
    preset,
    // Dates mean something only for a custom range; dropping them keeps one canonical URL.
    from: custom ? isoOrEmpty.parse(get('from') ?? '') : '',
    to: custom ? isoOrEmpty.parse(get('to') ?? '') : '',
    basis: oneOf<DateBasis>(get('basis'), DATE_BASES, D.basis),
    granularity: oneOf<Granularity | 'auto'>(get('granularity'), ['auto', ...GRANULARITIES], D.granularity),
    split: oneOf<Dimension | 'none'>(get('split'), ['none', ...DIMENSIONS], D.split),
    users: ids(get('users')),
    types: parseEnumList(get('types'), STEEL_TYPE_SERIES_ORDER),
    statuses: parseEnumList(get('statuses'), OFFER_STATUSES),
    decisions: parseEnumList(get('decisions'), CLIENT_DECISIONS),
    clients: ids(get('clients')),
    measure: oneOf<Measure>(get('measure'), MEASURES, D.measure),
    timeKind: oneOf(get('chart'), TIME_CHART_KINDS, D.timeKind),
    breakdown: oneOf<Dimension>(get('breakdown'), DIMENSIONS, D.breakdown),
    breakdownKind: oneOf(get('breakdownChart'), BREAKDOWN_CHART_KINDS, D.breakdownKind),
    role: role && ROLE_RE.test(role) ? role : D.role,
    focus: focus ? oneOf<FocusSection | ''>(focus, FOCUS_SECTIONS, '') || null : null,
  };
}

/** Query string of a state; defaults are left out so the plain panel keeps a clean URL. */
export function toSearch(state: AnalyticsUrlState): string {
  const p = new URLSearchParams();
  const put = (key: string, value: string, fallback: string) => {
    if (value !== fallback) p.set(key, value);
  };
  const list = (key: string, values: string[]) => {
    if (values.length > 0) p.set(key, values.join(','));
  };
  put('preset', state.preset, D.preset);
  if (state.preset === 'custom') {
    if (state.from) p.set('from', state.from);
    if (state.to) p.set('to', state.to);
  }
  put('basis', state.basis, D.basis);
  put('granularity', state.granularity, D.granularity);
  put('split', state.split, D.split);
  list('users', state.users);
  list('types', state.types);
  list('statuses', state.statuses);
  list('decisions', state.decisions);
  list('clients', state.clients);
  put('measure', state.measure, D.measure);
  put('chart', state.timeKind, D.timeKind);
  put('breakdown', state.breakdown, D.breakdown);
  put('breakdownChart', state.breakdownKind, D.breakdownKind);
  put('role', state.role, D.role);
  if (state.focus) p.set('focus', state.focus);
  return p.toString();
}

/** The /api/analytics query string for a state: filters only, view settings stay in the browser. */
export function toApiQuery(state: AnalyticsUrlState): string {
  const p = new URLSearchParams();
  p.set('preset', state.preset);
  if (state.preset === 'custom') {
    if (state.from) p.set('from', state.from);
    if (state.to) p.set('to', state.to);
  }
  p.set('basis', state.basis);
  if (state.granularity !== 'auto') p.set('granularity', state.granularity);
  p.set('split', state.split);
  if (state.users.length) p.set('users', state.users.join(','));
  if (state.types.length) p.set('types', state.types.join(','));
  if (state.statuses.length) p.set('statuses', state.statuses.join(','));
  if (state.decisions.length) p.set('decisions', state.decisions.join(','));
  if (state.clients.length) p.set('clients', state.clients.join(','));
  return p.toString();
}
