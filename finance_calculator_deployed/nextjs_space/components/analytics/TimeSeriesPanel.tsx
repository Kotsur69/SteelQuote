'use client';

// The timeline: one measure over the chosen period, optionally broken down by a dimension.
//
// ONE VALUE AXIS, always. Tons and money are different scales, and putting both on one plot
// with two y-axes lets the reader believe two lines crossed when nothing crossed - the axis
// pair decides where they meet. Comparing measures is done by switching the measure, or by
// reading the panel below; never by stacking scales.
//
// Measures that do not sum cannot be split into series either: an average margin across four
// salespeople is not the sum of four averages, and a distinct client count double-counts
// anyone who bought from two of them. Those two measures ignore the split and draw the single
// aggregate line, which is the honest reading.

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsBucket, Granularity, Measure } from '@/lib/analytics';
import { OTHER_KEY } from '@/lib/analytics';
import type { Currency } from '@/lib/currency';
import type { Language } from '@/lib/translations';
import { bucketLabel, bucketRangeLabel } from '@/lib/analyticsPeriods';
import {
  AREA_FILL_OPACITY,
  AXIS_COLOR,
  BAR_RADIUS,
  DOT_RADIUS,
  GRID_COLOR,
  LINE_STROKE_WIDTH,
  OTHER_COLOR,
  SEGMENT_STROKE_WIDTH,
  SURFACE_COLOR,
  TICK_COLOR,
} from '@/lib/chartColors';
import {
  CURRENCY_UNIT,
  formatInt,
  formatMoney,
  formatMoneyShort,
  formatPct,
  formatTons,
} from '@/lib/analyticsFormat';
import ChartTooltip from './ChartTooltip';

export type TimeChartKind = 'line' | 'area' | 'stackedArea' | 'bar' | 'stackedBar';

/** Measures that can be broken into additive series. See the note at the top of the file. */
export const SPLITTABLE_MEASURES: Measure[] = ['tons', 'value', 'offers'];

interface TimeSeriesPanelProps {
  series: AnalyticsBucket[];
  splitKeys: { key: string; label: string }[];
  /** Resolved colour per split key, in draw order. */
  colorFor: (key: string, index: number) => string;
  measure: Measure;
  kind: TimeChartKind;
  granularity: Granularity;
  currency: Currency;
  language: Language;
  measureLabel: string;
  totalLabel: string;
}

const TOTAL_KEY = '__total__';

/** The bucket field a measure reads, and the matching field inside bucket.split. */
function readBucket(bucket: AnalyticsBucket, measure: Measure, currency: Currency): number {
  switch (measure) {
    case 'tons':
      return bucket.tonsOffered;
    case 'value':
      return currency === 'PLN' ? bucket.valueOfferedPln : bucket.valueOfferedEur;
    case 'offers':
      return bucket.offers;
    case 'clients':
      return bucket.clients;
    case 'marginPct':
      return bucket.avgMarginPct ?? 0;
  }
}

function readSplit(
  bucket: AnalyticsBucket,
  measure: Measure,
  currency: Currency,
  key: string
): number {
  switch (measure) {
    case 'tons':
      return bucket.split.tons[key] ?? 0;
    case 'value':
      return (currency === 'PLN' ? bucket.split.valuePln : bucket.split.valueEur)[key] ?? 0;
    case 'offers':
      return bucket.split.offers[key] ?? 0;
    default:
      return 0;
  }
}

export function formatMeasure(
  value: number,
  measure: Measure,
  currency: Currency,
  language: Language
): string {
  switch (measure) {
    case 'tons':
      return `${formatTons(value, language)} t`;
    case 'value':
      return `${formatMoney(value, language)} ${CURRENCY_UNIT[currency]}`;
    case 'offers':
    case 'clients':
      return formatInt(value, language);
    case 'marginPct':
      return formatPct(value, language);
  }
}

function axisTick(value: number, measure: Measure, language: Language): string {
  switch (measure) {
    case 'value':
      return formatMoneyShort(value, language);
    case 'marginPct':
      return `${Math.round(value)}%`;
    case 'tons':
      return formatMoneyShort(value, language);
    default:
      return formatInt(value, language);
  }
}

