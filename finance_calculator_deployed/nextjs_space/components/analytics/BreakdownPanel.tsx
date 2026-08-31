'use client';

// One dimension, one measure, four ways to look at it: horizontal bars, a pie, a donut, or the
// numbers as a table.
//
// Horizontal bars are the default and the honest choice for comparing magnitudes - the labels
// have room to be read, and length is easier to compare than angle. The pie and donut exist
// because they are what people expect for a share-of-total question; they are capped at the
// folded series count for exactly the reason the fold exists.
//
// Percentages are of the visible total. When the "Others" fold is present it is part of that
// total, so the shares still add to 100 and nothing quietly disappears.

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { AnalyticsGroup, Measure } from '@/lib/analytics';
import { OTHER_KEY } from '@/lib/analytics';
import type { Currency } from '@/lib/currency';
import type { Language } from '@/lib/translations';
import { OTHER_COLOR, SEGMENT_STROKE_WIDTH, SURFACE_COLOR } from '@/lib/chartColors';
import { formatPct } from '@/lib/analyticsFormat';
import { formatMeasure } from './TimeSeriesPanel';
import ChartTooltip from './ChartTooltip';

export type BreakdownChartKind = 'bar' | 'pie' | 'donut' | 'table';

interface BreakdownPanelProps {
  groups: AnalyticsGroup[];
  colorFor: (key: string, index: number) => string;
  measure: Measure;
  kind: BreakdownChartKind;
  currency: Currency;
  language: Language;
  measureLabel: string;
  totalLabel: string;
  /** Clicking an entry drills the whole page down to it, where the dimension supports it. */
  onSelect?: (key: string) => void;
  labels: { winRate: string; offersCount: string };
}

function measureValue(group: AnalyticsGroup, measure: Measure, currency: Currency): number {
  switch (measure) {
    case 'tons':
      return group.tonsOffered;
    case 'value':
      return currency === 'PLN' ? group.valueOfferedPln : group.valueOfferedEur;
    case 'offers':
      return group.offers;
    case 'clients':
      return group.clients;
    case 'marginPct':
      return group.avgMarginPct ?? 0;
  }
}

export default function BreakdownPanel({
  groups,
  colorFor,
  measure,
  kind,
  currency,
  language,
  measureLabel,
  totalLabel,
  onSelect,
  labels,
}: BreakdownPanelProps) {
  const rows = groups
    .map((group, index) => ({
      key: group.key,
      label: group.label,
      color: group.key === OTHER_KEY ? OTHER_COLOR : colorFor(group.key, index),
      value: measureValue(group, measure, currency),
      group,
    }))
    .filter((row) => row.value !== 0 || measure === 'marginPct');

  // An average is not a share of anything, so the percentage column is suppressed for it
  // rather than printing a meaningless "23% of the total margin".
  const shareable = measure !== 'marginPct';
  const total = shareable ? rows.reduce((sum, row) => sum + row.value, 0) : 0;
  const share = (value: number) => (total > 0 ? (value / total) * 100 : null);

  const tooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: { payload?: { key?: string } }[];
  }) => {
    const key = payload?.[0]?.payload?.key;
    const row = rows.find((r) => r.key === key);
    if (!active || !row) return null;
    return (
      <ChartTooltip
        title={row.label}
        subtitle={measureLabel}
        entries={[
          {
            key: row.key,
            label: measureLabel,
            color: row.color,
            value: formatMeasure(row.value, measure, currency, language),
          },
        ]}
        footer={
          shareable && share(row.value) !== null
            ? `${formatPct(share(row.value), language)} · ${row.group.offers} ${labels.offersCount}`
            : `${row.group.offers} ${labels.offersCount}`
        }
      />
    );
  };

  if (kind === 'table') {
    return (
      <BreakdownTable
        rows={rows}
        measure={measure}
        currency={currency}
        language={language}
        measureLabel={measureLabel}
        totalLabel={totalLabel}
        total={total}
        share={share}
        shareable={shareable}
        onSelect={onSelect}
        labels={labels}
      />
    );
  }

  if (kind === 'pie' || kind === 'donut') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="label"
            innerRadius={kind === 'donut' ? 62 : 0}
            outerRadius={104}
            paddingAngle={1}
            // Direct labels while there is room for them; past four slices the legend in the
            // panel header carries identity instead of a ring of overlapping text.
            label={
              rows.length <= 4
                ? ({ index }: { index?: number }) => rows[index ?? 0]?.label ?? ''
                : false
            }
            labelLine={false}
            stroke={SURFACE_COLOR}
            strokeWidth={SEGMENT_STROKE_WIDTH}
            onClick={onSelect ? (entry: { key?: string }) => entry.key && onSelect(entry.key) : undefined}
          >
            {rows.map((row) => (
              <Cell key={row.key} fill={row.color} cursor={onSelect ? 'pointer' : undefined} />
            ))}
          </Pie>
          <Tooltip content={tooltip} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <HorizontalBars
      rows={rows}
      measure={measure}
      currency={currency}
      language={language}
      share={share}
      shareable={shareable}
      onSelect={onSelect}
    />
  );
}

