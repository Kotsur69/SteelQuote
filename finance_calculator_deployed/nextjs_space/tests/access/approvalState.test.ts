// Round 2 decisions (questions_for_lukasz.md, 12.10.2026): who may decide a step (higher level
// as a stand-in), who sends (only the creator), and when an approval stops counting (48 h, or
// the rules got stricter).
import { describe, expect, it } from 'vitest';
import { approvalState, decidableSteps, offerActions, type StepRow } from '@/lib/access/workflow';
import type { ApprovalPlan, PlannedStep } from '@/lib/access/routing';
import type { AccessContext, HierarchyLevel, Membership, Permissions } from '@/lib/access/types';

const L = {
  N0: { id: 1, code: 'N0', name: 'N0', kind: 'chain', chainRank: 0, coversChainRank: null, sortOrder: 10 },
  N1: { id: 2, code: 'N+1', name: 'N+1', kind: 'chain', chainRank: 1, coversChainRank: null, sortOrder: 20 },
  N2: { id: 3, code: 'N+2', name: 'N+2', kind: 'chain', chainRank: 2, coversChainRank: null, sortOrder: 30 },
  N3: { id: 4, code: 'N+3', name: 'N+3', kind: 'chain', chainRank: 3, coversChainRank: null, sortOrder: 40 },
  NPR: { id: 5, code: 'NPR', name: 'NPR', kind: 'parallel', chainRank: null, coversChainRank: 2, sortOrder: 50 },
} satisfies Record<string, HierarchyLevel>;

const FLOW = 1;
const OWNER = 10;
const NOW = new Date('2026-10-12T12:00:00Z');
const POLICY = { validityHours: 48, now: NOW };
const HOUR = 60 * 60 * 1000;

const PERMS: Permissions = {
  canCreateOffer: true,
  canEditOwnBeforeSubmit: true,
  canSubmitToValidation: true,
  canApproveReject: true,
  canChangePglBase: true,
  canChangePriceMargin: true,
};

function ctx(userId: number, level: HierarchyLevel, approve = true): AccessContext {
  const m: Membership = {
    flowId: FLOW, roleId: level.id, roleCode: level.code, roleName: level.code, level,
    permissions: { ...PERMS, canApproveReject: approve },
    flowCode: 'F1', flowName: 'Flow 1', visibility: {} as Membership['visibility'],
  };
  return {
    userId, email: `u${userId}@example.com`, fullName: null, isSuperuser: false, memberships: [m],
    activeFlowId: FLOW, flows: [], teamUserIds: [], orgScopeFallback: 'team',
  };
}

let nextId = 1;
function step(level: HierarchyLevel, status: StepRow['status'], decidedHoursAgo: number | null = null): StepRow {
  return {
    id: nextId++, offerId: 1, track: level.kind, levelId: level.id, levelCode: level.code, level,
    requiredLevelId: level.id, requiredLevelCode: level.code, status,
    decidedBy: decidedHoursAgo === null ? null : 99, decidedByName: null,
    decidedAt: decidedHoursAgo === null ? null : new Date(NOW.getTime() - decidedHoursAgo * HOUR).toISOString(),
    comment: null,
  };
}

function plan(...levels: HierarchyLevel[]): ApprovalPlan {
  const steps: PlannedStep[] = levels.map((level) => ({
    track: level.kind, level, requiredLevel: level, escalated: false,
  }));
  return { steps, autoSatisfied: [], conflicts: [], blocked: false, noValidationReason: steps.length ? null : 'no_rule_fired' };
}

