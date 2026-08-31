'use client';

// Won, lost and still-open, in the two readings that answer different questions:
//
//  * the share bar - where the tonnage of THIS period stands right now, undecided tonnage
//    included, because hiding it would flatter the win rate;
//  * the win-rate line - whether the hit rate is improving over time.
//
// Won/lost is a polarity, so it takes two poles and a neutral middle rather than categorical
// hues, and it reuses the reserved green and red. Colour never carries it alone: every segment
// and every legend entry has its icon and its label.

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsBucket, AnalyticsKpi, ClientDecision, Granularity } from '@/lib/analytics';
import type { Language } from '@/lib/translations';
import { bucketLabel, bucketRangeLabel } from '@/lib/analyticsPeriods';
import {
  AXIS_COLOR,
  DECISION_COLOR,
  DECISION_ICON,
  DOT_RADIUS,
  GRID_COLOR,
  LINE_STROKE_WIDTH,
  SURFACE_COLOR,
  TICK_COLOR,
} from '@/lib/chartColors';
import { formatPct, formatTons } from '@/lib/analyticsFormat';
import ChartTooltip from './ChartTooltip';

interface WinLossPanelProps {
  kpi: AnalyticsKpi;
  series: AnalyticsBucket[];
  granularity: Granularity;
  language: Language;
  labels: {
    won: string;
    lost: string;
    pending: string;
    winRate: string;
    offersCount: string;
  };
  onFilterDecision?: (decision: ClientDecision) => void;
}

export default function WinLossPanel({
  kpi,
  series,
  granularity,
  language,
  labels,
  onFilterDecision,
}: WinLossPanelProps) {
  const segments: { decision: ClientDecision; label: string; tons: number; offers: number }[] = [
    { decision: 'won', label: labels.won, tons: kpi.tonsWon, offers: kpi.offersWon },
    { decision: 'lost', label: labels.lost, tons: kpi.tonsLost, offers: kpi.offersLost },
    {
      decision: 'pending',
      label: labels.pending,
      tons: kpi.tonsPending,
      offers: kpi.offersPending,
    },
  ];

  const totalTons = segments.reduce((sum, s) => sum + s.tons, 0);

  const rateData = series.map((bucket) => ({
    label: bucketLabel(bucket.bucket, granularity),
    bucket: bucket.bucket,
    // null buckets are left as null, not zeroed: "nothing was decided that week" is not the
    // same statement as "everything decided that week was lost".
    winRate: bucket.winRateTons,
    won: bucket.tonsWon,
    lost: bucket.tonsLost,
  }));

  const hasRate = rateData.some((row) => row.winRate !== null);

  return (
    <div className="space-y-5">
      {/* Share of tonnage by decision */}
      <div>
        <div className="flex h-7 rounded-md overflow-hidden border border-[var(--border)] bg-[var(--bg-input)]">
          {totalTons > 0 &&
            segments
              .filter((segment) => segment.tons > 0)
              .map((segment) => {
                const pct = (segment.tons / totalTons) * 100;
                return (
                  <button
                    key={segment.decision}
                    type="button"
                    disabled={!onFilterDecision}
                    onClick={() => onFilterDecision?.(segment.decision)}
                    title={`${segment.label}: ${formatTons(segment.tons, language)} t`}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: DECISION_COLOR[segment.decision],
                      // A 2px surface gap so neighbouring fills stay separable.
                      borderRight: `2px solid ${SURFACE_COLOR}`,
                    }}
                    className="flex items-center justify-center overflow-hidden transition-opacity hover:opacity-85"
                  >
                    {/* Direct label, but only where the segment is genuinely wide enough. */}
                    {pct >= 12 && (
                      <span className="text-[10px] font-mono font-semibold text-white drop-shadow-sm whitespace-nowrap px-1">
                        {formatPct(pct, language)}
                      </span>
                    )}
                  </button>
                );
              })}
        </div>

        <ul className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 list-none">
          {segments.map((segment) => (
            <li key={segment.decision} className="flex items-baseline gap-2">
              <span aria-hidden style={{ color: DECISION_COLOR[segment.decision] }}>
                {DECISION_ICON[segment.decision]}
              </span>
              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                {segment.label}
              </span>
              <span className="ml-auto text-[11px] font-mono text-[var(--text-primary)] tabular-nums">
                {formatTons(segment.tons, language)} t
              </span>
              <span className="text-[10px] font-mono text-[var(--text-muted)] tabular-nums">
                {segment.offers} {labels.offersCount}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Win rate over time */}
      {hasRate && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-mono mb-2">
            {labels.winRate}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={rateData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="label"
                stroke={AXIS_COLOR}
                tick={{ fill: TICK_COLOR, fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={{ stroke: GRID_COLOR }}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              {/* Fixed 0-100 domain: a win rate rescaled to its own range makes 48% and 52%
                  look like a collapse and a recovery. */}
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                stroke={AXIS_COLOR}
                tick={{ fill: TICK_COLOR, fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                width={38}
                tickFormatter={(value: number) => `${value}%`}
              />
              <Tooltip
                cursor={{ stroke: GRID_COLOR, strokeWidth: 1 }}
                content={({
                  active,
                  label,
                }: {
                  active?: boolean;
                  label?: string | number;
                }) => {
                  const row = rateData.find((r) => r.label === label);
                  if (!active || !row) return null;
                  return (
                    <ChartTooltip
                      title={bucketRangeLabel(row.bucket, granularity)}
                      subtitle={labels.winRate}
                      entries={[
                        {
                          key: 'rate',
                          label: labels.winRate,
                          color: DECISION_COLOR.won,
                          value: formatPct(row.winRate, language),
                        },
                        {
                          key: 'won',
                          label: labels.won,
                          color: DECISION_COLOR.won,
                          value: `${formatTons(row.won, language)} t`,
                        },
                        {
                          key: 'lost',
                          label: labels.lost,
                          color: DECISION_COLOR.lost,
                          value: `${formatTons(row.lost, language)} t`,
                        },
                      ]}
                    />
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="winRate"
                stroke={DECISION_COLOR.won}
                strokeWidth={LINE_STROKE_WIDTH}
                dot={{ r: DOT_RADIUS, strokeWidth: 0 }}
                activeDot={{ r: DOT_RADIUS + 1, stroke: SURFACE_COLOR, strokeWidth: 2 }}
                // Gaps stay gaps - see the note on null buckets above.
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
