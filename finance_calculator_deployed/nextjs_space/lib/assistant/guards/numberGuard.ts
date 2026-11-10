// Number guard (docs/ai-assistant-plan.md rule 3.4): every number in the model's final text must
// be a value the server produced this turn (tool results), something the user typed, or part of
// the knowledge base. The model is a writer, never a calculator - a figure it derived, rounded
// differently or invented does not survive this check.
//
// Matching is deliberately one-directional and tolerant about FORMAT only:
//   "1 234,5 t", "1,234.5 t", "1234.5" all read as 1234.5; "1,2 mln" reads as 1.2 million;
//   a number may be rounded to the precision it is displayed with (12,35% -> "12,4%").
// It is never tolerant about VALUE.

const SPACES = '[ \\u00A0\\u202F]';
// Either space-grouped thousands ("1 234 567,89") or a plain run with . , separators.
const NUMBER_RE = new RegExp(`\\d{1,3}(?:${SPACES}\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)*`, 'g');
const DATE_PL_RE = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g;
const DATE_ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const SCALE_RE = /^[   ]?(mld|mln|tys\.?|million|thousand|billion)\b/i;
const SCALES: Record<string, number> = { mld: 1e9, billion: 1e9, mln: 1e6, million: 1e6, tys: 1e3, thousand: 1e3 };

export interface ParsedNumber {
  value: number;
  /** Decimals the number was written with - the precision it may have been rounded to. */
  decimals: number;
}

/** Every way a written number can reasonably be read (pl vs en separators). */
export function readings(token: string): ParsedNumber[] {
  const raw = token.replace(new RegExp(SPACES, 'g'), '');
  const parse = (int: string, frac: string): ParsedNumber => ({ value: Number(frac ? `${int}.${frac}` : int), decimals: frac.length });
  const dots = (raw.match(/\./g) ?? []).length;
  const commas = (raw.match(/,/g) ?? []).length;

  if (dots === 0 && commas === 0) return [parse(raw, '')];

  if (dots > 0 && commas > 0) {
    // The LAST separator is the decimal one, the other groups thousands.
    const decimal = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ',';
    const [int, frac = ''] = raw.split(decimal);
    return [parse(int.replace(/[.,]/g, ''), frac)];
  }

  const sep = dots > 0 ? '.' : ',';
  const parts = raw.split(sep);
  const out: ParsedNumber[] = [];
  // One separator: a decimal ("12,5")...
  if (parts.length === 2) out.push(parse(parts[0], parts[1]));
  // ...or thousands grouping ("1,234" / "1.234.567") when every later group has 3 digits.
  if (parts[0].length <= 3 && parts.slice(1).every((p) => p.length === 3)) out.push(parse(parts.join(''), ''));
  return out.length > 0 ? out : [parse(parts.join(''), '')];
}

const pad = (n: string) => n.padStart(2, '0');

export interface AllowedNumbers {
  values: number[];
  /** ISO dates seen in the sources. */
  dates: Set<string>;
}

function scanText(text: string, into: AllowedNumbers): void {
  for (const m of text.matchAll(DATE_PL_RE)) into.dates.add(`${m[3]}-${pad(m[2])}-${pad(m[1])}`);
  for (const m of text.matchAll(DATE_ISO_RE)) into.dates.add(m[0]);
  for (const m of text.matchAll(NUMBER_RE)) {
    for (const r of readings(m[0])) if (Number.isFinite(r.value)) into.values.push(r.value);
  }
}

function walk(source: unknown, into: AllowedNumbers): void {
  if (typeof source === 'number') {
    if (Number.isFinite(source)) into.values.push(source);
  } else if (typeof source === 'string') {
    scanText(source, into);
  } else if (Array.isArray(source)) {
    for (const item of source) walk(item, into);
  } else if (source && typeof source === 'object') {
    for (const value of Object.values(source)) walk(value, into);
  }
}

/** Everything the answer may quote: numeric leaves and numbers written inside strings. */
export function collectAllowed(sources: readonly unknown[]): AllowedNumbers {
  const allowed: AllowedNumbers = { values: [], dates: new Set() };
  for (const source of sources) walk(source, allowed);
  return allowed;
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((Math.abs(value) + Number.EPSILON) * f) / f;
}

function isAllowed(parsed: ParsedNumber, scale: number, allowed: AllowedNumbers): boolean {
  const target = Math.abs(parsed.value);
  return allowed.values.some((a) => Math.abs(roundTo(a / scale, parsed.decimals) - target) < 1e-9);
}

export interface NumberGuardResult {
  ok: boolean;
  /** The offending numbers exactly as the model wrote them. */
  violations: string[];
}

export function checkNumbers(text: string, allowed: AllowedNumbers): NumberGuardResult {
  const violations: string[] = [];

  // Dates are checked whole, then blanked so their parts are not re-read as numbers.
  let rest = text.replace(DATE_PL_RE, (whole, d: string, m: string, y: string) => {
    if (!allowed.dates.has(`${y}-${pad(m)}-${pad(d)}`)) violations.push(whole);
    return ' ';
  });
  rest = rest.replace(DATE_ISO_RE, (whole) => {
    if (!allowed.dates.has(whole)) violations.push(whole);
    return ' ';
  });
  // List numbering ("1. ", "2) ") is layout, not data.
  rest = rest.replace(/^[ \t]*\d{1,2}[.)][ \t]+/gm, ' ');

  for (const m of rest.matchAll(NUMBER_RE)) {
    const after = rest.slice((m.index ?? 0) + m[0].length);
    const scaleWord = SCALE_RE.exec(after)?.[1]?.toLowerCase().replace('.', '');
    const scale = scaleWord ? SCALES[scaleWord] : 1;
    if (!readings(m[0]).some((r) => isAllowed(r, scale, allowed))) violations.push(m[0]);
  }

  return { ok: violations.length === 0, violations: Array.from(new Set(violations)) };
}
