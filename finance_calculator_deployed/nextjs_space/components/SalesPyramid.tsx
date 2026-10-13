'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ShieldCheck, Users, X } from 'lucide-react';
import { useAccessT } from '@/lib/i18n/access';
import type { AdminAccessConfig } from '@/lib/access/adminConfig';
import { buildOrgChart, relatedIds, type OrgPerson, type OrgTier } from '@/lib/access/orgChart';

interface Props {
  config: AdminAccessConfig;
}

interface EdgePath {
  key: string;
  leaderId: number;
  memberId: number;
  d: string;
}

/** Below this vertical gap two cards count as one row, so the line runs side to side. */
const SAME_ROW_PX = 4;
/** How far a same-row team line arcs above the cards. */
const SAME_ROW_ARC_PX = 20;

// Org chart of one flow: chain levels are tiers (highest rank on top, widest at the base), each
// person is a card, and a line joins every team leader with each member of their team
// (team_members). Clicking a person traces their whole upline and downline; parallel levels
// (NPR) form a side branch, superusers sit outside the pyramid.
export default function SalesPyramid({ config }: Props) {
  const at = useAccessT();
  const activeFlows = config.flows.filter((f) => f.isActive);
  const [pickedFlowId, setPickedFlowId] = useState<number | null>(activeFlows[0]?.id ?? null);
  // A refetched config may have deactivated the picked flow - fall back to the first active one.
  const flowId = activeFlows.some((f) => f.id === pickedFlowId) ? pickedFlowId : (activeFlows[0]?.id ?? null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [paths, setPaths] = useState<EdgePath[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<number, HTMLElement>());

  const chart = useMemo(() => buildOrgChart(config, flowId), [config, flowId]);
  const personById = useMemo(() => {
    const map = new Map<number, OrgPerson>();
    for (const tier of [...chart.chain, ...chart.parallel]) tier.people.forEach((p) => map.set(p.id, p));
    return map;
  }, [chart]);
  const superusers = config.users.filter((u) => u.isActive && u.isSuperuser);

  const activeId = hovered ?? selected;
  const related = activeId !== null && personById.has(activeId) ? relatedIds(chart, activeId) : null;

  // Lines follow the real card positions, so re-measure whenever the container or any card
  // resizes, and once web fonts have settled the card widths.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let isLive = true;
    const measure = () => {
      if (!isLive) return;
      const box = container.getBoundingClientRect();
      setPaths(
        chart.edges.flatMap((e) => {
          const leader = nodeRefs.current.get(e.leaderId)?.getBoundingClientRect();
          const member = nodeRefs.current.get(e.memberId)?.getBoundingClientRect();
          if (!leader || !member) return [];
          return [{ ...e, key: `${e.leaderId}-${e.memberId}`, d: edgePath(leader, member, box) }];
        })
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    nodeRefs.current.forEach((node) => observer.observe(node));
    document.fonts?.ready.then(measure);
    return () => {
      isLive = false;
      observer.disconnect();
    };
  }, [chart]);

  const clearTrace = () => {
    setSelected(null);
    setHovered(null);
  };

  const selectFlow = (id: number) => {
    setPickedFlowId(id);
    setSelected(null);
    setHovered(null);
  };

  const cardFor = (p: OrgPerson, flagMissingLeader: boolean) => (
    <PersonCard
      key={p.id}
      person={p}
      teamSize={chart.membersOf.get(p.id)?.length ?? 0}
      hasLeader={chart.leadersOf.has(p.id)}
      flagMissingLeader={flagMissingLeader}
      isSelected={selected === p.id}
      isDimmed={related !== null && !related.has(p.id)}
      nodeRef={(el) => {
        if (el) nodeRefs.current.set(p.id, el);
        else nodeRefs.current.delete(p.id);
      }}
      onToggle={() => setSelected((s) => (s === p.id ? null : p.id))}
      onPreview={(on) => setHovered(on ? p.id : null)}
    />
  );

  const activePerson = activeId !== null ? personById.get(activeId) : undefined;
  const leaderNames = (id: number) =>
    (chart.leadersOf.get(id) ?? []).map((l) => personById.get(l)?.name ?? '').join(', ');
  const activeLeaders = activePerson ? leaderNames(activePerson.id) : '';
  const selectedPerson = selected !== null ? personById.get(selected) : undefined;
  // Screen readers hear the committed selection only, not every hover / focus preview.
  const announcement = selectedPerson
    ? `${selectedPerson.name}. ${at.pyramid.reportsTo}: ${leaderNames(selectedPerson.id) || at.pyramid.noLeader}. ${at.pyramid.teamSize(chart.membersOf.get(selectedPerson.id)?.length ?? 0)}`
    : '';

  return (
    <div className="space-y-4" onKeyDown={(e) => e.key === 'Escape' && clearTrace()}>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <div role="group" aria-label={at.flows} className="flex flex-wrap gap-2">
        {activeFlows.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={f.id === flowId}
            onClick={() => selectFlow(f.id)}
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

      {/* Fixed-height status line: the hint, or who the traced person reports to. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-[32px] text-xs">
        {activePerson ? (
          <p className="text-[var(--text-primary)]">
            <span className="font-semibold">{activePerson.name}</span>
            <span className="text-[var(--text-secondary)]"> · {activePerson.roleName} · </span>
            {activeLeaders ? (
              <span>{at.pyramid.reportsTo}: <span className="font-medium">{activeLeaders}</span></span>
            ) : (
              <span className="text-[var(--text-secondary)]">{at.pyramid.noLeader}</span>
            )}
            <span className="text-[var(--text-secondary)]"> · {at.pyramid.teamSize(chart.membersOf.get(activePerson.id)?.length ?? 0)}</span>
          </p>
        ) : (
          <p className="text-[var(--text-secondary)]">{at.pyramid.hint}</p>
        )}
        {/* Stays mounted (disabled when idle) so clicking it never drops keyboard focus. */}
        <button
          type="button"
          onClick={clearTrace}
          disabled={selected === null}
          className="ml-auto inline-flex items-center gap-1 min-h-[32px] px-3 rounded-md border border-[var(--border)] text-[var(--text-secondary)] enabled:hover:text-[var(--text-primary)] enabled:hover:border-[var(--border-hi)] disabled:opacity-40 disabled:cursor-default transition-colors"
        >
          <X className="h-3.5 w-3.5" aria-hidden /> {at.pyramid.clearSelection}
        </button>
      </div>

      <div ref={containerRef} className="relative flex flex-col lg:flex-row gap-4">
        <svg className="absolute inset-0 z-0 w-full h-full pointer-events-none overflow-visible" aria-hidden>
          {paths.map((p) => {
            const isLit = related !== null && related.has(p.leaderId) && related.has(p.memberId);
            const isFaded = related !== null && !isLit;
            return (
              <path
                key={p.key}
                d={p.d}
                fill="none"
                strokeWidth={isLit ? 2.5 : 1.5}
                className={`motion-safe:transition-[opacity,stroke] motion-safe:duration-200 ${
                  isLit ? 'stroke-[var(--accent-cr)]' : 'stroke-[var(--border-hi)]'
                } ${isFaded ? 'opacity-20' : 'opacity-100'}`}
              />
            );
          })}
        </svg>

        {/* Chain pyramid: the narrowest tier on top, the base spans the full width. */}
        <ol className="flex-1 flex flex-col items-center gap-8" aria-label={at.level}>
          {chart.chain.map((tier, i) => (
            <li key={tier.level.id} className="w-full flex justify-center">
              <TierBand tier={tier} width={`${Math.round(45 + (55 * (i + 1)) / chart.chain.length)}%`}>
                {tier.people.map((p) => cardFor(p, i > 0))}
              </TierBand>
            </li>
          ))}
        </ol>

        {/* Parallel branch (NPR) and the superusers outside the pyramid. */}
        <div className="lg:w-64 flex flex-col gap-3">
          {chart.parallel.map((tier) => (
            <div key={tier.level.id}>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">{at.pyramid.parallel}</p>
              <TierBand tier={tier} width="100%">
                {tier.people.map((p) => cardFor(p, false))}
              </TierBand>
            </div>
          ))}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">{at.pyramid.outside}</p>
            <div className="rounded-md border border-dashed border-[var(--border-hi)] p-3 bg-[var(--bg-card)]">
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

      <p className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <svg width="24" height="8" aria-hidden><path d="M0 4 H24" className="stroke-[var(--border-hi)]" strokeWidth="1.5" /></svg>
        {at.pyramid.legend}
      </p>
    </div>
  );
}

/**
 * The upper card's bottom edge to the lower card's top edge. Two cards in one row get an arc
 * over the row, so the line never runs through the cards between them.
 */
function edgePath(leader: DOMRect, member: DOMRect, box: DOMRect): string {
  const cx = (r: DOMRect) => r.left + r.width / 2 - box.left;
  if (Math.abs(member.top - leader.top) < SAME_ROW_PX) {
    const y = leader.top - box.top;
    const lift = y - SAME_ROW_ARC_PX;
    return `M${cx(leader)} ${y} C${cx(leader)} ${lift}, ${cx(member)} ${lift}, ${cx(member)} ${y}`;
  }
  const [upper, lower] = member.top < leader.top ? [member, leader] : [leader, member];
  const y1 = upper.bottom - box.top;
  const y2 = lower.top - box.top;
  const ym = (y1 + y2) / 2;
  return `M${cx(upper)} ${y1} C${cx(upper)} ${ym}, ${cx(lower)} ${ym}, ${cx(lower)} ${y2}`;
}

function TierBand({ tier, width, children }: { tier: OrgTier; width: string; children: React.ReactNode }) {
  const at = useAccessT();
  return (
    <section
      style={{ ['--tier-w' as string]: width }}
      className={`w-full lg:w-[var(--tier-w)] rounded-md border p-3 ${
        tier.approves ? 'border-[var(--accent-cr)]' : 'border-[var(--border)]'
      }`}
    >
      <header className="flex flex-wrap items-baseline gap-2 mb-2">
        <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{tier.level.code}</span>
        <span className="text-[11px] text-[var(--text-secondary)]">{tier.level.name}</span>
        {tier.approves && (
          <span className="text-[10px] text-[var(--accent-cr)]">{at.pyramid.approvesFor(tier.level.code)}</span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
          <Users className="h-3 w-3" aria-hidden /> {tier.people.length}
        </span>
      </header>
      {tier.people.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)]">{at.pyramid.empty}</p>
      ) : (
        <ul className="flex flex-wrap justify-center gap-3">{children}</ul>
      )}
    </section>
  );
}

interface PersonCardProps {
  person: OrgPerson;
  teamSize: number;
  hasLeader: boolean;
  /** Below the top tier a person without a leader is a gap in the structure worth flagging. */
  flagMissingLeader: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  nodeRef: (el: HTMLElement | null) => void;
  onToggle: () => void;
  onPreview: (on: boolean) => void;
}

function PersonCard({
  person,
  teamSize,
  hasLeader,
  flagMissingLeader,
  isSelected,
  isDimmed,
  nodeRef,
  onToggle,
  onPreview,
}: PersonCardProps) {
  const at = useAccessT();
  const isMissingLeader = flagMissingLeader && !hasLeader;
  return (
    <li>
      <button
        ref={nodeRef}
        type="button"
        aria-pressed={isSelected}
        onClick={onToggle}
        onMouseEnter={() => onPreview(true)}
        onMouseLeave={() => onPreview(false)}
        onFocus={() => onPreview(true)}
        onBlur={() => onPreview(false)}
        // The card face stays opaque and only its content dims, so lines never show through it.
        className={`relative z-10 min-h-[44px] min-w-[140px] max-w-[220px] px-3 py-2 rounded-md border text-left bg-[var(--bg-card)] cursor-pointer motion-safe:transition-[border-color,box-shadow] motion-safe:duration-200 [&>*]:motion-safe:transition-opacity [&>*]:motion-safe:duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-cr)] ${
          isSelected
            ? 'border-[var(--accent-cr)] shadow-[0_0_0_1px_var(--accent-cr)]'
            : 'border-[var(--border)] hover:border-[var(--border-hi)]'
        } ${isDimmed ? '[&>*]:opacity-40' : ''}`}
      >
        <span className="block text-xs font-semibold text-[var(--text-primary)] truncate" title={person.name}>
          {person.name}
        </span>
        <span className="block text-[11px] text-[var(--text-secondary)] truncate">{person.roleName}</span>
        {(teamSize > 0 || isMissingLeader) && (
          <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-[var(--text-secondary)]">
            {teamSize > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden /> {at.pyramid.teamSize(teamSize)}
              </span>
            )}
            {isMissingLeader && (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-[var(--accent-hrs)]" aria-hidden /> {at.pyramid.noLeader}
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}
