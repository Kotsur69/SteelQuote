// Validation rules engine (REGULY sheet, migration 026). Pure: no DB, no clock - the caller
// hands in the offer data, the live base prices and the rules. Shared by submit, send, the
// reviewer bar and the admin simulator, so the gate the server enforces and the explanation
// the UI shows always come from the same code.
//
// Principle from the spec: the final required level is the HIGHEST level demanded by any
// triggered rule. Chain levels (N0..N+3) compare by chain_rank; a parallel level (NPR) is not
// comparable with them and becomes an additional approval instead.

import type { HierarchyLevel } from './types';

export const CRITERIA = [
  'margin_below_target',
  'margin_deficit_pp',
  'base_price_change',
  'base_reduction_pct',
  'quote_validity_hours',
  'price_validity_quarters',
  'price_validity_days',
  'offer_value_eur',
] as const;
export type Criterion = (typeof CRITERIA)[number];

export const OPERATORS = ['<', '<=', '>', '>=', '=', '!='] as const;
export type Operator = (typeof OPERATORS)[number];

/** Criteria whose fact is a yes/no flag (threshold 1 = TAK). */
export const BOOLEAN_CRITERIA: ReadonlySet<Criterion> = new Set<Criterion>(['base_price_change']);

export interface ApprovalRule {
  id: number;
  flowId: number | null;
  criterion: Criterion;
  appliesToRoleId: number | null;
  conditionText: string;
  operator: Operator;
  /** null = not configured yet: never fires, reported by the completeness control. */
  threshold: number | null;
  /** Target margin a deficit is measured from (margin_deficit_pp only). */
  referenceValue: number | null;
  unit: string;
  priority: number;
  targetLevelId: number;
  isActive: boolean;
  sortOrder: number;
}

/** What the engine measures on an offer. Every criterion reads exactly one of these. */
export interface OfferFacts {
  /** Lowest margin % over the offer's items; null when the offer has no items. */
  minMarginPct: number | null;
  /** 1 when any item's PGL is below its live base price, else 0. */
  baseChanged: 0 | 1;
  /** Largest reduction of an item's PGL below its base, in % of the base (0 = none). */
  baseReductionPct: number;
  /** Quotation validity in hours = payment term days x 24 (0 when unset). */
  quoteValidityHours: number;
  /** 0 = within one calendar month, 1 = within one quarter, 2 = spans quarters. */
  priceValidityQuarters: number;
  /** Inclusive length of validFrom..validTo in days (0 when unset). */
  priceValidityDays: number;
  /** Sum of item values in EUR. */
  offerValueEur: number;
}

export interface OfferItemInput {
  type?: unknown;
  pgl?: unknown;
  totalValue?: unknown;
  inputs?: { marginPct?: unknown } | null;
}

export interface OfferDataInput {
  zestawienie?: unknown;
  validFrom?: unknown;
  validTo?: unknown;
  paymentTermDays?: unknown;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HOURS_PER_DAY = 24;
// Tolerance for '=' / '!=' on values that went through float arithmetic (margins, %).
const EPSILON = 1e-9;

function parseDate(value: unknown): { y: number; m: number; utc: number } | null {
  if (typeof value !== 'string') return null;
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, utc: Date.UTC(y, m - 1, d) };
}

