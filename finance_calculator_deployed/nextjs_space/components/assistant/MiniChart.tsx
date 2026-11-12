'use client';

// A small trend chart under an assistant answer (docs/ai-assistant-plan.md D8). Drawn from the
// same server-built cells as the table above it - the table stays the accessible, exact version;
// the chart only shows the shape. No axis numbers: values are read from the tooltip and the
// table, both written by the server, so nothing here formats a figure of its own.

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { ChartBlock, ChartPoint } from '@/lib/assistant/blocks';

const CHART_HEIGHT = 160;

/** "październik 2026" -> "paź 26", "III kwartał 2026" -> "III kw. 26"; a week keeps its first date. */
function shortTick(label: string): string {
  const quarter = /^(\S+) kwartał (\d{4})$/.exec(label);
  if (quarter) return `${quarter[1]} kw. ${quarter[2].slice(2)}`;
  const monthYear = /^(\S+) (\d{4})$/.exec(label);
  if (monthYear) return `${monthYear[1].slice(0, 3)} ${monthYear[2].slice(2)}`;
  return label.slice(0, 5);
}

function TooltipBody({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-md border border-brd bg-[var(--bg-card)] px-2.5 py-1.5 text-xs shadow-sm">
      <div className="text-txt-secondary">{point.label}</div>
      <div className="font-semibold tabular-nums text-txt-primary">{point.text}</div>
    </div>
  );
}

const AXIS = {
  dataKey: 'label',
  tickFormatter: shortTick,
  tick: { fontSize: 11, fill: 'var(--text-muted)' },
  tickLine: false,
  axisLine: false,
  interval: 'preserveStartEnd' as const,
  minTickGap: 8,
};

export function MiniChart({ block }: { block: ChartBlock }) {
  // Screen readers get the whole series as text instead of the drawing.
  const summary = `${block.title}: ${block.points.map((p) => `${p.label} ${p.text}`).join('; ')}`;
  const grid = <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />;
  // No entrance animation: the figures are readable at once (and nothing moves for reduced motion).
  const tooltip = <Tooltip content={<TooltipBody />} cursor={{ fill: 'var(--accent-tint)' }} isAnimationActive={false} />;

  return (
    <figure className="m-0">
      <figcaption className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-txt-muted">{block.title}</figcaption>
      <div role="img" aria-label={summary} className="rounded-md border border-brd px-1 pt-2">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          {block.kind === 'line' ? (
            <LineChart data={block.points} margin={{ top: 4, right: 12, bottom: 0, left: 12 }}>
              {grid}
              <XAxis {...AXIS} />
              {tooltip}
              <Line dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          ) : (
            <BarChart data={block.points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              {grid}
              <XAxis {...AXIS} />
              {tooltip}
              <Bar dataKey="value" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
