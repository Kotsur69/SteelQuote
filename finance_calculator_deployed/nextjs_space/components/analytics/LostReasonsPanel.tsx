'use client';

// Why offers were lost, as ranked bars: one row per reason the client gave, with the share of
// lost offers drawn as the bar and the exact numbers written beside it (offers, tonnage,
// value). The reason is always spelled out, so colour never carries it - every bar is the one
// "lost" red because the rows differ by length, not by hue.

import type { LostReasonStat } from '@/lib/analytics';
import type { Currency } from '@/lib/currency';
import type { Language } from '@/lib/translations';
import { lostReasonLabel } from '@/lib/lostReasons';
import { BAR_FILL_OPACITY, DECISION_COLOR, DECISION_ICON } from '@/lib/chartColors';
import { CURRENCY_UNIT, formatMoney, formatPct, formatTons } from '@/lib/analyticsFormat';

interface LostReasonsPanelProps {
  stats: LostReasonStat[];
  currency: Currency;
  language: Language;
  offersCountLabel: string;
}

export default function LostReasonsPanel({
  stats,
  currency,
  language,
  offersCountLabel,
}: LostReasonsPanelProps) {
  // Biggest reason first. The server sends the fixed LOST_REASONS order; a ranking is what
  // answers "what should we fix first", so it is sorted here, ties keeping the fixed order.
  const ranked = [...stats].sort((a, b) => b.offers - a.offers);

  return (
    <ul className="space-y-3 list-none">
      {ranked.map((stat) => {
        const value = currency === 'EUR' ? stat.valueLostEur : stat.valueLostPln;
        return (
          <li key={stat.reason}>
            <div className="flex items-baseline gap-2">
              <span aria-hidden style={{ color: DECISION_COLOR.lost }}>
                {DECISION_ICON.lost}
              </span>
              <span className="text-[11px] font-mono text-[var(--text-primary)]">
                {lostReasonLabel(stat.reason, language)}
              </span>
              <span className="ml-auto text-[11px] font-mono text-[var(--text-primary)] tabular-nums">
                {formatPct(stat.sharePct, language)}
              </span>
            </div>
            <div
              className="mt-1 h-2 rounded-sm bg-[var(--bg-input)] overflow-hidden"
              role="img"
              aria-label={`${lostReasonLabel(stat.reason, language)}: ${formatPct(stat.sharePct, language)}`}
            >
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${stat.sharePct}%`,
                  backgroundColor: DECISION_COLOR.lost,
                  opacity: BAR_FILL_OPACITY,
                }}
              />
            </div>
            <p className="mt-1 text-[10px] font-mono text-[var(--text-muted)] tabular-nums">
              {stat.offers} {offersCountLabel} · {formatTons(stat.tonsLost, language)} t ·{' '}
              {formatMoney(value, language)} {CURRENCY_UNIT[currency]}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
