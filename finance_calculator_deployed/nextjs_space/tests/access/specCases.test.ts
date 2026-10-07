// Spec test cases T1-T5 (SYMULATOR sheet) plus the routing decisions confirmed for v2.0,
// against an in-memory copy of the seeded configuration (migrations 025-027).
import { describe, expect, it } from 'vitest';
import { computeOfferFacts, evaluateRules, type ApprovalRule } from '@/lib/access/ruleEngine';
import { planApproval, type Creator } from '@/lib/access/routing';
import { effectiveScope } from '@/lib/access/scope';
import type { FlowRole, HierarchyLevel, Permissions } from '@/lib/access/types';

const L = {
  N0: { id: 1, code: 'N0', name: 'N0', kind: 'chain', chainRank: 0, sortOrder: 10 },
  N1: { id: 2, code: 'N+1', name: 'N+1', kind: 'chain', chainRank: 1, sortOrder: 20 },
  N2: { id: 3, code: 'N+2', name: 'N+2', kind: 'chain', chainRank: 2, sortOrder: 30 },
  N3: { id: 4, code: 'N+3', name: 'N+3', kind: 'chain', chainRank: 3, sortOrder: 40 },
  NPR: { id: 5, code: 'NPR', name: 'NPR', kind: 'parallel', chainRank: null, sortOrder: 50 },
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
  role(FLOW2, 6, 'CEO', L.N2, false, true),
];

let nextId = 1;
function rule(flowId: number | null, criterion: ApprovalRule['criterion'], operator: ApprovalRule['operator'],
  threshold: number | null, level: HierarchyLevel, extra: Partial<ApprovalRule> = {}): ApprovalRule {
  const id = nextId++;
  return {
    id, flowId, criterion, operator, threshold, appliesToRoleId: null, conditionText: '',
    referenceValue: null, unit: '', priority: 10, targetLevelId: level.id, isActive: true, sortOrder: id,
    ...extra,
  };
}

// Seed of migration 026.
const RULES: ApprovalRule[] = [
  rule(FLOW1, 'margin_below_target', '<', 4.5, L.N1),
  rule(FLOW1, 'margin_deficit_pp', '>=', 2.1, L.N2, { referenceValue: 4.5, priority: 20 }),
  rule(FLOW1, 'margin_deficit_pp', '>=', null, L.N3, { referenceValue: 4.5, priority: 30 }),
  rule(FLOW2, 'margin_below_target', '<', 4.5, L.NPR),
  rule(null, 'base_price_change', '=', 1, L.NPR),
  rule(FLOW1, 'base_reduction_pct', '>=', null, L.N2),
  rule(FLOW1, 'base_reduction_pct', '>=', null, L.N3),
  rule(FLOW1, 'quote_validity_hours', '>', 48, L.N2),
  rule(FLOW2, 'quote_validity_hours', '>', 48, L.NPR),
  rule(FLOW1, 'price_validity_quarters', '=', 1, L.N1),
  rule(FLOW1, 'price_validity_quarters', '>', 1, L.N2, { priority: 30 }),
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
}

// Standard offer: margin at target, PGL at base, validity inside one month, 2-day term (48h).
function offer(s: Sample = {}) {
  return {
    zestawienie: [{ type: 'HRS', pgl: s.pgl ?? BASE, totalValue: s.value ?? 100, inputs: { marginPct: s.margin ?? 4.5 } }],
    validFrom: s.validFrom ?? '2026-10-01',
    validTo: s.validTo ?? '2026-10-30',
    paymentTermDays: s.termDays ?? 2,
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

  it('T5: Flow 2 rule set to N+3 escalates to the next existing level (CEO N+2)', () => {
    const extra = [rule(FLOW2, 'offer_value_eur', '>', 50, L.N3)];
    const { plan } = run(FLOW2, FLOW2_ROLES, IFO2, { value: 100 }, extra);
    expect(stepCodes(plan)).toEqual(['N+2']);
    expect(plan.steps[0].escalated).toBe(true);
    expect(plan.conflicts[0].requiredLevel.code).toBe('N+3');
  });

  it('T5: with the block policy the conflict blocks submission', () => {
    const extra = [rule(FLOW2, 'offer_value_eur', '>', 50, L.N3)];
    const { plan } = run(FLOW2, FLOW2_ROLES, IFO2, { value: 100 }, extra, 'block');
    expect(plan.blocked).toBe(true);
    expect(plan.steps).toEqual([]);
  });
});

describe('confirmed routing decisions', () => {
  it('margin deficit >= 2.1 pp below the 4.5 % target goes to N+2', () => {
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { margin: 2.4 }).plan)).toEqual(['N+2']);
    expect(stepCodes(run(FLOW1, FLOW1_ROLES, IFO1, { margin: 2.5 }).plan)).toEqual(['N+1']);
  });

  it('base price below base adds a parallel NPR step next to the chain step', () => {
    const { plan } = run(FLOW1, FLOW1_ROLES, IFO1, { pgl: 600, margin: 2.0 });
    expect(stepCodes(plan)).toEqual(['N+2', 'NPR']);
  });

  it('quotation validity over 48h (payment term > 2 days) goes to N+2 in Flow 1', () => {
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
