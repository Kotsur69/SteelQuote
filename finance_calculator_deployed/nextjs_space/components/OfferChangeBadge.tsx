'use client';

import { Fragment, useId, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, RefreshCcw, UserCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ChangeSummary, OfferChange } from '@/lib/offerVersionDiff';
import {
  SHORT_LABEL_MAX,
  changeParts,
  changeShortParts,
  formatSummaryShort,
  moreLabel,
  type Trend,
  type VersionDiffStrings,
} from '@/lib/offerVersionDiffFormat';

type Props = {
  summary?: ChangeSummary | null;
};

const TREND_CLASS: Record<Trend, string> = {
  up: 'text-[var(--trend-up)]',
  down: 'text-[var(--trend-down)]',
};

// Margin / price / offer value going up is green with ▲, down is red with ▼ - the sign and the
// arrow carry the meaning too, so colour is never the only cue.
function TrendText({ trend, children }: { trend: Trend | null; children: ReactNode }) {
  if (!trend) return <>{children}</>;
  const Arrow = trend === 'up' ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${TREND_CLASS[trend]}`}>
      <Arrow className="h-2.5 w-2.5 shrink-0" strokeWidth={3} aria-hidden />
      {children}
    </span>
  );
}

function ShortList({ summary, s }: { summary: ChangeSummary; s: VersionDiffStrings }) {
  const more = moreLabel(summary, s);
  return (
    <>
      {summary.changes.slice(0, SHORT_LABEL_MAX).map((change, i) => {
        const p = changeShortParts(change, s);
        return (
          <Fragment key={`${change.field}-${change.item ?? ''}-${i}`}>
            {i > 0 && ', '}
            {p.text}
            {p.delta && (
              <>
                {' '}
                <TrendText trend={p.trend}>{p.delta}</TrendText>
              </>
            )}
          </Fragment>
        );
      })}
      {more && ` ${more}`}
    </>
  );
}

function DetailLine({ change, s }: { change: OfferChange; s: VersionDiffStrings }) {
  const p = changeParts(change, s);
  const arrowClass = p.trend ? `font-semibold ${TREND_CLASS[p.trend]}` : '';
  return (
    <li className="break-words">
      {p.label}
      {p.old !== null && p.new !== null && (
        <>
          {' '}
          {p.old} <span className={arrowClass}>→</span> {p.new}
        </>
      )}
      {p.delta && (
        <>
          {' '}
          (<TrendText trend={p.trend}>{p.delta}</TrendText>)
        </>
      )}
    </li>
  );
}

// "What changed" in this offer version, next to its offer_X.N label: a compact badge with up to
// three changes; a click unfolds the full old -> new list with the author and the event. The
// detail takes its own last line (order-last + basis-full) inside the flex-wrap row of badges,
// so the row's other badges stay together and nothing turns into a full-width coloured box.
// The rows it sits in are clickable (open the offer), so its own clicks never bubble up.
export default function OfferChangeBadge({ summary }: Props) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const detailId = useId();
  if (!summary) return null;

  const s = t.versionDiff;
  const label = formatSummaryShort(summary, s);
  const hasShortList = !summary.base && summary.changes.length > 0;
  const eventIcon =
    summary.event === 'renegotiation' ? (
      <RefreshCcw className="h-3 w-3 shrink-0" aria-hidden />
    ) : summary.event === 'reviewer_edit' ? (
      <UserCheck className="h-3 w-3 shrink-0" aria-hidden />
    ) : null;
  const eventLine = [s.events[summary.event], summary.author ? `${s.author}: ${summary.author}` : null]
    .filter(Boolean)
    .join(' · ');

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((open) => !open);
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={detailId}
        aria-label={`${eventLine} - ${label}`}
        title={label}
        className="inline-flex items-center gap-1 min-w-0 max-w-full px-1.5 py-0.5 rounded border border-[var(--border-hi)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cr)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-cr)] transition-colors cursor-pointer"
      >
        {eventIcon}
        <span className="truncate max-w-[26rem]">{hasShortList ? <ShortList summary={summary} s={s} /> : label}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      <div
        id={detailId}
        hidden={!isOpen}
        onClick={(e) => e.stopPropagation()}
        className="order-last basis-full min-w-0 mt-1 pl-2.5 border-l-2 border-[var(--border-hi)] text-[11px] leading-relaxed text-[var(--text-secondary)] cursor-default"
      >
        <p className="font-mono text-[10px] text-[var(--text-primary)] opacity-80">{eventLine}</p>
        {summary.changes.length > 0 && (
          <>
            <p className="sr-only">{s.detailsTitle}</p>
            <ul className="mt-0.5 space-y-0.5">
              {summary.changes.map((change, i) => (
                <DetailLine key={`${change.field}-${change.item ?? ''}-${i}`} change={change} s={s} />
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
