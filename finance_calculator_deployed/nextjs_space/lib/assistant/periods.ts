// Period handling of the assistant (docs/ai-assistant-plan.md 3.3 and rule 3.8).
//
// The model never computes dates. It passes what the user said - a preset, a month, a quarter,
// a year or an explicit range - and this module turns it into a window with the SAME helpers
// /analytics uses (lib/analyticsPeriods.ts). `today` is injected: production passes the database
// clock (fetchToday), the eval passes the golden set's fixed date.
//
// Two things are decided here rather than by the model:
//   - a month or quarter named WITHOUT a year means its most recent occurrence; when that is the
//     one still in progress the user is asked which one they mean (buttons), never guessed,
//   - a period that has not started yet is reported as such instead of returning zeros.

import { z } from 'zod';
import { isIsoDate } from '../analytics';
import { addDays, addMonths, resolvePreset, type PeriodPreset } from '../analyticsPeriods';
import { formatDate, formatDateRange, monthLabel, quarterLabel, type Lang } from './format';

// 'custom' is expressed with from/to instead.
export const ASSISTANT_PRESETS = [
  'today', 'yesterday', 'last7', 'last30', 'last90', 'last365', 'thisMonth', 'lastMonth',
  'thisQuarter', 'lastQuarter', 'thisYear', 'lastYear', 'ytd', 'all',
] as const satisfies readonly PeriodPreset[];

const isoDate = z.string().refine(isIsoDate, 'Expected YYYY-MM-DD');

export const periodInputSchema = z
  .object({
    preset: z.enum(ASSISTANT_PRESETS).optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    month: z.number().int().min(1).max(12).optional(),
    quarter: z.number().int().min(1).max(4).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict();

export type PeriodInput = z.infer<typeof periodInputSchema>;

export interface PeriodChoice {
  label: string;
  period: PeriodInput;
}

export interface ResolvedWindow {
  kind: 'resolved';
  /** Inclusive YYYY-MM-DD; null = unbounded (preset "all"). */
  from: string | null;
  to: string | null;
  /** Human label in the answer language: "październik 2026", "III kwartał 2026", or the dates. */
  label: string;
  /** The window contains today or later days, i.e. its numbers can still grow. */
  inProgress: boolean;
}

export type PeriodResolution =
  | ResolvedWindow
  | { kind: 'clarify'; options: PeriodChoice[] }
  | { kind: 'future'; label: string }
  | { kind: 'invalid'; message: string };

const pad = (n: number) => String(n).padStart(2, '0');
const monthStart = (year: number, month: number) => `${year}-${pad(month)}-01`;
const monthEnd = (year: number, month: number) => addDays(addMonths(monthStart(year, month), 1), -1);

const monthEndOf = (iso: string) => addDays(addMonths(`${iso.slice(0, 7)}-01`, 1), -1);
const isMonthEnd = (iso: string) => iso === monthEndOf(iso);
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

type Unit = 'month' | 'quarter' | 'year';

/** The calendar unit a window covers exactly, if any. */
export function calendarUnit(from: string, to: string): Unit | null {
  if (!from.endsWith('-01') || !isMonthEnd(to)) return null;
  const months = monthIndex(to) - monthIndex(from) + 1;
  const startMonth = Number(from.slice(5, 7));
  if (months === 1) return 'month';
  if (months === 3 && (startMonth - 1) % 3 === 0) return 'quarter';
  if (months === 12 && startMonth === 1) return 'year';
  return null;
}

/** "październik 2026", "III kwartał 2026", "2025", or the dates for any other window. */
export function windowLabel(from: string, to: string, lang: Lang): string {
  const unit = calendarUnit(from, to);
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  if (unit === 'month') return monthLabel(year, month, lang);
  if (unit === 'quarter') return quarterLabel(year, Math.floor((month - 1) / 3) + 1, lang);
  if (unit === 'year') return String(year);
  return from === to ? formatDate(from, lang) : `${formatDate(from, lang)} - ${formatDate(to, lang)}`;
}

function window(from: string | null, to: string | null, label: string, today: string): PeriodResolution {
  if (from && from > today) return { kind: 'future', label };
  return { kind: 'resolved', from, to, label, inProgress: to === null || to >= today };
}

const toDateLabel = (lang: Lang) => (lang === 'pl' ? 'do dziś' : 'to date');

/** A month or quarter given without a year: its latest occurrence, or a question when ambiguous. */
function withoutYear(
  startMonth: number,
  months: number,
  labelOf: (year: number) => string,
  build: (year: number) => PeriodInput,
  today: string,
  lang: Lang
): PeriodResolution {
  const thisYear = Number(today.slice(0, 4));
  const from = monthStart(thisYear, startMonth);
  const to = monthEnd(thisYear, startMonth + months - 1);
  // Not started yet this year -> the user means last year's.
  if (from > today) return window(monthStart(thisYear - 1, startMonth), monthEnd(thisYear - 1, startMonth + months - 1), labelOf(thisYear - 1), today);
  // Finished -> unambiguous.
  if (to < today) return window(from, to, labelOf(thisYear), today);
  // In progress: "listopad" on 9 November can be this month so far or last year's whole month.
  return {
    kind: 'clarify',
    options: [
      { label: `${labelOf(thisYear)} (${toDateLabel(lang)})`, period: build(thisYear) },
      { label: labelOf(thisYear - 1), period: build(thisYear - 1) },
    ],
  };
}

export function resolvePeriod(input: PeriodInput, today: string, lang: Lang): PeriodResolution {
  const { preset, year, month, quarter, from, to } = input;

  if (from || to) {
    if (!from || !to) return { kind: 'invalid', message: 'Both "from" and "to" are required for an explicit range.' };
    // A reversed range is a slip, not an empty result (same rule as /api/analytics).
    const [a, b] = from <= to ? [from, to] : [to, from];
    return window(a, b, windowLabel(a, b, lang), today);
  }

  if (month !== undefined) {
    if (year !== undefined) return window(monthStart(year, month), monthEnd(year, month), monthLabel(year, month, lang), today);
    return withoutYear(month, 1, (y) => monthLabel(y, month, lang), (y) => ({ year: y, month }), today, lang);
  }

  if (quarter !== undefined) {
    const start = (quarter - 1) * 3 + 1;
    if (year !== undefined) return window(monthStart(year, start), monthEnd(year, start + 2), quarterLabel(year, quarter, lang), today);
    return withoutYear(start, 3, (y) => quarterLabel(y, quarter, lang), (y) => ({ year: y, quarter }), today, lang);
  }

  if (year !== undefined) return window(`${year}-01-01`, `${year}-12-31`, String(year), today);

  if (preset) {
    const resolved = resolvePreset(preset, today);
    return window(resolved.from, resolved.to, formatDateRange(resolved.from, resolved.to, lang), today);
  }

  return { kind: 'invalid', message: 'Give a preset, a month, a quarter, a year or a from/to range.' };
}
