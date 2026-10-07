// The signed-in user's access context, read FRESH from the database on every request: the JWT
// lives 24h, so a membership, role, permission or deactivation change made by the admin has to
// apply immediately rather than when the token expires (same reasoning as the legacy
// lib/rbac.ts requireRole). Route handlers start with requireAccess() and then ask the
// context - never a role name - what the user may do.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pool from '../db';
import { getSession } from '../auth';
import {
  FLOW_ROLE_JOINS,
  FLOW_ROLE_SELECT,
  flowRoleFromRow,
  loadFlows,
  loadPolicies,
  visibilityFromRow,
  type Db,
} from './config';
import type { AccessContext, FlowSummary, Membership, PermissionKey } from './types';

/** Cookie holding the flow switcher choice. Validated against memberships on every read. */
export const ACTIVE_FLOW_COOKIE = 'active-flow';

const NO_VISIBILITY = {
  seeOwn: true,
  seeTeam: false,
  seeBranch: false,
  seeRegion: false,
  seeAllInFlow: false,
  seeAllFlows: false,
  seeAwaitingMyReview: false,
};

async function loadMemberships(userId: number, db: Db): Promise<Membership[]> {
  const result = await db.query(
    `SELECT ${FLOW_ROLE_SELECT}, f.code AS flow_code, f.name AS flow_name,
            v.see_own, v.see_team, v.see_branch, v.see_region, v.see_all_in_flow,
            v.see_all_flows, v.see_awaiting_my_review, (v.flow_id IS NOT NULL) AS has_visibility
     FROM user_flow_roles m
     JOIN flow_roles fr ON fr.flow_id = m.flow_id AND fr.role_id = m.role_id
     ${FLOW_ROLE_JOINS}
     JOIN flows f ON f.id = m.flow_id
     LEFT JOIN visibility_rules v ON v.flow_id = m.flow_id AND v.role_id = m.role_id
     WHERE m.user_id = $1 AND f.is_active AND r.is_active
     ORDER BY f.sort_order, f.id`,
    [userId]
  );
  return result.rows.map((row) => ({
    ...flowRoleFromRow(row),
    flowCode: String(row.flow_code),
    flowName: String(row.flow_name),
    // A role without a matrix row sees only its own offers (least privilege).
    visibility: row.has_visibility ? visibilityFromRow(row) : NO_VISIBILITY,
  }));
}

/** Users sharing a team with userId in either direction (leader, member, co-member). */
async function loadTeamUserIds(userId: number, db: Db): Promise<number[]> {
  const result = await db.query(
    `SELECT DISTINCT other_id FROM (
       SELECT junior_id AS other_id FROM team_members WHERE senior_id = $1
       UNION SELECT senior_id FROM team_members WHERE junior_id = $1
       UNION SELECT t2.junior_id FROM team_members t1
             JOIN team_members t2 ON t2.senior_id = t1.senior_id
             WHERE t1.junior_id = $1
     ) t WHERE other_id <> $1`,
    [userId]
  );
  return result.rows.map((row) => Number(row.other_id));
}

function pickActiveFlow(flows: FlowSummary[], requested: number | null, last: number | null): number | null {
  const allowed = new Set(flows.map((f) => f.id));
  if (requested !== null && allowed.has(requested)) return requested;
  if (last !== null && allowed.has(last)) return last;
  return flows[0]?.id ?? null;
}

/** null = account missing or inactive. */
export async function loadAccessContext(
  userId: number,
  requestedFlowId: number | null = null,
  db: Db = pool
): Promise<AccessContext | null> {
  const userResult = await db.query(
    `SELECT id, email, full_name, is_active, is_superuser, last_flow_id FROM users WHERE id = $1`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user || !user.is_active) return null;

  const isSuperuser = user.is_superuser === true;
  const [memberships, teamUserIds, policies] = await Promise.all([
    loadMemberships(userId, db),
    loadTeamUserIds(userId, db),
    loadPolicies(db),
  ]);

  const flows: FlowSummary[] = isSuperuser
    ? await loadFlows(db, true)
    : memberships.map((m) => ({ id: m.flowId, code: m.flowCode, name: m.flowName, isActive: true }));

  return {
    userId,
    email: String(user.email),
    fullName: user.full_name ?? null,
    isSuperuser,
    memberships,
    activeFlowId: pickActiveFlow(flows, requestedFlowId, user.last_flow_id ?? null),
    flows,
    teamUserIds,
    orgScopeFallback: policies.orgScopeFallback,
  };
}

function parseFlowCookie(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export type AccessResult = { ctx: AccessContext } | { error: NextResponse };

/** 401 without a session, 403 for an inactive account, otherwise the fresh context. */
export async function requireAccess(): Promise<AccessResult> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const cookieStore = await cookies();
  const requested = parseFlowCookie(cookieStore.get(ACTIVE_FLOW_COOKIE)?.value);
  const ctx = await loadAccessContext(session.userId, requested);
  if (!ctx) {
    return { error: NextResponse.json({ error: 'Konto nieaktywne' }, { status: 403 }) };
  }
  return { ctx };
}

export function forbidden(message = 'Brak uprawnień'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** requireAccess + the superuser flag (admin panel routes). */
export async function requireSuperuser(): Promise<AccessResult> {
  const auth = await requireAccess();
  if ('error' in auth) return auth;
  if (!auth.ctx.isSuperuser) return { error: forbidden() };
  return auth;
}

export function membershipFor(ctx: AccessContext, flowId: number | null): Membership | null {
  if (flowId === null) return null;
  return ctx.memberships.find((m) => m.flowId === flowId) ?? null;
}

/** Whether the user holds `perm` in `flowId`. The superuser holds every permission everywhere. */
export function can(ctx: AccessContext, flowId: number | null, perm: PermissionKey): boolean {
  if (ctx.isSuperuser) return flowId !== null;
  return membershipFor(ctx, flowId)?.permissions[perm] === true;
}

/** Whether the user may approve/reject in at least one flow - unlocks the review panel. */
export function isApproverAnywhere(ctx: AccessContext): boolean {
  return ctx.isSuperuser || ctx.memberships.some((m) => m.permissions.canApproveReject);
}
