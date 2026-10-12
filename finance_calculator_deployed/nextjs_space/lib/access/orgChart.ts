// Person-level org chart of one flow, for the Salespeople pyramid view. Pure - derived from
// the admin access config only:
//   - tiers: chain levels (highest rank first) and parallel levels (NPR), as in the flow setup;
//   - edges: team membership (team_members, leader -> member), kept only when both people sit
//     in this flow's chart. Membership is many-to-many, so a member may have several leaders.

import type { AdminAccessConfig } from './adminConfig';
import type { HierarchyLevel } from './types';

export interface OrgPerson {
  id: number;
  name: string;
  roleName: string;
}

export interface OrgTier {
  level: HierarchyLevel;
  people: OrgPerson[];
  /** Some role on this level may approve offers in this flow. */
  approves: boolean;
}

export interface OrgEdge {
  leaderId: number;
  memberId: number;
}

export interface OrgChart {
  /** Chain tiers, highest rank first (top of the pyramid). */
  chain: OrgTier[];
  parallel: OrgTier[];
  edges: OrgEdge[];
  leadersOf: Map<number, number[]>;
  membersOf: Map<number, number[]>;
}

/** Placed after every positioned person when nobody above anchors this one. */
const UNANCHORED = 2;

export function buildOrgChart(config: AdminAccessConfig, flowId: number | null): OrgChart {
  const roleById = new Map(config.roles.map((r) => [r.id, r]));
  const levelById = new Map(config.levels.map((l) => [l.id, l]));
  const flowRoles = config.flowRoles.filter((fr) => fr.flowId === flowId);
  const tiers = new Map<number, OrgTier>();

  for (const fr of flowRoles) {
    const level = levelById.get(fr.levelId);
    if (!level) continue;
    const tier = tiers.get(level.id) ?? { level, people: [], approves: false };
    tiers.set(level.id, { ...tier, approves: tier.approves || fr.permissions.canApproveReject });
  }

  const placed = new Set<number>();
  for (const u of config.users) {
    if (!u.isActive) continue;
    const m = u.memberships.find((x) => x.flowId === flowId);
    const fr = m && flowRoles.find((x) => x.roleId === m.roleId);
    const tier = fr && tiers.get(fr.levelId);
    if (!m || !tier) continue;
    tier.people.push({ id: u.id, name: u.name, roleName: roleById.get(m.roleId)?.name ?? '' });
    placed.add(u.id);
  }

  const edges: OrgEdge[] = [];
  const leadersOf = new Map<number, number[]>();
  const membersOf = new Map<number, number[]>();
  for (const u of config.users) {
    if (!placed.has(u.id)) continue;
    for (const leaderId of new Set(u.leaderIds)) {
      if (!placed.has(leaderId) || leaderId === u.id) continue;
      edges.push({ leaderId, memberId: u.id });
      leadersOf.set(u.id, [...(leadersOf.get(u.id) ?? []), leaderId]);
      membersOf.set(leaderId, [...(membersOf.get(leaderId) ?? []), u.id]);
    }
  }

  const all = [...tiers.values()];
  const chain = orderUnderLeaders(
    all
      .filter((t) => t.level.kind === 'chain')
      .sort((a, b) => (b.level.chainRank ?? 0) - (a.level.chainRank ?? 0)),
    leadersOf
  );
  const parallel = all.filter((t) => t.level.kind === 'parallel').map(sortTierByName);

  return { chain, parallel, edges, leadersOf, membersOf };
}

/**
 * Top-down barycenter ordering: each person is placed under the average horizontal position
 * of their leaders, so team lines cross as little as possible. People nobody above anchors
 * go last; ties break by name.
 */
function orderUnderLeaders(tiers: OrgTier[], leadersOf: Map<number, number[]>): OrgTier[] {
  const position = new Map<number, number>();
  return tiers.map((tier, index) => {
    const anchor = (id: number) => {
      const xs = (leadersOf.get(id) ?? []).map((l) => position.get(l)).filter((x): x is number => x !== undefined);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : UNANCHORED;
    };
    const people =
      index === 0
        ? [...tier.people].sort(byName)
        : [...tier.people].sort((a, b) => anchor(a.id) - anchor(b.id) || byName(a, b));
    people.forEach((p, i) => position.set(p.id, (i + 0.5) / people.length));
    return { ...tier, people };
  });
}

function sortTierByName(tier: OrgTier): OrgTier {
  return { ...tier, people: [...tier.people].sort(byName) };
}

function byName(a: OrgPerson, b: OrgPerson): number {
  return a.name.localeCompare(b.name);
}

/** The person, everyone above them (leaders, transitively) and everyone below (team, transitively). */
export function relatedIds(chart: OrgChart, id: number): Set<number> {
  const result = new Set<number>([id]);
  const walk = (next: Map<number, number[]>) => {
    const queue = [id];
    const seen = new Set<number>([id]);
    while (queue.length) {
      const current = queue.shift() as number;
      for (const n of next.get(current) ?? []) {
        if (seen.has(n)) continue; // team_members may contain cycles
        seen.add(n);
        result.add(n);
        queue.push(n);
      }
    }
  };
  walk(chart.leadersOf);
  walk(chart.membersOf);
  return result;
}
