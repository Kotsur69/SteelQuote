// Approval routing (pure). Turns a rule evaluation into the approval steps an offer needs in
// its flow, applying the confirmed decisions (docs/flows-v2-plan.md):
//   - only the required level approves (no walk N+1 -> N+2)
//   - a parallel level (NPR) is an extra step, approved independently of the chain step
//   - steps at or below the creator's own level are auto-satisfied
//   - a creator who may approve but not submit (HoP, CEO) validates their own offers
//   - a level the flow has no approver for is a configuration conflict (test T5), resolved by
//     the admin-chosen policy
// Every decision reads configuration (levels, flow roles, permissions) - no role names.

import type { ConflictPolicy, FlowRole, HierarchyLevel } from './types';
import type { Evaluation } from './ruleEngine';

export type StepTrack = 'chain' | 'parallel';

export interface PlannedStep {
  track: StepTrack;
  /** Level that must approve, after conflict escalation. */
  level: HierarchyLevel;
  /** Level the rules demanded. */
  requiredLevel: HierarchyLevel;
  escalated: boolean;
}

export interface LevelConflict {
  requiredLevel: HierarchyLevel;
  /** Where the policy sent it; null when blocked or nowhere to escalate. */
  resolvedLevel: HierarchyLevel | null;
}

export type NoValidationReason = 'no_rule_fired' | 'creator_level' | 'self_validating' | 'superuser';

export interface ApprovalPlan {
  steps: PlannedStep[];
  /** Steps the rules demanded but the creator's own level already covers. */
  autoSatisfied: PlannedStep[];
  conflicts: LevelConflict[];
  /** True when a conflict could not be resolved (policy 'block', or no approver at all). */
  blocked: boolean;
  /** Set when no step remains and nothing is blocked. */
  noValidationReason: NoValidationReason | null;
}

export interface Creator {
  isSuperuser: boolean;
  /** The creator's role in the offer's flow; null when they hold none there. */
  flowRole: FlowRole | null;
}

/** Chain levels (rank > 0) that have at least one role allowed to approve in the flow. */
export function approverChainLevels(flowRoles: FlowRole[]): HierarchyLevel[] {
  const byId = new Map<number, HierarchyLevel>();
  for (const fr of flowRoles) {
    if (!fr.permissions.canApproveReject) continue;
    if (fr.level.kind !== 'chain' || (fr.level.chainRank ?? 0) <= 0) continue;
    byId.set(fr.level.id, fr.level);
  }
  return [...byId.values()].sort((a, b) => (a.chainRank ?? 0) - (b.chainRank ?? 0));
}

function hasApproverAt(flowRoles: FlowRole[], level: HierarchyLevel): boolean {
  return flowRoles.some((fr) => fr.permissions.canApproveReject && fr.level.id === level.id);
}

function escalate(
  required: HierarchyLevel,
  chain: HierarchyLevel[],
  policy: ConflictPolicy
): HierarchyLevel | null {
  if (policy === 'block' || chain.length === 0) return null;
  const top = chain[chain.length - 1];
  if (policy === 'escalate_top' || required.kind === 'parallel') return top;
  const rank = required.chainRank ?? 0;
  return chain.find((l) => (l.chainRank ?? 0) > rank) ?? top;
}

function resolveStep(
  track: StepTrack,
  required: HierarchyLevel,
  flowRoles: FlowRole[],
  chain: HierarchyLevel[],
  policy: ConflictPolicy,
  conflicts: LevelConflict[]
): PlannedStep | null {
  if (hasApproverAt(flowRoles, required)) {
    return { track, level: required, requiredLevel: required, escalated: false };
  }
  const resolved = escalate(required, chain, policy);
  conflicts.push({ requiredLevel: required, resolvedLevel: resolved });
  return resolved ? { track, level: resolved, requiredLevel: required, escalated: true } : null;
}

function coveredByCreator(step: PlannedStep, creator: FlowRole | null): boolean {
  if (!creator) return false;
  if (step.level.kind === 'parallel') return creator.level.id === step.level.id;
  return creator.level.kind === 'chain' && (creator.level.chainRank ?? 0) >= (step.level.chainRank ?? 0);
}

/** Whether an existing step at `held` covers a fresh demand at `wanted` (same level, or a higher chain level). */
function levelCovers(held: HierarchyLevel, wanted: HierarchyLevel): boolean {
  if (held.id === wanted.id) return true;
  return held.kind === 'chain' && wanted.kind === 'chain' && (held.chainRank ?? 0) >= (wanted.chainRank ?? 0);
}

/**
 * Fresh plan steps the offer's current round does not cover. `roundLevels` are the levels of
 * its pending and approved steps. A non-empty result means the stored steps were planned
 * against older rules or data, so a lower level would sign off what now needs a higher one.
 * A plan that needs less than the stored steps is not a gap: the higher approver still decides.
 */
export function uncoveredSteps(plan: ApprovalPlan, roundLevels: HierarchyLevel[]): PlannedStep[] {
  return plan.steps.filter((s) => !roundLevels.some((held) => levelCovers(held, s.level)));
}

export function planApproval(
  evaluation: Evaluation,
  flowRoles: FlowRole[],
  creator: Creator,
  policy: ConflictPolicy
): ApprovalPlan {
  const chain = approverChainLevels(flowRoles);
  const conflicts: LevelConflict[] = [];
  const demanded: PlannedStep[] = [];
  let unresolved = false;

  const wanted: { track: StepTrack; level: HierarchyLevel }[] = [
    ...(evaluation.requiredChainLevel
      ? [{ track: 'chain' as const, level: evaluation.requiredChainLevel }]
      : []),
    ...evaluation.requiredParallelLevels.map((level) => ({ track: 'parallel' as const, level })),
  ];

  for (const w of wanted) {
    const step = resolveStep(w.track, w.level, flowRoles, chain, policy, conflicts);
    if (!step) {
      unresolved = true;
      continue;
    }
    // An escalated parallel step may land on the chain step's level - one approval covers both.
    if (!demanded.some((d) => d.level.id === step.level.id)) demanded.push(step);
  }

  if (demanded.length === 0 && !unresolved) {
    return { steps: [], autoSatisfied: [], conflicts, blocked: false, noValidationReason: 'no_rule_fired' };
  }
  if (creator.isSuperuser) {
    return { steps: [], autoSatisfied: demanded, conflicts, blocked: false, noValidationReason: 'superuser' };
  }
  const perms = creator.flowRole?.permissions;
  if (perms && perms.canApproveReject && !perms.canSubmitToValidation) {
    return { steps: [], autoSatisfied: demanded, conflicts, blocked: false, noValidationReason: 'self_validating' };
  }

  const steps = demanded.filter((s) => !coveredByCreator(s, creator.flowRole));
  const autoSatisfied = demanded.filter((s) => coveredByCreator(s, creator.flowRole));
  const noValidationReason = steps.length === 0 && !unresolved ? 'creator_level' : null;
  return { steps, autoSatisfied, conflicts, blocked: unresolved, noValidationReason };
}
