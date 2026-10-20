// Spec test cases T1-T5 (SYMULATOR sheet) plus the routing decisions confirmed for v2.0,
// against an in-memory copy of the seeded configuration (migrations 025-027).
import { describe, expect, it } from 'vitest';
import { computeOfferFacts, evaluateRules, priceValidity, type ApprovalRule } from '@/lib/access/ruleEngine';
import { planApproval, uncoveredSteps, type Creator } from '@/lib/access/routing';
import { effectiveScope } from '@/lib/access/scope';
import type { FlowRole, HierarchyLevel, Permissions } from '@/lib/access/types';

const L = {
  N0: { id: 1, code: 'N0', name: 'N0', kind: 'chain', chainRank: 0, coversChainRank: null, sortOrder: 10 },
  N1: { id: 2, code: 'N+1', name: 'N+1', kind: 'chain', chainRank: 1, coversChainRank: null, sortOrder: 20 },
  N2: { id: 3, code: 'N+2', name: 'N+2', kind: 'chain', chainRank: 2, coversChainRank: null, sortOrder: 30 },
  N3: { id: 4, code: 'N+3', name: 'N+3', kind: 'chain', chainRank: 3, coversChainRank: null, sortOrder: 40 },
  // Head of Projects stands in for N+1 and N+2 (migration 030).
  NPR: { id: 5, code: 'NPR', name: 'NPR', kind: 'parallel', chainRank: null, coversChainRank: 2, sortOrder: 50 },
  N4: { id: 6, code: 'N+4', name: 'N+4', kind: 'chain', chainRank: 4, coversChainRank: null, sortOrder: 60 },
} satisfies Record<string, HierarchyLevel>;
const LEVELS = Object.values(L);

const FLOW1 = 1;
const FLOW2 = 2;

function perms(submit: boolean, approve: boolean): Permissions {
  return {
    canCreateOffer: true,
    canEditOwnBeforeSubmit: true,
    canSubmitToValidation: submit,
    canApproveReject: approve,
    canChangePglBase: approve,
    canChangePriceMargin: true,
  };
}

function role(flowId: number, roleId: number, code: string, level: HierarchyLevel, submit: boolean, approve: boolean): FlowRole {
  return { flowId, roleId, roleCode: code, roleName: code, level, permissions: perms(submit, approve) };
}

const FLOW1_ROLES: FlowRole[] = [
  role(FLOW1, 1, 'IFO', L.N0, true, false),
  role(FLOW1, 2, 'EFO', L.N0, true, false),
  role(FLOW1, 3, 'ASM', L.N1, true, true),
  role(FLOW1, 4, 'HOC', L.N2, true, true),
  role(FLOW1, 5, 'HOP', L.NPR, false, true),
  role(FLOW1, 6, 'CEO', L.N3, false, true),
];
const FLOW2_ROLES: FlowRole[] = [
  role(FLOW2, 1, 'IFO', L.N0, true, false),
  role(FLOW2, 7, 'KAM', L.N0, true, false),
  role(FLOW2, 5, 'HOP', L.NPR, false, true),
  role(FLOW2, 6, 'CEO', L.N3, false, true),
];

let nextId = 1;
function rule(flowId: number | null, criterion: ApprovalRule['criterion'], operator: ApprovalRule['operator'],
  threshold: number | null, level: HierarchyLevel, extra: Partial<ApprovalRule> = {}): ApprovalRule {
  const id = nextId++;
  return {
    id, flowId, criterion, operator, threshold, appliesToRoleId: null, conditionText: '',
    referenceValue: null, unit: '', targetLevelId: level.id, isActive: true, sortOrder: id,
    ...extra,
  };
}

// Seed of migration 026 as updated by 030 (margin N+2 = "2.1 % or lower", variant b).
const RULES: ApprovalRule[] = [
  rule(FLOW1, 'margin_below_target', '<', 4.5, L.N1),
  rule(FLOW1, 'margin_below_target', '<=', 2.1, L.N2),
  rule(FLOW1, 'margin_below_target', '<=', null, L.N3),
  rule(FLOW2, 'margin_below_target', '<', 4.5, L.NPR),
  rule(null, 'base_price_change', '=', 1, L.NPR),
  rule(FLOW1, 'base_reduction_pct', '>=', null, L.N2),
  rule(FLOW1, 'base_reduction_pct', '>=', null, L.N3),
  rule(FLOW1, 'quote_validity_hours', '>', 48, L.N2),
  rule(FLOW2, 'quote_validity_hours', '>', 48, L.NPR),
  rule(FLOW1, 'price_validity_quarters', '=', 1, L.N1),
  rule(FLOW1, 'price_validity_quarters', '>', 1, L.N2),
  rule(FLOW1, 'price_validity_days', '>=', null, L.N3),
  rule(FLOW2, 'price_validity_quarters', '=', 1, L.NPR),
  rule(FLOW2, 'price_validity_quarters', '>=', 1, L.NPR),
  rule(FLOW1, 'offer_value_eur', '>', 1_000_000, L.N2),
  rule(FLOW2, 'offer_value_eur', '>', 1_000_000, L.NPR),
];