describe('stand-in review (2.2 / A3)', () => {
  const pendingN1 = [step(L.N1, 'pending')];

  it('a higher chain level may decide an N+1 step, a lower one may not', () => {
    expect(decidableSteps(ctx(1, L.N2), pendingN1, FLOW, OWNER)).toHaveLength(1);
    expect(decidableSteps(ctx(1, L.N3), pendingN1, FLOW, OWNER)).toHaveLength(1);
    expect(decidableSteps(ctx(1, L.N1), [step(L.N2, 'pending')], FLOW, OWNER)).toHaveLength(0);
  });

  it('Head of Projects stands in for N+1 / N+2 but not N+3; nobody else decides NPR', () => {
    expect(decidableSteps(ctx(1, L.NPR), [step(L.N2, 'pending')], FLOW, OWNER)).toHaveLength(1);
    expect(decidableSteps(ctx(1, L.NPR), [step(L.N3, 'pending')], FLOW, OWNER)).toHaveLength(0);
    expect(decidableSteps(ctx(1, L.N3), [step(L.NPR, 'pending')], FLOW, OWNER)).toHaveLength(0);
  });

  it('flags a stand-in so the UI can say only N+1 is required', () => {
    const offer = { userId: OWNER, flowId: FLOW, status: 'pending_review' as const, isLatest: true };
    expect(offerActions(ctx(1, L.N2), offer, pendingN1, plan(L.N1), POLICY).reviewAsStandIn).toBe(true);
    expect(offerActions(ctx(1, L.N1), offer, pendingN1, plan(L.N1), POLICY).reviewAsStandIn).toBe(false);
  });

  it('nobody decides their own offer', () => {
    expect(decidableSteps(ctx(OWNER, L.N3), pendingN1, FLOW, OWNER)).toHaveLength(0);
  });
});

describe('only the creator sends (2.7)', () => {
  const approved = { userId: OWNER, flowId: FLOW, status: 'approved' as const, isLatest: true };
  const steps = [step(L.N1, 'approved', 1)];

  it('the owner may send a freshly approved offer, the approver may not', () => {
    expect(offerActions(ctx(OWNER, L.N0, false), approved, steps, plan(L.N1), POLICY).canSend).toBe(true);
    expect(offerActions(ctx(1, L.N1), approved, steps, plan(L.N1), POLICY).canSend).toBe(false);
  });
});

describe('approval validity and rule changes (2.9 / 2.10)', () => {
  it('is valid for 48 h after the last approval', () => {
    const state = approvalState('approved', [step(L.N1, 'approved', 47)], plan(L.N1), POLICY);
    expect(state?.expired).toBe(false);
    expect(state?.needsRevalidation).toBe(false);
  });

  it('expires after 48 h: no send, resubmit instead', () => {
    const steps = [step(L.N1, 'approved', 49)];
    const state = approvalState('approved', steps, plan(L.N1), POLICY);
    expect(state?.expired).toBe(true);
    expect(state?.needsRevalidation).toBe(true);
    const actions = offerActions(ctx(OWNER, L.N0, false),
      { userId: OWNER, flowId: FLOW, status: 'approved', isLatest: true }, steps, plan(L.N1), POLICY);
    expect(actions.canSend).toBe(false);
    expect(actions.canSubmit).toBe(true);
  });

  it('counts from the LAST approval when several were needed', () => {
    const steps = [step(L.N3, 'approved', 60), step(L.NPR, 'approved', 2)];
    expect(approvalState('approved', steps, plan(L.N3, L.NPR), POLICY)?.expired).toBe(false);
  });

  it('stricter rules (N+1 approved, now N+2 needed) send it back to validation', () => {
    const state = approvalState('approved', [step(L.N1, 'approved', 1)], plan(L.N2), POLICY);
    expect(state?.rulesStricter).toBe(true);
    expect(state?.needsRevalidation).toBe(true);
  });

  it('relaxed rules keep the approval valid but say so', () => {
    const state = approvalState('approved', [step(L.N2, 'approved', 1)], plan(L.N1), POLICY);
    expect(state?.rulesStricter).toBe(false);
    expect(state?.rulesRelaxed).toBe(true);
    expect(state?.needsRevalidation).toBe(false);
  });

  it('an expired approval does not matter once no validation is needed any more', () => {
    expect(approvalState('approved', [step(L.N1, 'approved', 100)], plan(), POLICY)?.needsRevalidation).toBe(false);
  });

  it('in review, a stricter rule is flagged for the reviewer; the clock has not started', () => {
    const state = approvalState('pending_review', [step(L.N1, 'pending')], plan(L.N2), POLICY);
    expect(state?.rulesStricter).toBe(true);
    expect(state?.expired).toBe(false);
  });
});