interface Row {
  key: string;
  label: string;
  color: string;
  value: number;
  group: AnalyticsGroup;
}

interface BarsProps {
  rows: Row[];
  measure: Measure;
  currency: Currency;
  language: Language;
  share: (value: number) => number | null;
  shareable: boolean;
  onSelect?: (key: string) => void;
}

/**
 * Bars drawn as plain HTML rather than through the chart library.
 *
 * The label, the bar and the figure then share one flex row, so nothing collides and nothing
 * gets truncated by a fixed axis width - and every value is directly labelled, which is the
 * relief the light-mode contrast warning on three of the steel accents asks for.
 */
function HorizontalBars({
  rows,
  measure,
  currency,
  language,
  share,
  shareable,
  onSelect,
}: BarsProps) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <ul className="space-y-2 list-none">
      {rows.map((row) => {
        const pct = (Math.abs(row.value) / max) * 100;
        const sharePct = shareable ? share(row.value) : null;
        return (
          <li key={row.key}>
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(row.key)}
              className={`w-full text-left group ${onSelect ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: row.color }}
                />
                <span className="text-[11px] font-mono text-[var(--text-primary)] truncate">
                  {row.label}
                </span>
                <span className="ml-auto text-[11px] font-mono text-[var(--text-primary)] tabular-nums shrink-0">
                  {formatMeasure(row.value, measure, currency, language)}
                </span>
                {sharePct !== null && (
                  <span className="text-[10px] font-mono text-[var(--text-muted)] tabular-nums w-12 text-right shrink-0">
                    {formatPct(sharePct, language)}
                  </span>
                )}
              </div>
              <div className="mt-1 h-2 rounded-sm bg-[var(--bg-input)] overflow-hidden">
                <div
                  className="h-full rounded-sm transition-[width] duration-300"
                  style={{ width: `${pct}%`, backgroundColor: row.color }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface TableProps extends BarsProps {
  measureLabel: string;
  totalLabel: string;
  total: number;
  labels: { winRate: string; offersCount: string };
}

/** The table view every panel can switch to. Carries the win rate, which no single bar shows. */
function BreakdownTable({
  rows,
  measure,
  currency,
  language,
  measureLabel,
  totalLabel,
  total,
  share,
  shareable,
  onSelect,
  labels,
}: TableProps) {
  return (
    <table className="w-full text-[11px] font-mono border-collapse">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
          <th className="text-left font-medium py-1.5">{measureLabel}</th>
          <th className="text-right font-medium py-1.5">{measureLabel}</th>
          {shareable && <th className="text-right font-medium py-1.5 w-16">%</th>}
          <th className="text-right font-medium py-1.5 w-16">{labels.offersCount}</th>
          <th className="text-right font-medium py-1.5 w-20">{labels.winRate}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.key}
            onClick={() => onSelect?.(row.key)}
            className={`border-t border-[var(--border)] ${
              onSelect ? 'cursor-pointer hover:bg-[rgba(59,142,245,0.08)]' : ''
            }`}
          >
            <td className="py-1.5">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: row.color }}
                />
                <span className="text-[var(--text-primary)] truncate">{row.label}</span>
              </span>
            </td>
            <td className="py-1.5 text-right text-[var(--text-primary)] tabular-nums">
              {formatMeasure(row.value, measure, currency, language)}
            </td>
            {shareable && (
              <td className="py-1.5 text-right text-[var(--text-muted)] tabular-nums">
                {formatPct(share(row.value), language)}
              </td>
            )}
            <td className="py-1.5 text-right text-[var(--text-secondary)] tabular-nums">
              {row.group.offers}
            </td>
            <td className="py-1.5 text-right text-[var(--text-secondary)] tabular-nums">
              {formatPct(row.group.winRateTons, language)}
            </td>
          </tr>
        ))}
      </tbody>
      {shareable && (
        <tfoot>
          <tr className="border-t-[1.5px] border-[var(--border-hi)]">
            <td className="py-1.5 text-[var(--text-secondary)] uppercase text-[10px] tracking-widest">
              {totalLabel}
            </td>
            <td className="py-1.5 text-right text-[var(--text-primary)] font-semibold tabular-nums">
              {formatMeasure(total, measure, currency, language)}
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      )}
    </table>
  );
}