const rulesFor = (flowId: number, extra: ApprovalRule[] = []) =>
  [...RULES, ...extra].filter((r) => r.flowId === null || r.flowId === flowId);

const BASE = 645;

interface Sample {
  margin?: number;
  pgl?: number;
  validFrom?: string;
  validTo?: string;
  value?: number;
  termDays?: number;
  hours?: number;
}

// Standard offer: margin at target, PGL at base, validity inside one month, 2-day term (48h).
function offer(s: Sample = {}) {
  return {
    zestawienie: [{ type: 'HRS', pgl: s.pgl ?? BASE, totalValue: s.value ?? 100, inputs: { marginPct: s.margin ?? 4.5 } }],
    validFrom: s.validFrom ?? '2026-10-01',
    validTo: s.validTo ?? '2026-10-30',
    paymentTermDays: s.termDays ?? 2,
    ...(s.hours !== undefined ? { quoteValidityHours: s.hours } : {}),
  };
}

function run(flowId: number, flowRoles: FlowRole[], creator: Creator, sample: Sample, extra: ApprovalRule[] = [],
  policy: 'escalate_next' | 'block' | 'escalate_top' = 'escalate_next') {
  const facts = computeOfferFacts(offer(sample), () => BASE);
  const evaluation = evaluateRules(rulesFor(flowId, extra), facts, LEVELS, creator.flowRole?.roleId ?? null);
  return { evaluation, plan: planApproval(evaluation, flowRoles, creator, policy) };
}

const IFO1: Creator = { isSuperuser: false, flowRole: FLOW1_ROLES[0] };
const IFO2: Creator = { isSuperuser: false, flowRole: FLOW2_ROLES[0] };
const stepCodes = (p: { steps: { level: HierarchyLevel }[] }) => p.steps.map((s) => s.level.code);

describe('spec test cases (SYMULATOR)', () => {
  it('T1: margin = target, base unchanged, 30 days, value 100 -> N0, no validation', () => {
    const { evaluation, plan } = run(FLOW1, FLOW1_ROLES, IFO1, {});
    expect(evaluation.requiredChainLevel).toBeNull();
    expect(plan.steps).toEqual([]);
    expect(plan.noValidationReason).toBe('no_rule_fired');
  });

  it('T2: margin below target, everything else standard -> N+1', () => {
    const { plan } = run(FLOW1, FLOW1_ROLES, IFO1, { margin: 4.0 });
    expect(stepCodes(plan)).toEqual(['N+1']);
  });

  it('T3: validity = one quarter -> N+1', () => {
    const { plan } = run(FLOW1, FLOW1_ROLES, IFO1, { validFrom: '2026-10-01', validTo: '2026-12-31' });
    expect(stepCodes(plan)).toEqual(['N+1']);
  });

  it('T4: validity beyond a quarter -> N+2', () => {
    const { plan } = run(FLOW1, FLOW1_ROLES, IFO1, { validFrom: '2026-10-01', validTo: '2027-01-31' });
    expect(stepCodes(plan)).toEqual(['N+2']);
  });

  it('T4: value above 1000K EUR -> N+2, and MAX over rules with a margin N+1', () => {
    const { plan } = run(FLOW1, FLOW1_ROLES, IFO1, { value: 1_500_000, margin: 4.0 });
    expect(stepCodes(plan)).toEqual(['N+2']);
  });

  it('T5: a Flow 2 rule to N+2 (nobody on N+2) goes to Head of Projects, not a conflict', () => {
    const extra = [rule(FLOW2, 'offer_value_eur', '>', 50, L.N2)];
    const { plan } = run(FLOW2, FLOW2_ROLES, IFO2, { value: 100 }, extra);
    expect(stepCodes(plan)).toEqual(['NPR']);
    expect(plan.steps[0].requiredLevel.code).toBe('N+2');
    expect(plan.steps[0].escalated).toBe(false);
    expect(plan.conflicts).toEqual([]);
  });

  it('T5: a Flow 2 rule to N+1 also goes to Head of Projects; N+3 goes to CEO', () => {
    const n1 = [rule(FLOW2, 'offer_value_eur', '>', 50, L.N1)];
    const n3 = [rule(FLOW2, 'offer_value_eur', '>', 50, L.N3)];
    expect(stepCodes(run(FLOW2, FLOW2_ROLES, IFO2, { value: 100 }, n1).plan)).toEqual(['NPR']);
    expect(stepCodes(run(FLOW2, FLOW2_ROLES, IFO2, { value: 100 }, n3).plan)).toEqual(['N+3']);
  });

  it('T5: a level nobody covers escalates to the next existing level, or blocks', () => {
    const extra = [rule(FLOW1, 'offer_value_eur', '>', 50, L.N4)];
    const { plan } = run(FLOW1, FLOW1_ROLES, IFO1, { value: 100 }, extra);
    expect(stepCodes(plan)).toEqual(['N+3']);
    expect(plan.steps[0].escalated).toBe(true);
    expect(plan.conflicts[0].requiredLevel.code).toBe('N+4');
    const blocked = run(FLOW1, FLOW1_ROLES, IFO1, { value: 100 }, extra, 'block').plan;
    expect(blocked.blocked).toBe(true);
    expect(blocked.steps).toEqual([]);
  });
});