export default function TimeSeriesPanel({
  series,
  splitKeys,
  colorFor,
  measure,
  kind,
  granularity,
  currency,
  language,
  measureLabel,
  totalLabel,
}: TimeSeriesPanelProps) {
  const isSplit = splitKeys.length > 0 && SPLITTABLE_MEASURES.includes(measure);
  const stacked = kind === 'stackedArea' || kind === 'stackedBar';

  const data = useMemo(
    () =>
      series.map((bucket) => {
        const row: Record<string, number | string> = {
          bucket: bucket.bucket,
          label: bucketLabel(bucket.bucket, granularity),
          [TOTAL_KEY]: readBucket(bucket, measure, currency),
        };
        if (isSplit) {
          for (const { key } of splitKeys) {
            row[key] = readSplit(bucket, measure, currency, key);
          }
        }
        return row;
      }),
    [series, granularity, measure, currency, isSplit, splitKeys]
  );

  const drawn = isSplit
    ? splitKeys.map((entry, index) => ({
        key: entry.key,
        label: entry.label,
        color: entry.key === OTHER_KEY ? OTHER_COLOR : colorFor(entry.key, index),
      }))
    : [{ key: TOTAL_KEY, label: measureLabel, color: 'var(--accent-cr)' }];

  const renderTooltip = ({
    active,
    label,
    payload,
  }: {
    active?: boolean;
    label?: string | number;
    payload?: { dataKey?: string | number; value?: number | string }[];
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = data.find((d) => d.label === label);
    const bucket = typeof row?.bucket === 'string' ? row.bucket : '';

    // Stacked marks are read as a whole as much as segment by segment, so the total travels
    // with the tooltip instead of forcing the reader to add the segments up.
    const total = payload.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0);

    return (
      <ChartTooltip
        title={bucket ? bucketRangeLabel(bucket, granularity) : String(label ?? '')}
        subtitle={measureLabel}
        entries={payload
          .slice()
          .reverse()
          .map((entry) => {
            const key = String(entry.dataKey ?? '');
            const meta = drawn.find((d) => d.key === key);
            return {
              key,
              label: meta?.label ?? key,
              color: meta?.color ?? 'var(--text-secondary)',
              value: formatMeasure(Number(entry.value ?? 0), measure, currency, language),
            };
          })}
        footer={
          payload.length > 1
            ? `${totalLabel}: ${formatMeasure(total, measure, currency, language)}`
            : undefined
        }
      />
    );
  };

  const axes = (
    <>
      {/* Recessive grid: horizontal only. Vertical lines add nothing here and compete with
          the marks for attention. */}
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
      <YAxis
        stroke={AXIS_COLOR}
        tick={{ fill: TICK_COLOR, fontSize: 10, fontFamily: 'monospace' }}
        tickLine={false}
        axisLine={false}
        width={52}
        tickFormatter={(value: number) => axisTick(value, measure, language)}
      />
      <Tooltip content={renderTooltip} cursor={{ stroke: GRID_COLOR, strokeWidth: 1 }} />
    </>
  );

  const height = 300;

  if (kind === 'bar' || kind === 'stackedBar') {
    return (
      <div style={{ minWidth: Math.max(320, data.length * 28) }}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {axes}
            {drawn.map((entry) => (
              <Bar
                key={entry.key}
                dataKey={entry.key}
                stackId={stacked ? 'stack' : undefined}
                fill={entry.color}
                // A 2px surface-coloured edge keeps neighbouring segments and adjacent bars
                // from bleeding into one another.
                stroke={SURFACE_COLOR}
                strokeWidth={SEGMENT_STROKE_WIDTH}
                radius={stacked ? undefined : BAR_RADIUS}
                maxBarSize={38}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (kind === 'area' || kind === 'stackedArea') {
    return (
      <div style={{ minWidth: Math.max(320, data.length * 24) }}>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {axes}
            {drawn.map((entry) => (
              <Area
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                stackId={stacked ? 'stack' : undefined}
                stroke={entry.color}
                strokeWidth={LINE_STROKE_WIDTH}
                fill={entry.color}
                fillOpacity={AREA_FILL_OPACITY}
                dot={false}
                activeDot={{ r: DOT_RADIUS + 1, stroke: SURFACE_COLOR, strokeWidth: 2 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ minWidth: Math.max(320, data.length * 24) }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {axes}
          {drawn.map((entry) => (
            <Line
              key={entry.key}
              type="monotone"
              dataKey={entry.key}
              stroke={entry.color}
              strokeWidth={LINE_STROKE_WIDTH}
              // A dot per point turns a long series into a dotted mess; the hover dot is
              // where per-point reading happens.
              dot={data.length <= 24 ? { r: DOT_RADIUS, strokeWidth: 0 } : false}
              activeDot={{ r: DOT_RADIUS + 1, stroke: SURFACE_COLOR, strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
