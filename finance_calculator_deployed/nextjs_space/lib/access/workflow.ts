// Offer approval workflow on top of the configurable model (server only). Glue between the
// pure engine (ruleEngine + routing) and the offer_approval_steps table (migration 028).
//
// The creator of an offer is always its OWNER (offers.user_id), also when a reviewer edits it:
// a reviewer's edit re-runs the rules for the owner, so it can push the offer to a higher
// level but never lowers what the owner's offer needs.

import pool from '../db';
import {
  FLOW_ROLE_JOINS,
  FLOW_ROLE_SELECT,
  flowRoleFromRow,
  loadBaseResolver,
  loadFlowRoles,
  loadLevels,
  loadPolicies,
  loadRulesForFlow,
  type Db,
} from './config';
import { computeOfferFacts, evaluateRules, type Evaluation, type OfferDataInput } from './ruleEngine';
import { planApproval, type ApprovalPlan } from './routing';
import type { AccessContext, FlowRole } from './types';

export interface OfferAssessment {
  evaluation: Evaluation;
  plan: ApprovalPlan;
}

async function ownerFlowRole(ownerId: number | null, flowId: number, db: Db): Promise<{
  isSuperuser: boolean;
  flowRole: FlowRole | null;
}> {
  if (ownerId === null) return { isSuperuser: false, flowRole: null };
  const userResult = await db.query(`SELECT is_superuser FROM users WHERE id = $1`, [ownerId]);
  const roleResult = await db.query(
    `SELECT ${FLOW_ROLE_SELECT}
     FROM user_flow_roles m
     JOIN flow_roles fr ON fr.flow_id = m.flow_id AND fr.role_id = m.role_id
     ${FLOW_ROLE_JOINS}
     WHERE m.user_id = $1 AND m.flow_id = $2`,
    [ownerId, flowId]
  );
  return {
    isSuperuser: userResult.rows[0]?.is_superuser === true,
    flowRole: roleResult.rows.length > 0 ? flowRoleFromRow(roleResult.rows[0]) : null,
  };
}

/** Evaluate the flow's rules for an offer and plan its approval steps. */
export async function assessOffer(
  input: { flowId: number; ownerId: number | null; offerData: OfferDataInput | null },
  db: Db = pool
): Promise<OfferAssessment> {
  const [rules, levels, flowRoles, policies, creator, baseFor] = await Promise.all([
    loadRulesForFlow(input.flowId, db),
    loadLevels(db),
    loadFlowRoles(input.flowId, db),
    loadPolicies(db),
    ownerFlowRole(input.ownerId, input.flowId, db),
    loadBaseResolver(input.offerData?.validFrom, db),
  ]);
  const facts = computeOfferFacts(input.offerData, baseFor);
  const evaluation = evaluateRules(rules, facts, levels, creator.flowRole?.roleId ?? null);
  const plan = planApproval(evaluation, flowRoles, creator, policies.conflictPolicy);
  return { evaluation, plan };
}

/** JSON stored in offers.validation_snapshot - what the reviewer UI explains from. */
export function snapshotOf({ evaluation, plan }: OfferAssessment): Record<string, unknown> {
  return {
    evaluatedAt: new Date().toISOString(),
    facts: evaluation.facts,
    fired: evaluation.results
      .filter((r) => r.outcome === 'fired')
      .map((r) => ({
        ruleId: r.rule.id,
        criterion: r.rule.criterion,
        conditionText: r.rule.conditionText,
        operator: r.rule.operator,
        threshold: r.rule.threshold,
        unit: r.rule.unit,
        value: r.value,
        targetLevelId: r.rule.targetLevelId,
      })),
    requiredChainLevel: evaluation.requiredChainLevel?.code ?? null,
    requiredParallelLevels: evaluation.requiredParallelLevels.map((l) => l.code),
    steps: plan.steps.map((s) => ({
      track: s.track,
      level: s.level.code,
      requiredLevel: s.requiredLevel.code,
      escalated: s.escalated,
    })),
    autoSatisfied: plan.autoSatisfied.map((s) => s.level.code),
    conflicts: plan.conflicts.map((c) => ({
      requiredLevel: c.requiredLevel.code,
      resolvedLevel: c.resolvedLevel?.code ?? null,
    })),
    blocked: plan.blocked,
    noValidationReason: plan.noValidationReason,
  };
}