describe('confirmed routing decisions', () => {
  // Worked example (variant b), target 4.5 %: 4.0 % -> N+1; 2.4 % -> still N+1 (the old
  // deficit reading 4.5 - 2.4 = 2.1 pp made it N+2); 2.1 % -> N+2; 2.0 % -> N+2.
  it('margin 2.1 % or lower goes to N+2, anything else below 4.5 % to N+1', () => {
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { margin: 4.0 }).plan)).toEqual(['N+1']);
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { margin: 2.4 }).plan)).toEqual(['N+1']);
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { margin: 2.1 }).plan)).toEqual(['N+2']);
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { margin: 2.0 }).plan)).toEqual(['N+2']);
  });

  it('a base cut with a margin N+1 / N+2 is one approval: Head of Projects alone', () => {
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { pgl: 600, margin: 4.0 }).plan)).toEqual(['NPR']);
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { pgl: 600, margin: 2.0 }).plan)).toEqual(['NPR']);
  });

  it('a base cut with an N+3 requirement still needs CEO next to Head of Projects', () => {
    const extra = [rule(FLOW1, 'offer_value_eur', '>', 50, L.N3)];
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { pgl: 600, value: 100 }, extra).plan)).toEqual(['N+3', 'NPR']);
  });

  it('quotation validity hours: 24h and 48h need no approval, over 48h goes to N+2 / NPR', () => {
    // A 30-day client payment term no longer counts as 720h validity.
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { termDays: 30, hours: 24 }).plan)).toEqual([]);
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { termDays: 30, hours: 48 }).plan)).toEqual([]);
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { termDays: 30, hours: 49 }).plan)).toEqual(['N+2']);
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { termDays: 30, hours: 72 }).plan)).toEqual(['N+2']);
    expect(stepCodes(run(FLOW2, FLOW2_ROLES, IFO2, { termDays: 30, hours: 48 }).plan)).toEqual([]);
    expect(stepCodes(run(FLOW2, FLOW2_ROLES, IFO2, { termDays: 30, hours: 72 }).plan)).toEqual(['NPR']);
  });

  it('legacy offer without hours: validity over 48h (payment term > 2 days) goes to N+2 in Flow 1', () => {
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { termDays: 7 }).plan)).toEqual(['N+2']);
  });

  it('Flow 2 rules route to NPR', () => {
    expect(stepCodes(run(FLOW2, FLOW2_ROLES, IFO2, { margin: 4.0 }).plan)).toEqual(['NPR']);
  });

  it('a creator whose own level covers the requirement sends directly', () => {
    const asm: Creator = { isSuperuser: false, flowRole: FLOW1_ROLES[2] };
    const { plan } = run(FLOW1, FLOW1_ROLES, asm, { margin: 4.0 });
    expect(plan.steps).toEqual([]);
    expect(plan.noValidationReason).toBe('creator_level');
  });

  it('an approver who may not submit (HoP) validates their own offers', () => {
    const hop: Creator = { isSuperuser: false, flowRole: FLOW1_ROLES[4] };
    const { plan } = run(FLOW1, FLOW1_ROLES, hop, { margin: 1.0, pgl: 600 });
    expect(plan.steps).toEqual([]);
    expect(plan.noValidationReason).toBe('self_validating');
  });

  it('an item without a recorded margin is treated as 0 %', () => {
    const facts = computeOfferFacts({ zestawienie: [{ type: 'HRS', pgl: BASE, totalValue: 1 }] }, () => BASE);
    expect(facts.minMarginPct).toBe(0);
  });
});