function finite(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Price validity class and length from the offer's validFrom/validTo pair. */
export function priceValidity(validFrom: unknown, validTo: unknown): { quarters: number; days: number } {
  const from = parseDate(validFrom);
  const to = parseDate(validTo);
  if (!from || !to || to.utc < from.utc) return { quarters: 0, days: 0 };
  const days = Math.round((to.utc - from.utc) / MS_PER_DAY) + 1;
  if (from.y === to.y && from.m === to.m) return { quarters: 0, days };
  const sameQuarter = from.y === to.y && Math.ceil(from.m / 3) === Math.ceil(to.m / 3);
  return { quarters: sameQuarter ? 1 : 2, days };
}

/**
 * Facts of one offer. `baseForType` returns the live base price of a steel type (settings
 * with the quarterly override already applied). An item without a recorded margin counts as
 * 0 % - the safest reading, it forces validation rather than letting an unverifiable margin
 * through (same stance as the legacy lib/offerReview.ts).
 */
export function computeOfferFacts(
  data: OfferDataInput | null | undefined,
  baseForType: (type: string) => number
): OfferFacts {
  const items: OfferItemInput[] = Array.isArray(data?.zestawienie)
    ? (data?.zestawienie as OfferItemInput[])
    : [];

  let minMarginPct: number | null = null;
  let baseReductionPct = 0;
  let offerValueEur = 0;

  for (const item of items) {
    const margin = finite(item?.inputs?.marginPct) ?? 0;
    minMarginPct = minMarginPct === null ? margin : Math.min(minMarginPct, margin);

    const pgl = finite(item?.pgl);
    const base = typeof item?.type === 'string' ? baseForType(item.type) : 0;
    if (pgl !== null && base > 0 && pgl < base) {
      baseReductionPct = Math.max(baseReductionPct, ((base - pgl) / base) * 100);
    }

    offerValueEur += finite(item?.totalValue) ?? 0;
  }

  const termDays = finite(data?.paymentTermDays);
  const validity = priceValidity(data?.validFrom, data?.validTo);

  return {
    minMarginPct,
    baseChanged: baseReductionPct > 0 ? 1 : 0,
    baseReductionPct: round4(baseReductionPct),
    quoteValidityHours: termDays !== null && termDays > 0 ? termDays * HOURS_PER_DAY : 0,
    priceValidityQuarters: validity.quarters,
    priceValidityDays: validity.days,
    offerValueEur: round4(offerValueEur),
  };
}

/** The measured value a rule compares; null when the offer gives the rule nothing to read. */
export function factForRule(
  rule: Pick<ApprovalRule, 'criterion' | 'referenceValue'>,
  facts: OfferFacts
): number | null {
  switch (rule.criterion) {
    case 'margin_below_target':
      return facts.minMarginPct;
    case 'margin_deficit_pp':
      if (facts.minMarginPct === null || rule.referenceValue === null) return null;
      return round4(rule.referenceValue - facts.minMarginPct);
    case 'base_price_change':
      return facts.baseChanged;
    case 'base_reduction_pct':
      return facts.baseReductionPct;
    case 'quote_validity_hours':
      return facts.quoteValidityHours;
    case 'price_validity_quarters':
      return facts.priceValidityQuarters;
    case 'price_validity_days':
      return facts.priceValidityDays;
    case 'offer_value_eur':
      return facts.offerValueEur;
  }
}

export function compare(value: number, operator: Operator, threshold: number): boolean {
  switch (operator) {
    case '<':
      return value < threshold - EPSILON;
    case '<=':
      return value <= threshold + EPSILON;
    case '>':
      return value > threshold + EPSILON;
    case '>=':
      return value >= threshold - EPSILON;
    case '=':
      return Math.abs(value - threshold) <= EPSILON;
    case '!=':
      return Math.abs(value - threshold) > EPSILON;
  }
}

export type RuleOutcome = 'fired' | 'not_fired' | 'unconfigured' | 'inactive' | 'not_applicable';

export interface RuleResult {
  rule: ApprovalRule;
  value: number | null;
  outcome: RuleOutcome;
}

export interface Evaluation {
  facts: OfferFacts;
  results: RuleResult[];
  /** Highest chain level demanded by a fired rule (null = none, i.e. N0 / no validation). */
  requiredChainLevel: HierarchyLevel | null;
  /** Parallel levels (NPR) demanded by fired rules. */
  requiredParallelLevels: HierarchyLevel[];
  /** Fired rule that set requiredChainLevel (highest priority among equal levels). */
  decisiveRule: ApprovalRule | null;
}

function ruleResult(rule: ApprovalRule, facts: OfferFacts, creatorRoleId: number | null): RuleResult {
  if (!rule.isActive) return { rule, value: null, outcome: 'inactive' };
  if (rule.appliesToRoleId !== null && rule.appliesToRoleId !== creatorRoleId) {
    return { rule, value: null, outcome: 'not_applicable' };
  }
  const value = factForRule(rule, facts);
  if (rule.threshold === null) return { rule, value, outcome: 'unconfigured' };
  if (value === null) return { rule, value, outcome: 'not_fired' };
  return { rule, value, outcome: compare(value, rule.operator, rule.threshold) ? 'fired' : 'not_fired' };
}

/**
 * Evaluate `rules` (already narrowed to the offer's flow + flow-less rules) for an offer
 * created by `creatorRoleId`. A rule scoped to another creator role is 'not_applicable'.
 */
export function evaluateRules(
  rules: ApprovalRule[],
  facts: OfferFacts,
  levels: HierarchyLevel[],
  creatorRoleId: number | null
): Evaluation {
  const levelById = new Map(levels.map((l) => [l.id, l]));
  const ordered = [...rules].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const results = ordered.map((rule) => ruleResult(rule, facts, creatorRoleId));

  let requiredChainLevel: HierarchyLevel | null = null;
  let decisiveRule: ApprovalRule | null = null;
  const parallel = new Map<number, HierarchyLevel>();

  for (const { rule, outcome } of results) {
    if (outcome !== 'fired') continue;
    const level = levelById.get(rule.targetLevelId);
    if (!level) continue;
    if (level.kind === 'parallel') {
      parallel.set(level.id, level);
      continue;
    }
    const rank = level.chainRank ?? 0;
    // N0 as a target means "no validation" - it never raises the requirement.
    if (rank <= 0) continue;
    const currentRank = requiredChainLevel?.chainRank ?? 0;
    const outranks = rank > currentRank;
    const tieWithHigherPriority =
      rank === currentRank && decisiveRule !== null && rule.priority > decisiveRule.priority;
    if (outranks || tieWithHigherPriority) {
      requiredChainLevel = level;
      decisiveRule = rule;
    }
  }

  return {
    facts,
    results,
    requiredChainLevel,
    requiredParallelLevels: [...parallel.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    decisiveRule,
  };
}

/** Active rules whose threshold is still empty - the spec's configuration completeness control. */
export function unconfiguredRules(rules: ApprovalRule[]): ApprovalRule[] {
  return rules.filter((r) => r.isActive && r.threshold === null);
}
