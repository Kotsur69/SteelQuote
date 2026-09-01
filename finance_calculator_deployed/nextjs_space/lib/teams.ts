// Senior <-> junior team membership, backed by the team_members table (migration 019).
//
// A senior builds a team out of juniors; the analytics panel then scopes a senior to their own
// book plus every team member's. Membership is many-to-many - a junior may be on several teams.
// Roles are enforced here (add only ever touches an active junior), not by a DB constraint, so
// a later role change cannot break an existing row.

import type { PoolClient } from 'pg';
import pool from './db';

type Db = PoolClient | typeof pool;

export interface TeamMember {
  id: number;
  email: string;
  full_name: string | null;
}

export type AddResult = 'added' | 'exists' | 'not_a_junior';

/** Junior ids on a senior's team. The analytics panel resolves "my team" through this. */
export async function teamMemberIds(seniorId: number, db: Db = pool): Promise<number[]> {
  const result = await db.query(
    `SELECT junior_id FROM team_members WHERE senior_id = $1`,
    [seniorId]
  );
  return result.rows.map((row) => row.junior_id as number);
}

/** Full rows for a senior's team, active accounts only, ordered by display name. */
export async function listTeam(seniorId: number, db: Db = pool): Promise<TeamMember[]> {
  const result = await db.query(
    `SELECT u.id, u.email, u.full_name
     FROM team_members tm
     JOIN users u ON u.id = tm.junior_id
     WHERE tm.senior_id = $1 AND u.is_active = true
     ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) ASC`,
    [seniorId]
  );
  return result.rows as TeamMember[];
}

/** Active juniors NOT already on this senior's team - the pool the add-picker offers. */
export async function listAssignableJuniors(
  seniorId: number,
  db: Db = pool
): Promise<TeamMember[]> {
  const result = await db.query(
    `SELECT u.id, u.email, u.full_name
     FROM users u
     WHERE u.role = 'junior' AND u.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM team_members tm
         WHERE tm.senior_id = $1 AND tm.junior_id = u.id
       )
     ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) ASC`,
    [seniorId]
  );
  return result.rows as TeamMember[];
}

/**
 * Add a junior to a senior's team. The INSERT is gated by a SELECT on the users row, so a
 * juniorId that is missing, inactive, or not a junior returns 'not_a_junior' and writes
 * nothing. A repeat add is 'exists' (idempotent, not an error).
 */
export async function addTeamMember(
  seniorId: number,
  juniorId: number,
  db: Db = pool
): Promise<AddResult> {
  const target = await db.query(
    `SELECT 1 FROM users WHERE id = $1 AND role = 'junior' AND is_active = true`,
    [juniorId]
  );
  if (target.rows.length === 0) return 'not_a_junior';

  const inserted = await db.query(
    `INSERT INTO team_members (senior_id, junior_id)
     VALUES ($1, $2)
     ON CONFLICT (senior_id, junior_id) DO NOTHING
     RETURNING junior_id`,
    [seniorId, juniorId]
  );
  return inserted.rows.length > 0 ? 'added' : 'exists';
}

/** Remove a junior from a senior's team. Returns false when the pairing was not there. */
export async function removeTeamMember(
  seniorId: number,
  juniorId: number,
  db: Db = pool
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM team_members WHERE senior_id = $1 AND junior_id = $2 RETURNING junior_id`,
    [seniorId, juniorId]
  );
  return result.rows.length > 0;
}

/** True when the id is an active senior - the admin route validates a target seniorId with this. */
export async function isActiveSenior(seniorId: number, db: Db = pool): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM users WHERE id = $1 AND role = 'senior' AND is_active = true`,
    [seniorId]
  );
  return result.rows.length > 0;
}
