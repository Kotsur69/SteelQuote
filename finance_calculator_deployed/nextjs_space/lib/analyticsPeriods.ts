// Date arithmetic for the analytics panel: the period presets ("last 30 days", "this
// quarter", ...), bucket boundaries per granularity, and the equal-length preceding window
// used for the change indicator on the KPI tiles.
//
// Everything works on date-only YYYY-MM-DD strings with UTC helpers on purpose. The row
// dates arrive pre-formatted from Postgres (to_char in lib/analyticsQuery.ts), so the
// database timezone stays the single source of truth and Node running in UTC cannot shift
// an offer into the neighbouring day.

import type { Granularity } from './analytics';

export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'last365'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'ytd'
  | 'all'
  | 'custom';

export const PERIOD_PRESETS: PeriodPreset[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'last90',
  'last365',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'lastQuarter',
  'thisYear',
  'lastYear',
  'ytd',
  'all',
  'custom',
];

export interface ResolvedPeriod {
  /** YYYY-MM-DD, inclusive. null = unbounded (preset "all"). */
  from: string | null;
  to: string | null;
}

// --- date-only primitives -------------------------------------------------------------

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function addMonths(iso: string, months: number): string {
  const d = fromIso(iso);
  const anchor = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  // Clamp the day so 31 January + 1 month lands on 28/29 February, not on 2/3 March.
  const lastDay = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)
  ).getUTCDate();
  anchor.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toIso(anchor);
}

export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const ms = fromIso(toIsoDate).getTime() - fromIso(fromIsoDate).getTime();
  return Math.round(ms / 86400000);
}

function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function endOfMonth(iso: string): string {
  const d = fromIso(iso);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

function startOfQuarter(iso: string): string {
  const d = fromIso(iso);
  const q = Math.floor(d.getUTCMonth() / 3);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1)));
}

function endOfQuarter(iso: string): string {
  const d = fromIso(iso);
  const q = Math.floor(d.getUTCMonth() / 3);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0)));
}

/** Monday of the ISO week the date falls in. */
function startOfWeek(iso: string): string {
  const dow = fromIso(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, -(dow === 0 ? 6 : dow - 1));
}

// --- presets --------------------------------------------------------------------------

