'use client';

import { useLanguage } from '@/contexts/LanguageContext';

type OfferStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'sent';

// Filters the /senior offer list understands. 'pending' = awaiting my decision, 'awaitingSend'
// = approved and not yet sent; the remaining statuses filter the list by plain offer status.
export type SeniorFilter = 'pending' | 'awaitingSend' | 'reviewed' | 'all' | 'clients' | 'pending_review' | 'rejected' | 'sent';

// Drafts are left out: the validation queue only holds offers awaiting the verifier and their
// own review history (app/api/senior/offers), so a draft tile would always read 0.
const STATUS_TILES: { status: OfferStatus; filter: SeniorFilter; accent: string }[] = [
  { status: 'pending_review', filter: 'pending_review', accent: 'var(--accent-hrs)' },
  // "Approved" is exactly the awaiting-send list, so it shares that filter and highlight.
  { status: 'approved', filter: 'awaitingSend', accent: 'var(--accent-hdg)' },
  { status: 'rejected', filter: 'rejected', accent: 'var(--accent-sum)' },
  { status: 'sent', filter: 'sent', accent: 'var(--accent-cr)' },
];

interface SeniorStatusTilesProps {
  pendingCount: number;
  awaitingSendCount: number;
  statusCounts: Record<OfferStatus, number>;
  activeFilter: SeniorFilter;
  onSelect: (filter: SeniorFilter) => void;
}

// Dashboard header of the validation panel, modelled on the admin dashboard tiles: the two
// actionable queues up top, the status breakdown below. Every tile filters the offer list,
// where the per-offer actions (approve / reject / send) live.
export default function SeniorStatusTiles({
  pendingCount,
  awaitingSendCount,
  statusCounts,
  activeFilter,
  onSelect,
}: SeniorStatusTilesProps) {
  const { t } = useLanguage();

  const tileState = (filter: SeniorFilter) =>
    activeFilter === filter
      ? 'border-[#3b8ef5] bg-[rgba(59,142,245,0.08)]'
      : 'border-[var(--border)] hover:border-[var(--border-hi)] hover:bg-[rgba(255,255,255,0.03)]';

  const actionTiles = [
    { filter: 'pending' as const, label: t.senior.pendingOnly, count: pendingCount, hint: t.senior.tileReviewHint, accent: 'var(--accent-hrs)' },
    { filter: 'awaitingSend' as const, label: t.senior.awaitingSend, count: awaitingSendCount, hint: t.senior.tileSendHint, accent: 'var(--accent-hdg)' },
  ];

  return (
    <div className="space-y-4 mb-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {actionTiles.map((tile) => (
          <button
            key={tile.filter}
            type="button"
            onClick={() => onSelect(tile.filter)}
            aria-pressed={activeFilter === tile.filter}
            className={`group text-left bg-[var(--bg-card)] border rounded-md p-5 transition-colors ${tileState(tile.filter)}`}
          >
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-mono">
              {tile.label}
            </p>
            <div className="flex items-end justify-between gap-3 mt-2">
              <p className="text-3xl font-semibold font-mono" style={{ color: tile.accent }}>
                {tile.count}
              </p>
              {tile.count > 0 && (
                <span className="text-[11px] font-mono text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]">
                  {tile.hint}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
            {t.admin.offersByStatus}
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[var(--border)]">
          {STATUS_TILES.map(({ status, filter, accent }) => {
            const isActive = activeFilter === filter;
            return (
              <button
                key={status}
                type="button"
                onClick={() => onSelect(filter)}
                aria-pressed={isActive}
                className={`group p-4 text-center transition-colors ${
                  isActive ? 'bg-[rgba(59,142,245,0.08)]' : 'hover:bg-[rgba(255,255,255,0.03)]'
                }`}
              >
                <p className="text-2xl font-semibold font-mono" style={{ color: accent }}>
                  {statusCounts[status]}
                </p>
                <p
                  className={`text-[10px] uppercase tracking-wider mt-1 transition-colors ${
                    isActive ? 'text-[#3b8ef5]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t.offerStatus[status]}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
