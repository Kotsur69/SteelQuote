// Team membership (leader <-> member), backed by the team_members table (migration 019; the
// columns keep their historical names senior_id = leader, junior_id = member).
//
// Since v2.0 nothing here reads a role name: a team LEADER is any active user who may approve
// in at least one flow (flow_roles.can_approve_reject), a MEMBER is any other active,
// non-superuser account. The visibility matrix's "team" column (lib/access/scope.ts) resolves
// through this table in both directions. Membership is many-to-many.

import type { PoolClient } from 'pg';
import pool from './db';

type Db = PoolClient | typeof pool;

export interface TeamMember {
  id: number;
  email: string;
  full_name: string | null;
}

export type AddResult = 'added' | 'exists' | 'not_assignable';

/** SQL: the user aliased `u` may approve somewhere - the condition for leading a team. */
const IS_APPROVER = `EXISTS (
  SELECT 1 FROM user_flow_roles m
  JOIN flow_roles fr ON fr.flow_id = m.flow_id AND fr.role_id = m.role_id
  WHERE m.user_id = u.id AND fr.can_approve_reject)`;

/** Member ids on a leader's team. */
export async function teamMemberIds(leaderId: number, db: Db = pool): Promise<number[]> {
  const result = await db.query(`SELECT junior_id FROM team_members WHERE senior_id = $1`, [leaderId]);
  return result.rows.map((row) => row.junior_id as number);
}

/** Full rows for a leader's team, active accounts only, ordered by display name. */
export async function listTeam(leaderId: number, db: Db = pool): Promise<TeamMember[]> {
  const result = await db.query(
    `SELECT u.id, u.email, u.full_name
     FROM team_members tm
     JOIN users u ON u.id = tm.junior_id
     WHERE tm.senior_id = $1 AND u.is_active = true
     ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) ASC`,
    [leaderId]
  );
  return result.rows as TeamMember[];
}

/** Active, non-superuser accounts NOT already on this team (and not the leader) - the add-picker pool. */
export async function listAssignableMembers(leaderId: number, db: Db = pool): Promise<TeamMember[]> {
  const result = await db.query(
    `SELECT u.id, u.email, u.full_name
     FROM users u
     WHERE u.is_active = true AND u.is_superuser = false AND u.id <> $1
       AND NOT EXISTS (
         SELECT 1 FROM team_members tm
         WHERE tm.senior_id = $1 AND tm.junior_id = u.id
       )
     ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) ASC`,
    [leaderId]
  );
  return result.rows as TeamMember[];
}

/**
 * Add a member to a leader's team. The INSERT is gated by a SELECT on the users row, so a
 * memberId that is missing, inactive, a superuser or the leader returns 'not_assignable' and
 * writes nothing. A repeat add is 'exists' (idempotent, not an error).
 */
export async function addTeamMember(leaderId: number, memberId: number, db: Db = pool): Promise<AddResult> {
  if (memberId === leaderId) return 'not_assignable';
  const target = await db.query(
    `SELECT 1 FROM users WHERE id = $1 AND is_active = true AND is_superuser = false`,
    [memberId]
  );
  if (target.rows.length === 0) return 'not_assignable';

  const inserted = await db.query(
    `INSERT INTO team_members (senior_id, junior_id)
     VALUES ($1, $2)
     ON CONFLICT (senior_id, junior_id) DO NOTHING
     RETURNING junior_id`,
    [leaderId, memberId]
  );
  return inserted.rows.length > 0 ? 'added' : 'exists';
}

/** Remove a member from a leader's team. Returns false when the pairing was not there. */
export async function removeTeamMember(leaderId: number, memberId: number, db: Db = pool): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM team_members WHERE senior_id = $1 AND junior_id = $2 RETURNING junior_id`,
    [leaderId, memberId]
  );
  return result.rows.length > 0;
}

/** True when the id is an active approver - the admin route validates a target leader with this. */
export async function isEligibleLeader(leaderId: number, db: Db = pool): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM users u WHERE u.id = $1 AND u.is_active = true AND ${IS_APPROVER}`,
    [leaderId]
  );
  return result.rows.length > 0;
}
