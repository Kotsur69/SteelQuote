// Text for the "what changed" badge of an offer version, in the viewer's language. The diff
// itself (lib/offerVersionDiff.ts) is language-free; this module only turns it into strings
// from translations.versionDiff.
import type { Translations } from './translations';
import type { Currency } from './currency';
import { groupThousands } from './numberFormat';
import { SELF_PICKUP, type ChangeSummary, type ChangeValue, type OfferChange } from './offerVersionDiff';

export type VersionDiffStrings = Translations['versionDiff'];

/** How many changes the compact label shows before "+N more". */
export const SHORT_LABEL_MAX = 3;

const SEP = ' · ';
const ARROW = ' → ';

const PER_TON_FIELDS = new Set(['marza', 'final_price', 'transport', 'extra']);

function unitOf(currency: Currency | undefined): string {
  return currency === 'PLN' ? 'zł' : '€';
}

function plainNumber(n: number, maxDecimals: number): string {
  const f = 10 ** maxDecimals;
  return groupThousands(String(Math.round(n * f) / f));
}

function signed(formatted: string, n: number): string {
  return n > 0 ? `+${formatted}` : formatted;
}

function money(n: number, currency: Currency | undefined, perTon: boolean): string {
  const amount = Number.isInteger(n) ? groupThousands(String(n)) : groupThousands(n.toFixed(2));
  return `${amount} ${unitOf(currency)}${perTon ? '/t' : ''}`;
}

function text(v: ChangeValue, s: VersionDiffStrings): string {
  if (v === null || v === '') return s.empty;
  if (v === SELF_PICKUP) return s.selfPickup;
  return String(v);
}

interface OldNew {
  o: string;
  n: string;
  d: string | null;
}

function numbers(c: OfferChange): { o: number | null; n: number | null } {
  return { o: typeof c.old === 'number' ? c.old : null, n: typeof c.new === 'number' ? c.new : null };
}

function unitPair(c: OfferChange, decimals: number, suffix: string, deltaSuffix: string): OldNew {
  const { o, n } = numbers(c);
  return {
    o: `${plainNumber(o ?? 0, decimals)}${suffix}`,
    n: `${plainNumber(n ?? 0, decimals)}${suffix}`,
    d: c.delta === undefined ? null : `${signed(plainNumber(c.delta, decimals), c.delta)}${deltaSuffix}`,
  };
}

function moneyPair(c: OfferChange): OldNew {
  const { o, n } = numbers(c);
  const perTon = PER_TON_FIELDS.has(c.field);
  return {
    o: money(o ?? 0, c.oldCurrency ?? c.currency, perTon),
    n: money(n ?? 0, c.currency, perTon),
    d: c.delta === undefined ? null : signed(money(c.delta, c.currency, perTon), c.delta),
  };
}

function oldNew(c: OfferChange, s: VersionDiffStrings): OldNew {
  const { o, n } = numbers(c);
  switch (c.field) {
    case 'tons':
      return unitPair(c, 3, ' t', ' t');
    case 'margin':
      return unitPair(c, 2, '%', ' pp');
    case 'total':
    case 'marza':
    case 'final_price':
    case 'transport':
    case 'extra':
      return moneyPair(c);
    case 'payment_term':
      return { o: o === null ? s.empty : `${o} ${s.days}`, n: n === null ? s.empty : `${n} ${s.days}`, d: null };
    case 'eur_pln_rate':
      return { o: o === null ? s.empty : plainNumber(o, 4), n: n === null ? s.empty : plainNumber(n, 4), d: null };
    default:
      return { o: text(c.old, s), n: text(c.new, s), d: null };
  }
}

function withItem(c: OfferChange, body: string): string {
  return c.item ? `${c.item}: ${body}` : body;
}

function itemWithTons(c: OfferChange): string {
  const tons = c.field === 'item_added' ? c.new : c.old;
  return `${c.item ?? ''}${SEP}${plainNumber(typeof tons === 'number' ? tons : 0, 3)} t`;
}