describe('stale approval steps (rules or data changed after submit)', () => {
  // Worked example: submitted at margin 4.0 % -> N+1 step stored. The offer now has 2.0 %
  // -> N+2. ASM (N+1) must not sign that off.
  it('a stored N+1 step does not cover a fresh N+2 demand', () => {
    const { plan } = run(FLOW1, FLOW1_ROLES, IFO1, { margin: 2.0 });
    expect(uncoveredSteps(plan, [L.N1]).map((s) => s.level.code)).toEqual(['N+2']);
  });

  it('a stored higher chain step covers a lower fresh demand (no downgrade)', () => {
    const { plan } = run(FLOW1, FLOW1_ROLES, IFO1, { margin: 4.0 });
    expect(uncoveredSteps(plan, [L.N2])).toEqual([]);
  });

  it('a chain step never covers a parallel NPR demand', () => {
    const { plan } = run(FLOW1, FLOW1_ROLES, IFO1, { pgl: 600, margin: 2.0 });
    expect(uncoveredSteps(plan, [L.N3]).map((s) => s.level.code)).toEqual(['NPR']);
  });

  it('an approved NPR step covers a fresh N+2 demand (Head of Projects stands in)', () => {
    const { plan } = run(FLOW1, FLOW1_ROLES, IFO1, { margin: 2.0 });
    expect(uncoveredSteps(plan, [L.NPR])).toEqual([]);
  });
});

describe('fail-safe facts (review findings)', () => {
  it('missing, reversed or impossible validity dates count as the worst case', () => {
    expect(priceValidity(undefined, undefined).quarters).toBe(2);
    expect(priceValidity('2026-10-31', '2026-10-01').quarters).toBe(2);
    expect(priceValidity('2026-02-30', '2026-03-10').quarters).toBe(2);
    expect(priceValidity('2026-12-15', '2027-01-15')).toEqual({ quarters: 2, days: 32 });
  });

  it('a PGL within float noise of the base is not a base change', () => {
    const facts = computeOfferFacts(offer({ pgl: BASE - 1e-12 }), () => BASE);
    expect(facts.baseChanged).toBe(0);
    expect(facts.baseReductionPct).toBe(0);
  });

  it('a zeroed line total cannot hide the offer value', () => {
    const data = { ...offer(), zestawienie: [{ type: 'HRS', pgl: BASE, totalValue: 0, finalPrice: 2000, tons: 600, inputs: { marginPct: 4.5 } }] };
    expect(computeOfferFacts(data, () => BASE).offerValueEur).toBe(1_200_000);
  });

  it('an escalated parallel step landing on the chain level is one approval', () => {
    // Flow 2 without HoP: N+2 and NPR both escalate to the top chain level (CEO N+3).
    const noHop = FLOW2_ROLES.filter((r) => r.roleCode !== 'HOP');
    const extra = [rule(FLOW2, 'offer_value_eur', '>', 50, L.N2)];
    const { plan } = run(FLOW2, noHop, IFO2, { margin: 4.0, value: 100 }, extra);
    expect(stepCodes(plan)).toEqual(['N+3']);
  });

  it('a rule scoped to another creator role does not apply', () => {
    const scoped = [rule(FLOW1, 'offer_value_eur', '>', 50, L.N2, { appliesToRoleId: 2 })];
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, {}, scoped).plan)).toEqual([]);
  });
});

describe('effective scope (WIDOCZNOSC formula)', () => {
  const flags = (o: Partial<Record<string, boolean>>) => ({
    seeOwn: false, seeTeam: false, seeBranch: false, seeRegion: false,
    seeAllInFlow: false, seeAllFlows: false, seeAwaitingMyReview: false, ...o,
  });
  it('maps the sheet rows', () => {
    expect(effectiveScope(flags({ seeOwn: true, seeTeam: true, seeBranch: true }))).toBe('branch');
    expect(effectiveScope(flags({ seeOwn: true, seeRegion: true, seeAwaitingMyReview: true }))).toBe('region');
    expect(effectiveScope(flags({ seeAllFlows: true }))).toBe('allFlows');
    expect(effectiveScope(flags({ seeAwaitingMyReview: true }))).toBe('reviewQueueOnly');
    expect(effectiveScope(flags({}))).toBe('none');
  });
});
