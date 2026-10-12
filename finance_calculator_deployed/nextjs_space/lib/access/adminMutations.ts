// Admin edits of the access configuration (superuser only - the route checks). Each mutation
// validates its body with zod and writes one resource. Nothing is cached, so the next request
// already runs on the new configuration (routing, queues, visibility, pyramid).

import { z } from 'zod';
import pool from '../db';
import { CRITERIA, OPERATORS } from './ruleEngine';
import type { Db } from './config';

export class MutationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const id = z.number().int().positive();
const name = z.string().trim().min(1).max(100);
const code = z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_+-]+$/);

const permissions = z.object({
  canCreateOffer: z.boolean(),
  canEditOwnBeforeSubmit: z.boolean(),
  canSubmitToValidation: z.boolean(),
  canApproveReject: z.boolean(),
  canChangePglBase: z.boolean(),
  canChangePriceMargin: z.boolean(),
});

const visibility = z.object({
  seeOwn: z.boolean(),
  seeTeam: z.boolean(),
  seeBranch: z.boolean(),
  seeRegion: z.boolean(),
  seeAllInFlow: z.boolean(),
  seeAllFlows: z.boolean(),
  seeAwaitingMyReview: z.boolean(),
});

const ruleBody = z.object({
  flowId: id.nullable(),
  criterion: z.enum(CRITERIA),
  appliesToRoleId: id.nullable(),
  conditionText: z.string().max(500),
  operator: z.enum(OPERATORS),
  threshold: z.number().finite().nullable(),
  referenceValue: z.number().finite().nullable(),
  unit: z.string().max(20),
  targetLevelId: id,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

const levelBody = z.object({
  code: z.string().trim().min(1).max(20),
  name,
  kind: z.enum(['chain', 'parallel']),
  chainRank: z.number().int().min(0).nullable(),
  coversChainRank: z.number().int().min(1).nullable().optional(),
  sortOrder: z.number().int(),
});

function checkRuleShape(rule: z.infer<typeof ruleBody>): void {
  if (rule.criterion === 'base_price_change' && rule.threshold !== null && rule.threshold !== 0 && rule.threshold !== 1) {
    throw new MutationError(400, 'Kryterium TAK/NIE przyjmuje próg 1 (TAK) albo 0 (NIE)');
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new MutationError(400, result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return result.data;
}

/** Postgres constraint violations -> 4xx with a readable message instead of a 500. */
function rethrow(error: unknown, what: string): never {
  const pgCode = (error as { code?: string }).code;
  if (pgCode === '23505') throw new MutationError(409, `${what}: taki kod już istnieje`);
  if (pgCode === '23503') throw new MutationError(409, `${what}: powiązane dane nie istnieją lub są w użyciu`);
  if (pgCode === '23514') throw new MutationError(400, `${what}: nieprawidłowa wartość`);
  throw error;
}

type Handler = (body: unknown, userId: number, db: Db) => Promise<unknown>;

async function one(db: Db, sql: string, values: unknown[], what: string): Promise<unknown> {
  try {
    const result = await db.query(sql, values);
    if (result.rows.length === 0) throw new MutationError(404, `${what}: nie znaleziono`);
    return result.rows[0];
  } catch (error) {
    if (error instanceof MutationError) throw error;
    return rethrow(error, what);
  }
}

// --- Flows ------------------------------------------------------------------------------

const createFlow: Handler = (body, _u, db) => {
  const b = parse(z.object({ code, name, sortOrder: z.number().int().optional() }), body);
  return one(db, `INSERT INTO flows (code, name, sort_order) VALUES ($1, $2, COALESCE($3, 100)) RETURNING *`,
    [b.code.toUpperCase(), b.name, b.sortOrder ?? null], 'Flow');
};

const updateFlow: Handler = (body, _u, db) => {
  const b = parse(z.object({
    id, name: name.optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().optional(),
  }), body);
  return one(db,
    `UPDATE flows SET name = COALESCE($2, name), is_active = COALESCE($3, is_active),
            sort_order = COALESCE($4, sort_order) WHERE id = $1 RETURNING *`,
    [b.id, b.name ?? null, b.isActive ?? null, b.sortOrder ?? null], 'Flow');
};

// --- Levels -----------------------------------------------------------------------------

function checkLevelShape(level: z.infer<typeof levelBody>): void {
  if ((level.kind === 'chain') !== (level.chainRank !== null)) {
    throw new MutationError(400, 'Pozycja w łańcuchu jest wymagana dokładnie dla poziomów typu chain');
  }
  if (level.kind === 'chain' && (level.coversChainRank ?? null) !== null) {
    throw new MutationError(400, 'Zastępstwo poziomów łańcucha ustawia się tylko dla poziomów równoległych');
  }
}

async function assertRankFree(db: Db, rank: number | null, exceptId: number | null): Promise<void> {
  if (rank === null) return;
  const clash = await db.query(
    `SELECT code FROM hierarchy_levels WHERE chain_rank = $1 AND ($2::int IS NULL OR id <> $2)`,
    [rank, exceptId]
  );
  if (clash.rows.length > 0) {
    throw new MutationError(409, `Pozycja ${rank} jest już zajęta przez ${clash.rows[0].code}`);
  }
}

const createLevel: Handler = async (body, _u, db) => {
  const b = parse(levelBody, body);
  checkLevelShape(b);
  await assertRankFree(db, b.chainRank, null);
  return one(db,
    `INSERT INTO hierarchy_levels (code, name, kind, chain_rank, covers_chain_rank, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.code, b.name, b.kind, b.chainRank, b.coversChainRank ?? null, b.sortOrder], 'Poziom');
};

const updateLevel: Handler = async (body, _u, db) => {
  const b = parse(levelBody.extend({ id }), body);
  checkLevelShape(b);
  // Changing chain <-> parallel would silently change what every rule and role on this level
  // means; reordering (chain_rank) is fine.
  const current = await db.query(
    `SELECT kind,
            EXISTS (SELECT 1 FROM flow_roles WHERE level_id = $1)
         OR EXISTS (SELECT 1 FROM approval_rules WHERE target_level_id = $1)
         OR EXISTS (SELECT 1 FROM offer_approval_steps WHERE level_id = $1 AND status = 'pending') AS used
     FROM hierarchy_levels WHERE id = $1`,
    [b.id]
  );
  if (current.rows[0] && current.rows[0].kind !== b.kind && current.rows[0].used) {
    throw new MutationError(409, 'Poziom jest używany przez role, reguły lub oczekujące oferty - nie można zmienić jego typu');
  }
  await assertRankFree(db, b.chainRank, b.id);
  return one(db,
    `UPDATE hierarchy_levels SET code=$2, name=$3, kind=$4, chain_rank=$5, covers_chain_rank=$6, sort_order=$7
     WHERE id=$1 RETURNING *`,
    [b.id, b.code, b.name, b.kind, b.chainRank, b.coversChainRank ?? null, b.sortOrder], 'Poziom');
};

// --- Roles ------------------------------------------------------------------------------

const createRole: Handler = (body, _u, db) => {
  const b = parse(z.object({ code, name }), body);
  return one(db, `INSERT INTO roles (code, name) VALUES ($1, $2) RETURNING *`, [b.code.toUpperCase(), b.name], 'Rola');
};

const updateRole: Handler = async (body, _u, db) => {
  const b = parse(z.object({
    id, name: name.optional(), isActive: z.boolean().optional(), multiFlow: z.boolean().optional(),
  }), body);
  if (b.multiFlow === false) {
    // Taking the flag away must not leave someone in two flows on a single-flow role.
    const spread = await db.query(
      `SELECT 1 FROM user_flow_roles m
       WHERE m.role_id = $1 AND EXISTS (SELECT 1 FROM user_flow_roles o WHERE o.user_id = m.user_id AND o.flow_id <> m.flow_id)
       LIMIT 1`,
      [b.id]
    );
    if (spread.rows.length > 0) {
      throw new MutationError(409, 'Ktoś z tą rolą pracuje w kilku flow - najpierw zostaw go w jednym');
    }
  }
  return one(db,
    `UPDATE roles SET name = COALESCE($2, name), is_active = COALESCE($3, is_active),
            multi_flow = COALESCE($4, multi_flow) WHERE id = $1 RETURNING *`,
    [b.id, b.name ?? null, b.isActive ?? null, b.multiFlow ?? null], 'Rola');
};

/** A role is deleted only while nobody holds it; otherwise it has to be deactivated. */
const deleteRole: Handler = async (body, _u, db) => {
  const b = parse(z.object({ id }), body);
  const used = await db.query(`SELECT 1 FROM user_flow_roles WHERE role_id = $1 LIMIT 1`, [b.id]);
  if (used.rows.length > 0) {
    throw new MutationError(409, 'Rola ma przypisanych użytkowników - dezaktywuj ją zamiast usuwać');
  }
  return one(db, `DELETE FROM roles WHERE id = $1 RETURNING id`, [b.id], 'Rola');
};

// --- Roles inside flows (level + permissions) -------------------------------------------

const upsertFlowRole: Handler = async (body, _u, db) => {
  const b = parse(z.object({ flowId: id, roleId: id, levelId: id, permissions }), body);
  const p = b.permissions;
  // Moving a role to another level would orphan offers waiting at the old level when this
  // role is the last approver there.
  const orphans = await db.query(
    `SELECT 1 FROM flow_roles fr
     JOIN offer_approval_steps s ON s.level_id = fr.level_id AND s.status = 'pending'
     JOIN offers o ON o.id = s.offer_id AND o.flow_id = fr.flow_id
     WHERE fr.flow_id = $1 AND fr.role_id = $2 AND fr.level_id <> $3
       AND NOT EXISTS (SELECT 1 FROM flow_roles other
                       WHERE other.flow_id = fr.flow_id AND other.role_id <> fr.role_id
                         AND other.level_id = fr.level_id AND other.can_approve_reject)
     LIMIT 1`,
    [b.flowId, b.roleId, b.levelId]
  );
  if (orphans.rows.length > 0) {
    throw new MutationError(409, 'Na obecnym poziomie tej roli czekają oferty do walidacji - rozpatrz je przed zmianą poziomu');
  }
  return one(db,
    `INSERT INTO flow_roles (flow_id, role_id, level_id, can_create_offer, can_edit_own_before_submit,
                             can_submit_to_validation, can_approve_reject, can_change_pgl_base,
                             can_change_price_margin)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (flow_id, role_id) DO UPDATE SET
       level_id = EXCLUDED.level_id, can_create_offer = EXCLUDED.can_create_offer,
       can_edit_own_before_submit = EXCLUDED.can_edit_own_before_submit,
       can_submit_to_validation = EXCLUDED.can_submit_to_validation,
       can_approve_reject = EXCLUDED.can_approve_reject,
       can_change_pgl_base = EXCLUDED.can_change_pgl_base,
       can_change_price_margin = EXCLUDED.can_change_price_margin
     RETURNING *`,
    [b.flowId, b.roleId, b.levelId, p.canCreateOffer, p.canEditOwnBeforeSubmit, p.canSubmitToValidation,
      p.canApproveReject, p.canChangePglBase, p.canChangePriceMargin], 'Rola w flow');
};

const deleteFlowRole: Handler = async (body, _u, db) => {
  const b = parse(z.object({ flowId: id, roleId: id }), body);
  const used = await db.query(
    `SELECT 1 FROM user_flow_roles WHERE flow_id = $1 AND role_id = $2 LIMIT 1`,
    [b.flowId, b.roleId]
  );
  if (used.rows.length > 0) throw new MutationError(409, 'Najpierw przenieś użytkowników tej roli do innej roli');
  return one(db, `DELETE FROM flow_roles WHERE flow_id = $1 AND role_id = $2 RETURNING flow_id`,
    [b.flowId, b.roleId], 'Rola w flow');
};

// --- Memberships ------------------------------------------------------------------------

/**
 * One person works in one flow. Several flows only when every role they would hold there is
 * a multi-flow role (Head of Projects, CEO). `wanted` = the user's full set after the change.
 */
export async function assertSingleFlow(db: Db, wanted: { flowId: number; roleId: number }[]): Promise<void> {
  if (new Set(wanted.map((m) => m.flowId)).size <= 1) return;
  const roleIds = [...new Set(wanted.map((m) => m.roleId))];
  const result = await db.query(`SELECT name FROM roles WHERE id = ANY($1::int[]) AND NOT multi_flow`, [roleIds]);
  if (result.rows.length > 0) {
    throw new MutationError(409,
      `Rola ${result.rows.map((r) => r.name).join(', ')} pracuje tylko w jednym flow - najpierw usuń osobę z drugiego flow`);
  }
}

/** roleId null removes the user from the flow; otherwise sets (or moves them to) that role. */
const setMembership: Handler = async (body, _u, db) => {
  const b = parse(z.object({ userId: id, flowId: id, roleId: id.nullable() }), body);
  const roleId = b.roleId;
  if (roleId === null) {
    await db.query(`DELETE FROM user_flow_roles WHERE user_id = $1 AND flow_id = $2`, [b.userId, b.flowId]);
    return { userId: b.userId, flowId: b.flowId, roleId: null };
  }
  // Check and write in one transaction under a per-user lock: two parallel admin edits must not
  // each add a different flow because neither sees the other's row yet.
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('user_flow_roles'), $1)`, [b.userId]);
    const current = await tx.query(
      `SELECT flow_id, role_id FROM user_flow_roles WHERE user_id = $1 AND flow_id <> $2`,
      [b.userId, b.flowId]
    );
    await assertSingleFlow(tx, [
      ...current.rows.map((r) => ({ flowId: Number(r.flow_id), roleId: Number(r.role_id) })),
      { flowId: b.flowId, roleId },
    ]);
    // The composite FK to flow_roles rejects a role that does not exist in that flow.
    const row = await one(tx,
      `INSERT INTO user_flow_roles (user_id, flow_id, role_id) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, flow_id) DO UPDATE SET role_id = EXCLUDED.role_id
       RETURNING user_id, flow_id, role_id`,
      [b.userId, b.flowId, roleId], 'Przypisanie');
    await tx.query('COMMIT');
    return row;
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    tx.release();
  }
};

// --- Rules ------------------------------------------------------------------------------

function ruleValues(b: z.infer<typeof ruleBody>, userId: number): unknown[] {
  return [b.flowId, b.criterion, b.appliesToRoleId, b.conditionText, b.operator, b.threshold,
    b.referenceValue, b.unit, b.targetLevelId, b.isActive, b.sortOrder, userId];
}

const createRule: Handler = (body, userId, db) => {
  const b = parse(ruleBody, body);
  checkRuleShape(b);
  return one(db,
    `INSERT INTO approval_rules (flow_id, criterion, applies_to_role_id, condition_text, operator,
       threshold, reference_value, unit, target_level_id, is_active, sort_order, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    ruleValues(b, userId), 'Reguła');
};

const updateRule: Handler = (body, userId, db) => {
  const b = parse(ruleBody.extend({ id }), body);
  checkRuleShape(b);
  return one(db,
    `UPDATE approval_rules SET flow_id=$2, criterion=$3, applies_to_role_id=$4, condition_text=$5,
       operator=$6, threshold=$7, reference_value=$8, unit=$9, target_level_id=$10,
       is_active=$11, sort_order=$12, updated_by=$13, updated_at=CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [b.id, ...ruleValues(b, userId)], 'Reguła');
};

const deleteRule: Handler = (body, _u, db) => {
  const b = parse(z.object({ id }), body);
  return one(db, `DELETE FROM approval_rules WHERE id = $1 RETURNING id`, [b.id], 'Reguła');
};

// --- Visibility matrix ------------------------------------------------------------------

const setVisibility: Handler = (body, _u, db) => {
  const b = parse(z.object({ flowId: id, roleId: id, visibility, note: z.string().max(500).optional() }), body);
  const v = b.visibility;
  return one(db,
    `INSERT INTO visibility_rules (flow_id, role_id, see_own, see_team, see_branch, see_region,
                                   see_all_in_flow, see_all_flows, see_awaiting_my_review, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::text, ''))
     ON CONFLICT (flow_id, role_id) DO UPDATE SET
       see_own = EXCLUDED.see_own, see_team = EXCLUDED.see_team, see_branch = EXCLUDED.see_branch,
       see_region = EXCLUDED.see_region, see_all_in_flow = EXCLUDED.see_all_in_flow,
       see_all_flows = EXCLUDED.see_all_flows, see_awaiting_my_review = EXCLUDED.see_awaiting_my_review,
       note = COALESCE($10::text, visibility_rules.note)
     RETURNING *`,
    [b.flowId, b.roleId, v.seeOwn, v.seeTeam, v.seeBranch, v.seeRegion, v.seeAllInFlow, v.seeAllFlows,
      v.seeAwaitingMyReview, b.note ?? null], 'Widoczność');
};

// --- Policies ---------------------------------------------------------------------------

const setPolicies: Handler = (body, _u, db) => {
  const b = parse(z.object({
    conflictPolicy: z.enum(['escalate_next', 'block', 'escalate_top']),
    orgScopeFallback: z.enum(['team', 'flow']),
    approvalValidityHours: z.number().int().min(1).max(8760).optional(),
  }), body);
  return one(db,
    `UPDATE app_settings SET level_conflict_policy = $1, org_scope_fallback = $2,
            approval_validity_hours = COALESCE($3, approval_validity_hours) WHERE id = 1
     RETURNING level_conflict_policy, org_scope_fallback, approval_validity_hours`,
    [b.conflictPolicy, b.orgScopeFallback, b.approvalValidityHours ?? null], 'Ustawienia');
};

export type MutationMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** resource -> HTTP verb -> handler. The route maps its URL segment and verb onto this. */
const ADMIN_MUTATIONS: Record<string, Partial<Record<MutationMethod, Handler>>> = {
  flows: { POST: createFlow, PATCH: updateFlow },
  levels: { POST: createLevel, PATCH: updateLevel },
  roles: { POST: createRole, PATCH: updateRole, DELETE: deleteRole },
  'flow-roles': { PUT: upsertFlowRole, DELETE: deleteFlowRole },
  memberships: { PUT: setMembership },
  rules: { POST: createRule, PATCH: updateRule, DELETE: deleteRule },
  visibility: { PUT: setVisibility },
  policies: { PUT: setPolicies },
};

export async function runAdminMutation(
  resource: string,
  method: MutationMethod,
  body: unknown,
  userId: number
): Promise<unknown> {
  const handler = ADMIN_MUTATIONS[resource]?.[method];
  if (!handler) throw new MutationError(405, 'Nieobsługiwana operacja');
  return handler(body, userId, pool);
}
