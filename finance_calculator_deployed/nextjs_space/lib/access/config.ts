// Database loaders for the flow / role / rule configuration (migrations 025-027). Server only.
// Everything downstream (routing, visibility, panels) is recomputed from what these return,
// so an admin edit takes effect on the next request - nothing is cached across requests.

import type { PoolClient } from 'pg';
import pool from '../db';
import { pglBaseForType, settingsRowToAppSettings, DEFAULT_SETTINGS } from '../currency';
import { applyQuarterlyPglOverride } from '../pglQuarterly';
import { quarterOfDateString } from '../quarterUtils';
import type { SteelType } from '../calculatorData';
import type { ApprovalRule, Criterion, Operator } from './ruleEngine';
import type {
  ConflictPolicy,
  FlowRole,
  FlowSummary,
  HierarchyLevel,
  OrgScopeFallback,
  Permissions,
  VisibilityFlags,
} from './types';

export type Db = PoolClient | typeof pool;

type Row = Record<string, unknown>;

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function levelFromRow(row: Row, prefix = ''): HierarchyLevel {
  return {
    id: Number(row[`${prefix}id`]),
    code: String(row[`${prefix}code`]),
    name: String(row[`${prefix}name`]),
    kind: row[`${prefix}kind`] === 'parallel' ? 'parallel' : 'chain',
    chainRank: num(row[`${prefix}chain_rank`]),
    sortOrder: Number(row[`${prefix}sort_order`] ?? 0),
  };
}

export function permissionsFromRow(row: Row): Permissions {
  return {
    canCreateOffer: row.can_create_offer === true,
    canEditOwnBeforeSubmit: row.can_edit_own_before_submit === true,
    canSubmitToValidation: row.can_submit_to_validation === true,
    canApproveReject: row.can_approve_reject === true,
    canChangePglBase: row.can_change_pgl_base === true,
    canChangePriceMargin: row.can_change_price_margin === true,
  };
}

export function visibilityFromRow(row: Row): VisibilityFlags {
  return {
    seeOwn: row.see_own === true,
    seeTeam: row.see_team === true,
    seeBranch: row.see_branch === true,
    seeRegion: row.see_region === true,
    seeAllInFlow: row.see_all_in_flow === true,
    seeAllFlows: row.see_all_flows === true,
    seeAwaitingMyReview: row.see_awaiting_my_review === true,
  };
}

/** Columns + joins shared by every query that returns a FlowRole (alias fr). */
export const FLOW_ROLE_SELECT = `
  fr.flow_id, fr.role_id, r.code AS role_code, r.name AS role_name,
  fr.can_create_offer, fr.can_edit_own_before_submit, fr.can_submit_to_validation,
  fr.can_approve_reject, fr.can_change_pgl_base, fr.can_change_price_margin,
  l.id AS l_id, l.code AS l_code, l.name AS l_name, l.kind AS l_kind,
  l.chain_rank AS l_chain_rank, l.sort_order AS l_sort_order`;

export const FLOW_ROLE_JOINS = `
  JOIN roles r ON r.id = fr.role_id
  JOIN hierarchy_levels l ON l.id = fr.level_id`;

export function flowRoleFromRow(row: Row): FlowRole {
  return {
    flowId: Number(row.flow_id),
    roleId: Number(row.role_id),
    roleCode: String(row.role_code),
    roleName: String(row.role_name),
    level: levelFromRow(row, 'l_'),
    permissions: permissionsFromRow(row),
  };
}

export async function loadLevels(db: Db = pool): Promise<HierarchyLevel[]> {
  const result = await db.query(
    `SELECT id, code, name, kind, chain_rank, sort_order FROM hierarchy_levels
     ORDER BY sort_order, id`
  );
  return result.rows.map((row) => levelFromRow(row));
}

export async function loadFlows(db: Db = pool, activeOnly = false): Promise<FlowSummary[]> {
  const result = await db.query(
    `SELECT id, code, name, is_active FROM flows
     ${activeOnly ? 'WHERE is_active' : ''}
     ORDER BY sort_order, id`
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    isActive: row.is_active === true,
  }));
}

/** Active roles of one flow (or of every flow when flowId is null). */
export async function loadFlowRoles(flowId: number | null, db: Db = pool): Promise<FlowRole[]> {
  const result = await db.query(
    `SELECT ${FLOW_ROLE_SELECT}
     FROM flow_roles fr ${FLOW_ROLE_JOINS}
     WHERE r.is_active AND ($1::int IS NULL OR fr.flow_id = $1)
     ORDER BY fr.flow_id, l.sort_order, r.name`,
    [flowId]
  );
  return result.rows.map(flowRoleFromRow);
}

export function ruleFromRow(row: Row): ApprovalRule {
  return {
    id: Number(row.id),
    flowId: num(row.flow_id),
    criterion: row.criterion as Criterion,
    appliesToRoleId: num(row.applies_to_role_id),
    conditionText: String(row.condition_text ?? ''),
    operator: row.operator as Operator,
    threshold: num(row.threshold),
    referenceValue: num(row.reference_value),
    unit: String(row.unit ?? ''),
    priority: Number(row.priority ?? 0),
    targetLevelId: Number(row.target_level_id),
    isActive: row.is_active === true,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export const RULE_COLUMNS = `id, flow_id, criterion, applies_to_role_id, condition_text, operator,
  threshold, reference_value, unit, priority, target_level_id, is_active, sort_order`;

/** Rules that apply to an offer in `flowId`: the flow's own plus the flow-less ("both") ones. */
export async function loadRulesForFlow(flowId: number, db: Db = pool): Promise<ApprovalRule[]> {
  const result = await db.query(
    `SELECT ${RULE_COLUMNS} FROM approval_rules
     WHERE flow_id = $1 OR flow_id IS NULL
     ORDER BY sort_order, id`,
    [flowId]
  );
  return result.rows.map(ruleFromRow);
}

export async function loadAllRules(db: Db = pool): Promise<ApprovalRule[]> {
  const result = await db.query(`SELECT ${RULE_COLUMNS} FROM approval_rules ORDER BY sort_order, id`);
  return result.rows.map(ruleFromRow);
}

export interface Policies {
  conflictPolicy: ConflictPolicy;
  orgScopeFallback: OrgScopeFallback;
}

export async function loadPolicies(db: Db = pool): Promise<Policies> {
  const result = await db.query(
    `SELECT level_conflict_policy, org_scope_fallback FROM app_settings WHERE id = 1`
  );
  const row = result.rows[0] as Row | undefined;
  const policy = row?.level_conflict_policy;
  return {
    conflictPolicy: policy === 'block' || policy === 'escalate_top' ? policy : 'escalate_next',
    orgScopeFallback: row?.org_scope_fallback === 'flow' ? 'flow' : 'team',
  };
}

/**
 * Live base price per steel type for the quarter the offer is valid in (validFrom), the same
 * base the calculator shows - settings with the quarterly PGL plan applied. Falls back to the
 * current quarter when the offer carries no valid date.
 */
export async function loadBaseResolver(validFrom: unknown, db: Db = pool): Promise<(type: string) => number> {
  const result = await db.query(`SELECT * FROM app_settings WHERE id = 1`);
  const settings = result.rows.length > 0 ? settingsRowToAppSettings(result.rows[0]) : DEFAULT_SETTINGS;
  const target = typeof validFrom === 'string' ? quarterOfDateString(validFrom) : null;
  const live = target ? await applyQuarterlyPglOverride(settings, target) : await applyQuarterlyPglOverride(settings);
  return (type: string) => pglBaseForType(type as SteelType, live);
}