// Price-side changes get a direction so the UI can colour them: up = green, down = red.
// Tons, transport, extras and terms stay neutral.
export type Trend = 'up' | 'down';

const TREND_FIELDS = new Set(['margin', 'marza', 'final_price', 'total']);

export function changeTrend(c: OfferChange): Trend | null {
  if (!TREND_FIELDS.has(c.field) || !c.delta) return null;
  return c.delta > 0 ? 'up' : 'down';
}

/** Pieces of a detail line, so the UI can colour the arrow and the delta. */
export interface ChangeParts {
  label: string;
  old: string | null;
  new: string | null;
  delta: string | null;
  trend: Trend | null;
}

export function changeParts(c: OfferChange, s: VersionDiffStrings): ChangeParts {
  if (c.field === 'item_added' || c.field === 'item_removed') {
    return { label: `${s.fields[c.field]}: ${itemWithTons(c)}`, old: null, new: null, delta: null, trend: null };
  }
  const { o, n, d } = oldNew(c, s);
  return { label: withItem(c, s.fields[c.field]), old: o, new: n, delta: d, trend: changeTrend(c) };
}

/** Full line for the expanded list: "HDG 2×1250: Marża 8% → 9.5% (+1.5 pp)". */
export function formatChange(c: OfferChange, s: VersionDiffStrings): string {
  const p = changeParts(c, s);
  const values = p.old !== null && p.new !== null ? ` ${p.old}${ARROW}${p.new}` : '';
  return `${p.label}${values}${p.delta ? ` (${p.delta})` : ''}`;
}

/** Pieces of a badge entry: the text and an optional (coloured) delta after it. */
export interface ShortParts {
  text: string;
  delta: string | null;
  trend: Trend | null;
}

export function changeShortParts(c: OfferChange, s: VersionDiffStrings): ShortParts {
  switch (c.field) {
    case 'item_added':
      return { text: `+ ${itemWithTons(c)}`, delta: null, trend: null };
    case 'item_removed':
      return { text: `− ${itemWithTons(c)}`, delta: null, trend: null };
    case 'tons':
      return { text: c.item ?? '', delta: oldNew(c, s).d, trend: null };
    case 'margin':
    case 'marza':
    case 'final_price':
    case 'total': {
      const { o, n, d } = oldNew(c, s);
      return { text: withItem(c, s.fields[c.field]), delta: d ?? `${o}${ARROW}${n}`, trend: changeTrend(c) };
    }
    default:
      return { text: withItem(c, s.fields[c.field]), delta: null, trend: null };
  }
}

/** Compact form for the badge: "+ HDG 2×1250 · 5 t", "HDG 2×1250 +5 t", "Marża +1.5 pp". */
export function formatChangeShort(c: OfferChange, s: VersionDiffStrings): string {
  const p = changeShortParts(c, s);
  return p.delta ? `${p.text} ${p.delta}`.trim() : p.text;
}

/** "+N more" for the changes the badge leaves out, or null when all are shown. */
export function moreLabel(summary: ChangeSummary, s: VersionDiffStrings): string | null {
  const hidden = summary.changes.length - SHORT_LABEL_MAX;
  return hidden > 0 ? s.more.replace('{n}', String(hidden)) : null;
}

/** Badge text: "base · 2 items · 15 t" for a first version, else up to 3 changes + "+N more". */
export function formatSummaryShort(summary: ChangeSummary, s: VersionDiffStrings): string {
  if (summary.base) {
    return [s.base, `${summary.base.items} ${s.itemsShort}`, `${plainNumber(summary.base.tons, 3)} t`].join(SEP);
  }
  if (summary.changes.length === 0) return s.noChanges;
  const shown = summary.changes.slice(0, SHORT_LABEL_MAX).map((c) => formatChangeShort(c, s)).join(', ');
  const more = moreLabel(summary, s);
  return more ? `${shown} ${more}` : shown;
}
