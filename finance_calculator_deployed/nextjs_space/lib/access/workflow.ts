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
import type { AccessContext, FlowRole, HierarchyLevel } from './types';

export interface OfferAssessment {
  evaluation: Evaluation;
  plan: ApprovalPlan;
  /** Level catalogue the evaluation ran against (for codes in the snapshot). */
  levels: HierarchyLevel[];
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

export interface AssessInput {
  flowId: number;
  ownerId: number | null;
  offerData: OfferDataInput | null;
}

/**
 * Request-scoped assessor: loads levels/policies once and rules, flow roles, owners and base
 * prices once per flow / owner / quarter, so assessing a whole offer list stays a handful of
 * queries instead of several per offer. Never shared across requests - config edits apply on
 * the next request.
 */
export function createAssessor(db: Db = pool): (input: AssessInput) => Promise<OfferAssessment> {
  const memo = new Map<string, Promise<unknown>>();
  function once<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!memo.has(key)) memo.set(key, load());
    return memo.get(key) as Promise<T>;
  }
  return async (input) => {
    const validFrom = typeof input.offerData?.validFrom === 'string' ? input.offerData.validFrom.slice(0, 7) : '';
    const [rules, levels, flowRoles, policies, creator, baseFor] = await Promise.all([
      once(`rules:${input.flowId}`, () => loadRulesForFlow(input.flowId, db)),
      once('levels', () => loadLevels(db)),
      once(`roles:${input.flowId}`, () => loadFlowRoles(input.flowId, db)),
      once('policies', () => loadPolicies(db)),
      once(`owner:${input.ownerId}:${input.flowId}`, () => ownerFlowRole(input.ownerId, input.flowId, db)),
      once(`base:${validFrom}`, () => loadBaseResolver(input.offerData?.validFrom, db)),
    ]);
    const facts = computeOfferFacts(input.offerData, baseFor);
    const evaluation = evaluateRules(rules, facts, levels, creator.flowRole?.roleId ?? null);
    const plan = planApproval(evaluation, flowRoles, creator, policies.conflictPolicy);
    return { evaluation, plan, levels };
  };
}

/** Evaluate the flow's rules for one offer and plan its approval steps. */
export async function assessOffer(input: AssessInput, db: Db = pool): Promise<OfferAssessment> {
  return createAssessor(db)(input);
}

