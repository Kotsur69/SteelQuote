// The whole access configuration in one read, for the admin panels (Flows, Roles & levels,
// Rules + simulator, Visibility matrix, Salespeople pyramid). Server only, superuser only.
// The simulator runs the pure engine in the browser on exactly this data, so what it shows is
// what submit would decide.

import pool from '../db';
import {
  loadAllRules,
  loadFlows,
  loadLevels,
  loadPolicies,
  permissionsFromRow,
  visibilityFromRow,
  type Db,
  type Policies,
} from './config';
import type { ApprovalRule } from './ruleEngine';
import type { FlowSummary, HierarchyLevel, Permissions, VisibilityFlags } from './types';

export interface AdminRole {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface AdminFlowRole {
  flowId: number;
  roleId: number;
  levelId: number;
  permissions: Permissions;
  /** null = no matrix row yet (the role sees only its own offers). */
  visibility: VisibilityFlags | null;
  visibilityNote: string;
  memberCount: number;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
  isSuperuser: boolean;
  memberships: { flowId: number; roleId: number }[];
  /** Team leaders this user belongs to (team_members.senior_id). */
  leaderIds: number[];
}

export interface AdminAccessConfig {
  levels: HierarchyLevel[];
  flows: FlowSummary[];
  roles: AdminRole[];
  flowRoles: AdminFlowRole[];
  rules: ApprovalRule[];
  policies: Policies;
  users: AdminUser[];
}

export async function loadAdminConfig(db: Db = pool): Promise<AdminAccessConfig> {
  const [levels, flows, rules, policies] = await Promise.all([
    loadLevels(db),
    loadFlows(db),
    loadAllRules(db),
    loadPolicies(db),
  ]);

  const rolesResult = await db.query(`SELECT id, code, name, is_active FROM roles ORDER BY name, id`);
  const flowRolesResult = await db.query(
    `SELECT fr.*, v.flow_id IS NOT NULL AS has_visibility,
            v.see_own, v.see_team, v.see_branch, v.see_region, v.see_all_in_flow,
            v.see_all_flows, v.see_awaiting_my_review, COALESCE(v.note, '') AS visibility_note,
            (SELECT COUNT(*)::int FROM user_flow_roles m
              WHERE m.flow_id = fr.flow_id AND m.role_id = fr.role_id) AS member_count
     FROM flow_roles fr
     LEFT JOIN visibility_rules v ON v.flow_id = fr.flow_id AND v.role_id = fr.role_id
     ORDER BY fr.flow_id, fr.role_id`
  );
  const usersResult = await db.query(
    `SELECT u.id, u.email, COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) AS name,
            u.is_active, u.is_superuser,
            COALESCE((SELECT json_agg(json_build_object('flowId', m.flow_id, 'roleId', m.role_id))
                      FROM user_flow_roles m WHERE m.user_id = u.id), '[]'::json) AS memberships,
            COALESCE((SELECT array_agg(tm.senior_id) FROM team_members tm WHERE tm.junior_id = u.id),
                     '{}') AS leader_ids
     FROM users u
     ORDER BY u.is_active DESC, name`
  );

  return {
    levels,
    flows,
    rules,
    policies,
    roles: rolesResult.rows.map((r) => ({
      id: Number(r.id),
      code: String(r.code),
      name: String(r.name),
      isActive: r.is_active === true,
    })),
    flowRoles: flowRolesResult.rows.map((r) => ({
      flowId: Number(r.flow_id),
      roleId: Number(r.role_id),
      levelId: Number(r.level_id),
      permissions: permissionsFromRow(r),
      visibility: r.has_visibility ? visibilityFromRow(r) : null,
      visibilityNote: String(r.visibility_note ?? ''),
      memberCount: Number(r.member_count ?? 0),
    })),
    users: usersResult.rows.map((u) => ({
      id: Number(u.id),
      email: String(u.email),
      name: String(u.name),
      isActive: u.is_active === true,
      isSuperuser: u.is_superuser === true,
      memberships: (u.memberships as { flowId: number; roleId: number }[]).map((m) => ({
        flowId: Number(m.flowId),
        roleId: Number(m.roleId),
      })),
      leaderIds: (u.leader_ids as number[]).map(Number),
    })),
  };
}

