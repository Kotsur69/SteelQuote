'use client';

import { useMemo, useState } from 'react';
import { ArrowUp, ShieldCheck, Users } from 'lucide-react';
import { useAccessT } from '@/lib/i18n/access';
import type { AdminAccessConfig } from '@/lib/access/adminConfig';
import type { HierarchyLevel } from '@/lib/access/types';

interface Props {
  config: AdminAccessConfig;
}

interface Person {
  id: number;
  name: string;
  roleName: string;
}

interface Tier {
  level: HierarchyLevel;
  people: Person[];
  /** Approves offers that need this level (some role on it may approve). */
  approves: boolean;
}

// Org chart of one flow, derived from configuration only: chain levels are tiers (N0 at the
// base, highest rank on top), each role reports to the next higher chain level present in the
// flow, parallel levels (NPR) form a side branch, superusers sit outside the pyramid.
export default function SalesPyramid({ config }: Props) {
  const at = useAccessT();
  const activeFlows = config.flows.filter((f) => f.isActive);
  const [flowId, setFlowId] = useState<number | null>(activeFlows[0]?.id ?? null);

  const { chain, parallel, superusers } = useMemo(() => {
    const roleById = new Map(config.roles.map((r) => [r.id, r]));
    const levelById = new Map(config.levels.map((l) => [l.id, l]));
    const flowRoles = config.flowRoles.filter((fr) => fr.flowId === flowId);
    const tiers = new Map<number, Tier>();

    for (const fr of flowRoles) {
      const level = levelById.get(fr.levelId);
      if (!level) continue;
      const tier = tiers.get(level.id) ?? { level, people: [], approves: false };
      tier.approves = tier.approves || fr.permissions.canApproveReject;
      tiers.set(level.id, tier);
    }
    for (const u of config.users) {
      if (!u.isActive) continue;
      const m = u.memberships.find((x) => x.flowId === flowId);
      if (!m) continue;
      const fr = flowRoles.find((x) => x.roleId === m.roleId);
      const tier = fr ? tiers.get(fr.levelId) : undefined;
      tier?.people.push({ id: u.id, name: u.name, roleName: roleById.get(m.roleId)?.name ?? '' });
    }

    const all = [...tiers.values()];
    return {
      chain: all
        .filter((t) => t.level.kind === 'chain')
        .sort((a, b) => (b.level.chainRank ?? 0) - (a.level.chainRank ?? 0)),
      parallel: all.filter((t) => t.level.kind === 'parallel'),
      superusers: config.users.filter((u) => u.isActive && u.isSuperuser),
    };
  }, [config, flowId]);

  return (
    <div className="space-y-4">
      <div role="group" aria-label={at.flows} className="flex flex-wrap gap-2">
        {activeFlows.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={f.id === flowId}
            onClick={() => setFlowId(f.id)}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${
              f.id === flowId
                ? 'bg-[rgba(59,142,245,0.12)] border-[#3b8ef5] text-[#3b8ef5]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Chain pyramid: widest tier at the base. */}
        <ol className="flex-1 flex flex-col items-center gap-2" aria-label={at.level}>
          {chain.map((tier, i) => {
            // Narrower toward the top: the base spans the full width.
            const width = `${Math.round(45 + (55 * (i + 1)) / Math.max(chain.length, 1))}%`;
            const above = chain[i - 1];
            return (
              <li key={tier.level.id} className="w-full flex flex-col items-center">
                {above && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--text-muted)] mb-1">
                    <ArrowUp className="h-3 w-3" aria-hidden />
                    {above.level.code}
                  </span>
                )}
                <TierBox tier={tier} width={width} />
              </li>
            );
          })}
        </ol>

        {/* Parallel branch (NPR) and the superusers outside the pyramid. */}
        <div className="lg:w-64 flex flex-col gap-3">
          {parallel.map((tier) => (
            <div key={tier.level.id}>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">{at.pyramid.parallel}</p>
              <TierBox tier={tier} width="100%" />
            </div>
          ))}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">{at.pyramid.outside}</p>
            <div className="rounded-md border border-dashed border-[var(--border-hi)] p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {at.superuser}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {superusers.map((u) => (
                  <li key={u.id} className="px-2 py-1 rounded bg-[var(--bg-panel)] text-[11px] text-[var(--text-primary)]">{u.name}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TierBox({ tier, width }: { tier: Tier; width: string }) {
  const at = useAccessT();
  return (
    <section
      style={{ ['--tier-w' as string]: width }}
      className={`w-full lg:w-[var(--tier-w)] rounded-md border p-3 bg-[var(--bg-card)] ${tier.approves ? 'border-[var(--accent-cr)]' : 'border-[var(--border)]'}`}
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{tier.level.code}</span>
        <span className="text-[11px] text-[var(--text-secondary)]">{tier.level.name}</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
          <Users className="h-3 w-3" aria-hidden /> {tier.people.length}
        </span>
      </header>
      {tier.approves && (
        <p className="mt-1 text-[10px] text-[var(--accent-cr)]">{at.pyramid.approvesFor(tier.level.code)}</p>
      )}
      {tier.people.length === 0 ? (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">{at.pyramid.empty}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {tier.people.map((p) => (
            <li key={p.id} className="px-2 py-1 rounded bg-[var(--bg-panel)] text-[11px] text-[var(--text-primary)]">
              {p.name} <span className="text-[var(--text-muted)]">· {p.roleName}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