/** JSON stored in offers.validation_snapshot - what the reviewer UI explains from. */
export function snapshotOf({ evaluation, plan, levels }: OfferAssessment): Record<string, unknown> {
  const codeOf = new Map(levels.map((l) => [l.id, l.code]));
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
        targetLevel: codeOf.get(r.rule.targetLevelId) ?? null,
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

/** Whether the offer still needs (further) approval before it may go to the client. */
export function needsValidation(plan: ApprovalPlan): boolean {
  return plan.blocked || plan.steps.length > 0;
}

/**
 * Replace the offer's open steps with the plan's. Earlier pending steps become 'superseded'
 * (kept for audit). With `newRound` (a fresh submit) the decided steps of earlier rounds are
 * superseded too, so a past approval never counts for the new round.
 */
export async function replacePendingSteps(
  offerId: number,
  plan: ApprovalPlan,
  db: Db,
  newRound = false
): Promise<void> {
  await db.query(
    `UPDATE offer_approval_steps SET status = 'superseded'
     WHERE offer_id = $1 AND ${newRound ? "status <> 'superseded'" : "status = 'pending'"}`,
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
  return (await loadStepsForOffers([offerId], db)).get(offerId) ?? [];
}

/** Live (non-superseded) steps of many offers in one query, keyed by offer id. */
export async function loadStepsForOffers(offerIds: number[], db: Db = pool): Promise<Map<number, StepRow[]>> {
  const byOffer = new Map<number, StepRow[]>();
  if (offerIds.length === 0) return byOffer;
  const result = await db.query(
    `SELECT s.id, s.offer_id, s.track, s.level_id, l.code AS level_code,
            s.required_level_id, rl.code AS required_level_code, s.status,
            s.decided_by, COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) AS decided_by_name,
            s.decided_at, s.comment
     FROM offer_approval_steps s
     JOIN hierarchy_levels l  ON l.id = s.level_id
     JOIN hierarchy_levels rl ON rl.id = s.required_level_id
     LEFT JOIN users u ON u.id = s.decided_by
     WHERE s.offer_id = ANY($1::int[]) AND s.status <> 'superseded'
     ORDER BY s.id`,
    [offerIds]
  );
  const rows: StepRow[] = result.rows.map((row) => ({
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
  for (const row of rows) {
    const list = byOffer.get(row.offerId) ?? [];
    list.push(row);
    byOffer.set(row.offerId, list);
  }
  return byOffer;
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
  // Nobody decides their own offer - not even the superuser (separation of duties).
  if (ownerId === ctx.userId) return [];
  const pending = steps.filter((s) => s.status === 'pending');
  if (ctx.isSuperuser) return pending;
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

/** Whether this user decided (approved or rejected) a step of the offer. */
export function decidedByUser(ctx: AccessContext, steps: StepRow[]): boolean {
  return steps.some((s) => (s.status === 'approved' || s.status === 'rejected') && s.decidedBy === ctx.userId);
}

// --- Per-offer actions ----------------------------------------------------------------------

export type OfferStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'sent';

export interface OfferActions {
  canEdit: boolean;
  canSubmit: boolean;
  /** Send to the client now (directly from draft, or an approved offer). */
  canSend: boolean;
  /** Approve / reject: holds a pending step's level in the offer's flow. */
  canReview: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  /** Record the client's decision on a sent offer. */
  canRecordDecision: boolean;
  /** The offer goes to the client without validation (rules + creator level). */
  needsValidation: boolean;
}

export interface OfferForActions {
  userId: number | null;
  flowId: number;
  status: OfferStatus;
  /** false for an older version of the offer family - read-only, only duplicable. */
  isLatest: boolean;
}

/**
 * What the user may do with an offer, computed from configuration only. Used by the list and
 * detail APIs for the UI AND re-derived by every mutating route, so the buttons a user sees
 * and what the server accepts never disagree. `plan` is the fresh assessment (null for a sent
 * offer, which is read-only).
 */
export function offerActions(
  ctx: AccessContext,
  offer: OfferForActions,
  steps: StepRow[],
  plan: ApprovalPlan | null
): OfferActions {
  const isOwner = offer.userId === ctx.userId;
  const perms = ctx.memberships.find((m) => m.flowId === offer.flowId)?.permissions;
  const su = ctx.isSuperuser;
  const live = offer.isLatest;
  const ownerMayCreate = su || perms?.canCreateOffer === true;
  const editableByOwner = offer.status === 'draft' || offer.status === 'rejected' || offer.status === 'approved';
  const reviewer =
    live && offer.status === 'pending_review' && isCurrentReviewer(ctx, steps, offer.flowId, offer.userId);
  const validation = plan ? needsValidation(plan) : false;
  const open = offer.status === 'draft' || offer.status === 'rejected';
  const ownerSends = live && isOwner && open && !validation && ownerMayCreate;
  // An approver may send on the owner's behalf only while they still hold the approve
  // permission in that flow.
  const approverSends = approvedByUser(ctx, steps) && (su || perms?.canApproveReject === true);
  const approvedSends = live && offer.status === 'approved' && ((isOwner && ownerMayCreate) || su || approverSends);

  return {
    canEdit:
      live && offer.status !== 'sent' &&
      (su || reviewer || (isOwner && editableByOwner && perms?.canEditOwnBeforeSubmit === true)),
    canSubmit: live && isOwner && open && validation && (su || perms?.canSubmitToValidation === true),
    canSend: ownerSends || approvedSends,
    canReview: reviewer,
    // Once in review (or past it) the approval trail must stay - only open offers are deletable.
    canDelete: live && isOwner && open,
    canDuplicate: isOwner,
    canRecordDecision: offer.status === 'sent' && (isOwner || su || decidedByUser(ctx, steps)),
    needsValidation: validation,
  };
}
