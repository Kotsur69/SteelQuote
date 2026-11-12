// Comparison windows of query_metrics (docs/ai-assistant-plan.md 3.3, D12).
//
// The model never computes dates: it says "compare with the previous period", "with the same
// period a year earlier" or names a period, and this module works out the second window with
// the same calendar helpers /analytics uses for its KPI deltas.
//
// A comparison against a period that is still running ("ten miesiąc vs zeszły" on 9 November)
// has no single right answer, so it is never guessed: the caller gets up to three fully
// specified choices (same days / to date vs whole / last two full periods) shown as buttons.

import { z } from 'zod';
import { addDays, addMonths, daysBetween, previousPeriod } from '../analyticsPeriods';
import type { Lang } from './format';
import { calendarUnit, periodInputSchema, resolvePeriod, windowLabel, type PeriodInput, type PeriodResolution, type ResolvedWindow } from './periods';

export const COMPARE_KINDS = ['previous_period', 'same_period_last_year'] as const;

export const compareInputSchema = z.union([z.enum(COMPARE_KINDS), periodInputSchema]);
export type CompareInput = z.infer<typeof compareInputSchema>;

const monthStartOf = (iso: string) => `${iso.slice(0, 7)}-01`;
const monthEndOf = (iso: string) => addDays(addMonths(monthStartOf(iso), 1), -1);
const isMonthEnd = (iso: string) => iso === monthEndOf(iso);

/** The same window 12 months earlier; a window ending on a month's last day keeps doing so. */
function lastYear(from: string, to: string): { from: string; to: string } {
  const shiftedTo = addMonths(to, -12);
  return { from: addMonths(from, -12), to: isMonthEnd(to) ? monthEndOf(shiftedTo) : shiftedTo };
}

function resolved(from: string, to: string, today: string, lang: Lang): ResolvedWindow {
  return { kind: 'resolved', from, to, label: windowLabel(from, to, lang), inProgress: to >= today };
}

/** The second window of a comparison. The current one must be bounded on both ends. */
export function comparisonWindow(current: ResolvedWindow, compare: CompareInput, today: string, lang: Lang): PeriodResolution {
  if (!current.from || !current.to) {
    return { kind: 'invalid', message: 'An unbounded period ("all") cannot be compared. Pick a concrete period.' };
  }
  if (compare === 'previous_period') {
    const prev = previousPeriod({ from: current.from, to: current.to });
    return resolved(prev.from!, prev.to!, today, lang);
  }
  if (compare === 'same_period_last_year') {
    const ly = lastYear(current.from, current.to);
    return resolved(ly.from, ly.to, today, lang);
  }
  const explicit = resolvePeriod(compare, today, lang);
  if (explicit.kind === 'clarify') {
    return { kind: 'invalid', message: 'The comparison period is ambiguous - pass it with a year.' };
  }
  if (explicit.kind === 'resolved' && (!explicit.from || !explicit.to)) {
    return { kind: 'invalid', message: 'The comparison period must be bounded.' };
  }
  return explicit;
}

/** One D12 button: both windows as explicit dates, so picking it never asks again. */
export interface ComparisonChoice {
  label: string;
  period: PeriodInput;
  compare: PeriodInput;
}

const MONTHS_SHORT: Record<Lang, string[]> = {
  pl: ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** "1-9 lis", "28 paź - 3 lis", with the year when `withYear`. */
function shortRange(from: string, to: string, lang: Lang, withYear: boolean): string {
  const day = (iso: string) => Number(iso.slice(8, 10));
  const mon = (iso: string) => MONTHS_SHORT[lang][Number(iso.slice(5, 7)) - 1];
  const year = withYear ? ` ${to.slice(0, 4)}` : '';
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return from === to ? `${day(from)} ${mon(from)}${year}` : `${day(from)}-${day(to)} ${mon(from)}${year}`;
  }
  return `${day(from)} ${mon(from)} - ${day(to)} ${mon(to)}${year}`;
}

/** A window's name without the year when both sides share it: "październik", "III kwartał". */
function shortName(from: string, to: string, lang: Lang, withYear: boolean): string {
  const label = windowLabel(from, to, lang);
  return withYear ? label : label.replace(/ \d{4}$/, '');
}

const explicit = (from: string, to: string): PeriodInput => ({ from, to });

/**
 * D12: the current window is still running (it ends after today). Returns the ways the question
 * can be meant; each choice is a pair of windows that are finished or end today.
 */
export function incompleteChoices(current: ResolvedWindow, compare: CompareInput, today: string, lang: Lang): ComparisonChoice[] {
  const from = current.from!;
  const to = current.to!;
  const other = comparisonWindow(current, compare, today, lang);
  if (other.kind !== 'resolved' || !other.from || !other.to) return [];
  const withYear = from.slice(0, 4) !== other.from.slice(0, 4);
  const choices: ComparisonChoice[] = [];

  // 1. The same days on both sides: 1-9 Nov vs 1-9 Oct.
  const sameDaysTo = addDays(other.from, daysBetween(from, today));
  const otherTo = sameDaysTo < other.to ? sameDaysTo : other.to;
  choices.push({
    label: `${shortRange(from, today, lang, withYear)} vs ${shortRange(other.from, otherTo, lang, withYear)}`,
    period: explicit(from, today),
    compare: explicit(other.from, otherTo),
  });

  // 2. So far vs the whole other period.
  const curName = shortName(from, to, lang, withYear);
  const otherName = shortName(other.from, other.to, lang, withYear);
  choices.push({
    label: lang === 'pl' ? `${curName} do dziś vs cały ${otherName}` : `${curName} to date vs all of ${otherName}`,
    period: explicit(from, today),
    compare: explicit(other.from, other.to),
  });

  // 3. The last two finished periods - only when the running one is a calendar unit.
  if (calendarUnit(from, to)) {
    const lastFull = previousPeriod({ from, to });
    const lastFullWindow = resolved(lastFull.from!, lastFull.to!, today, lang);
    // An explicit comparison ("ten miesiąc vs październik") steps back like "previous period".
    const kind = typeof compare === 'string' ? compare : 'previous_period';
    const before = comparisonWindow(lastFullWindow, kind, today, lang);
    if (before.kind === 'resolved' && before.from && before.to) {
      const yearDiffers = lastFull.from!.slice(0, 4) !== before.from.slice(0, 4);
      choices.push({
        label: `${shortName(lastFull.from!, lastFull.to!, lang, yearDiffers)} vs ${shortName(before.from, before.to, lang, yearDiffers)}`,
        period: explicit(lastFull.from!, lastFull.to!),
        compare: explicit(before.from, before.to),
      });
    }
  }
  return choices;
}

/** Change between two raw values: absolute (to `decimals`) and % (null unless the base is positive). */
export function delta(current: number | null, previous: number | null, decimals: number): { abs: number | null; pct: number | null } {
  if (current === null || previous === null) return { abs: null, pct: null };
  const f = 10 ** decimals;
  const abs = Math.round((current - previous) * f) / f || 0;
  // Never "infinity %" (plan 3.3), and no % against a negative base either: a margin going from
  // -2% to -1% is an improvement, which (cur - prev) / prev would show as -50%.
  const pct = previous <= 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10 || 0;
  return { abs, pct };
}
