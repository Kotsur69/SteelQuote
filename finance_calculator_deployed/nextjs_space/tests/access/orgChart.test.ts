// Salespeople pyramid: tiers per level, team lines leader -> member, ordering that keeps a team
// under its leader, and tracing one person's upline and downline.
import { describe, expect, it } from 'vitest';
import { buildOrgChart, relatedIds } from '@/lib/access/orgChart';
import type { AdminAccessConfig, AdminFlowRole, AdminUser } from '@/lib/access/adminConfig';
import type { HierarchyLevel } from '@/lib/access/types';

const FLOW = 1;
const OTHER_FLOW = 2;

const level = (id: number, code: string, chainRank: number | null): HierarchyLevel =>
  ({ id, code, name: code, kind: chainRank === null ? 'parallel' : 'chain', chainRank, sortOrder: id }) as HierarchyLevel;

// Role id = level id, one role per level, approvers from N1 up.
const flowRole = (flowId: number, roleId: number, canApproveReject: boolean): AdminFlowRole =>
  ({ flowId, roleId, levelId: roleId, permissions: { canApproveReject }, visibility: null, visibilityNote: '', memberCount: 0 }) as unknown as AdminFlowRole;

const user = (id: number, name: string, roleId: number, leaderIds: number[] = [], extra: Partial<AdminUser> = {}): AdminUser => ({
  id,
  email: `${id}@example.test`,
  name,
  isActive: true,
  isSuperuser: false,
  memberships: [{ flowId: FLOW, roleId }],
  leaderIds,
  ...extra,
});

function config(users: AdminUser[]): AdminAccessConfig {
  return {
    levels: [level(1, 'N0', 0), level(2, 'N1', 1), level(3, 'N2', 2), level(4, 'NPR', null)],
    flows: [],
    roles: [1, 2, 3, 4].map((id) => ({ id, code: `R${id}`, name: `Role ${id}`, isActive: true })) as AdminAccessConfig['roles'],
    flowRoles: [flowRole(FLOW, 1, false), flowRole(FLOW, 2, true), flowRole(FLOW, 3, true), flowRole(FLOW, 4, false)],
    rules: [],
    policies: {} as AdminAccessConfig['policies'],
    users,
  };
}

// CEO leads both managers; Manager A leads Zoe, Manager B leads Adam; Nina has no leader.
const team = [
  user(1, 'CEO', 3),
  user(2, 'Manager A', 2, [1]),
  user(3, 'Manager B', 2, [1]),
  user(4, 'Adam', 1, [3]),
  user(5, 'Zoe', 1, [2]),
  user(6, 'Nina', 1),
  user(7, 'Gone', 1, [2], { isActive: false }),
  user(8, 'Elsewhere', 1, [2], { memberships: [{ flowId: OTHER_FLOW, roleId: 1 }] }),
  user(9, 'Parallel', 4, [1]),
];

describe('buildOrgChart', () => {
  const chart = buildOrgChart(config(team), FLOW);

  it('stacks chain levels highest rank first and keeps parallel levels aside', () => {
    expect(chart.chain.map((t) => t.level.code)).toEqual(['N2', 'N1', 'N0']);
    expect(chart.parallel.map((t) => t.level.code)).toEqual(['NPR']);
    expect(chart.chain.map((t) => t.approves)).toEqual([true, true, false]);
  });

  it('draws team lines only between active people of this flow', () => {
    expect(chart.edges).toHaveLength(5);
    expect(chart.edges.some((e) => e.memberId === 7 || e.memberId === 8)).toBe(false);
    expect(chart.membersOf.get(1)).toEqual([2, 3, 9]);
    expect(chart.leadersOf.has(6)).toBe(false);
  });

  it('places each person under their leader and leaderless people last', () => {
    // Manager A sits left of Manager B, so Zoe (A's team) goes before Adam (B's team).
    expect(chart.chain[2].people.map((p) => p.name)).toEqual(['Zoe', 'Adam', 'Nina']);
  });
});

describe('relatedIds', () => {
  it('traces the whole upline and downline, not siblings', () => {
    const chart = buildOrgChart(config(team), FLOW);
    expect([...relatedIds(chart, 3)].sort()).toEqual([1, 3, 4]);
    expect([...relatedIds(chart, 4)].sort()).toEqual([1, 3, 4]);
  });

  it('terminates on a team cycle', () => {
    const chart = buildOrgChart(config([user(1, 'A', 2, [2]), user(2, 'B', 2, [1])]), FLOW);
    expect([...relatedIds(chart, 1)].sort()).toEqual([1, 2]);
  });
});