/** Whether the offer may go to the client without any (further) approval. */
export function needsValidation(plan: ApprovalPlan): boolean {
  return plan.blocked || plan.steps.length > 0;
}

/**
 * Replace the offer's open steps with the plan's. Earlier pending steps become 'superseded'
 * (kept for audit); decided steps are left as they are.
 */
export async function replacePendingSteps(offerId: number, plan: ApprovalPlan, db: Db): Promise<void> {
  await db.query(
    `UPDATE offer_approval_steps SET status = 'superseded' WHERE offer_id = $1 AND status = 'pending'`,
    [offerId]
  );
  for (const step of plan.steps) {
    await db.query(
      `INSERT INTO offer_approval_steps (offer_id, track, level_id, required_level_id)
       VALUES ($1, $2, $3, $4)`,
      [offerId, step.track, step.level.id, step.requiredLevel.id]
    );
  }
}

export interface StepRow {
  id: number;
  offerId: number;
  track: 'chain' | 'parallel';
  levelId: number;
  levelCode: string;
  requiredLevelId: number;
  requiredLevelCode: string;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  decidedBy: number | null;
  decidedByName: string | null;
  decidedAt: string | null;
  comment: string | null;
}

export async function loadSteps(offerId: number, db: Db = pool): Promise<StepRow[]> {
  const result = await db.query(
    `SELECT s.id, s.offer_id, s.track, s.level_id, l.code AS level_code,
            s.required_level_id, rl.code AS required_level_code, s.status,
            s.decided_by, COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) AS decided_by_name,
            s.decided_at, s.comment
     FROM offer_approval_steps s
     JOIN hierarchy_levels l  ON l.id = s.level_id
     JOIN hierarchy_levels rl ON rl.id = s.required_level_id
     LEFT JOIN users u ON u.id = s.decided_by
     WHERE s.offer_id = $1 AND s.status <> 'superseded'
     ORDER BY s.id`,
    [offerId]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    offerId: Number(row.offer_id),
    track: row.track,
    levelId: Number(row.level_id),
    levelCode: String(row.level_code),
    requiredLevelId: Number(row.required_level_id),
    requiredLevelCode: String(row.required_level_code),
    status: row.status,
    decidedBy: row.decided_by === null ? null : Number(row.decided_by),
    decidedByName: row.decided_by_name ?? null,
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    comment: row.comment ?? null,
  }));
}

/**
 * Pending steps this user may decide on an offer of `flowId` owned by `ownerId`: a role at
 * exactly the step's level with the approve permission in that flow. The superuser may decide
 * any pending step. Nobody decides their own offer.
 */
export function decidableSteps(
  ctx: AccessContext,
  steps: StepRow[],
  flowId: number,
  ownerId: number | null
): StepRow[] {
  const pending = steps.filter((s) => s.status === 'pending');
  if (ctx.isSuperuser) return pending;
  if (ownerId === ctx.userId) return [];
  const m = ctx.memberships.find((x) => x.flowId === flowId);
  if (!m || !m.permissions.canApproveReject) return [];
  return pending.filter((s) => s.levelId === m.level.id);
}

/** Whether this user may act as a reviewer on the offer right now (edit, approve, reject). */
export function isCurrentReviewer(
  ctx: AccessContext,
  steps: StepRow[],
  flowId: number,
  ownerId: number | null
): boolean {
  return decidableSteps(ctx, steps, flowId, ownerId).length > 0;
}

/** Whether this user approved a step of the offer - lets them send it on the owner's behalf. */
export function approvedByUser(ctx: AccessContext, steps: StepRow[]): boolean {
  return steps.some((s) => s.status === 'approved' && s.decidedBy === ctx.userId);
}