/** `today` is injected so the caller (and the tests) control what "now" means. */
export function resolvePreset(preset: PeriodPreset, today: string): ResolvedPeriod {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    // Rolling windows INCLUDE today, so "last 7 days" is today plus the 6 before it.
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'last365':
      return { from: addDays(today, -364), to: today };
    case 'thisMonth':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'lastMonth': {
      const prev = addMonths(startOfMonth(today), -1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case 'thisQuarter':
      return { from: startOfQuarter(today), to: endOfQuarter(today) };
    case 'lastQuarter': {
      const prev = addMonths(startOfQuarter(today), -3);
      return { from: startOfQuarter(prev), to: endOfQuarter(prev) };
    }
    case 'thisYear':
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case 'lastYear': {
      const y = Number(today.slice(0, 4)) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    // Year to date stops at today instead of running on to 31 December.
    case 'ytd':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'all':
    case 'custom':
    default:
      return { from: null, to: null };
  }
}

/**
 * The comparison window for the "vs previous period" delta on the KPI tiles.
 *
 * A period that lines up exactly with a calendar month, quarter or year shifts back by one
 * of those units, so July compares against June and not against 31 May - 30 June. Anything
 * else (a rolling window, a hand-picked range) shifts back by its own length in days.
 * An unbounded period has no comparison.
 */
export function previousPeriod(period: ResolvedPeriod): ResolvedPeriod {
  const { from, to } = period;
  if (!from || !to) return { from: null, to: null };

  if (from === startOfMonth(from) && to === endOfMonth(to)) {
    const wholeMonths = monthIndex(to) - monthIndex(from) + 1;
    const shifted = addMonths(from, -wholeMonths);
    return { from: startOfMonth(shifted), to: endOfMonth(addMonths(shifted, wholeMonths - 1)) };
  }

  const span = daysBetween(from, to); // 0 for a single day
  const end = addDays(from, -1);
  return { from: addDays(end, -span), to: end };
}

function monthIndex(iso: string): number {
  return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
}

// --- buckets --------------------------------------------------------------------------

/** First day of the bucket `iso` belongs to, at the given granularity. */
export function bucketStart(iso: string, granularity: Granularity): string {
  switch (granularity) {
    case 'day':
      return iso;
    case 'week':
      return startOfWeek(iso);
    case 'month':
      return startOfMonth(iso);
    case 'quarter':
      return startOfQuarter(iso);
    case 'year':
      return `${iso.slice(0, 4)}-01-01`;
  }
}

export function nextBucket(bucket: string, granularity: Granularity): string {
  switch (granularity) {
    case 'day':
      return addDays(bucket, 1);
    case 'week':
      return addDays(bucket, 7);
    case 'month':
      return addMonths(bucket, 1);
    case 'quarter':
      return addMonths(bucket, 3);
    case 'year':
      return addMonths(bucket, 12);
  }
}

// A line chart with holes in it lies about the shape of the data, so empty buckets are
// emitted as zero rows rather than skipped. The cap stops daily granularity over ten years
// of history from producing thousands of points nobody can read.
const MAX_BUCKETS = 400;

export function enumerateBuckets(from: string, to: string, granularity: Granularity): string[] {
  const out: string[] = [];
  let cursor = bucketStart(from, granularity);
  const last = bucketStart(to, granularity);
  while (cursor <= last && out.length < MAX_BUCKETS) {
    out.push(cursor);
    cursor = nextBucket(cursor, granularity);
  }
  return out;
}

/** Coarse-to-fine order, for stepping a granularity up when a window has too many buckets. */
const COARSENING: Granularity[] = ['day', 'week', 'month', 'quarter', 'year'];

/**
 * The finest granularity at or above `requested` whose bucket count fits under MAX_BUCKETS.
 *
 * Without this, asking for daily buckets over ten years would silently draw only the first 400
 * days while the KPI tiles above kept reporting the full period - a chart and a total on the
 * same screen disagreeing, with nothing on the page to say why. Coarsening instead keeps every
 * offer on the chart and merely widens the bars.
 */
export function fitGranularity(
  from: string | null,
  to: string | null,
  requested: Granularity
): Granularity {
  if (!from || !to) return requested;
  const start = COARSENING.indexOf(requested);
  for (let i = Math.max(start, 0); i < COARSENING.length; i++) {
    const candidate = COARSENING[i];
    if (enumerateBuckets(from, to, candidate).length < MAX_BUCKETS) return candidate;
  }
  return 'year';
}

/**
 * Granularity that keeps a window under MAX_BUCKETS points. Used when the reader picks a
 * period without touching the granularity - "all time" on daily buckets is unreadable.
 */
export function suggestGranularity(from: string | null, to: string | null): Granularity {
  if (!from || !to) return 'month';
  const days = daysBetween(from, to) + 1;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  if (days <= 800) return 'month';
  if (days <= 2500) return 'quarter';
  return 'year';
}

/** Axis label for a bucket. Short by design - the axis has no room for a full date. */
export function bucketLabel(bucket: string, granularity: Granularity): string {
  const [y, m, d] = bucket.split('-');
  switch (granularity) {
    case 'day':
    case 'week':
      return `${d}.${m}`;
    case 'month':
      return `${m}.${y.slice(2)}`;
    case 'quarter':
      return `Q${Math.floor((Number(m) - 1) / 3) + 1} ${y}`;
    case 'year':
      return y;
  }
}

/** Full, unambiguous bucket range for tooltips, where there is room for it. */
export function bucketRangeLabel(bucket: string, granularity: Granularity): string {
  if (granularity === 'day') return bucket;
  return `${bucket} - ${addDays(nextBucket(bucket, granularity), -1)}`;
}
