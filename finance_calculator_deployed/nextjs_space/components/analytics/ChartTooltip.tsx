'use client';

// Shared Recharts tooltip. Every chart on the panel gets one: an HTML chart is interactive by
// nature, and hovering is how a reader gets an exact figure without a number printed on every
// mark. Values are formatted by the caller, which knows whether it is looking at tons, money
// or a percentage.

import type { ReactNode } from 'react';

export interface TooltipEntry {
  key: string;
  label: string;
  color: string;
  value: string;
  /** Rendered dimmer, under the value - a share, a count, a secondary reading. */
  hint?: string;
}

interface ChartTooltipProps {
  title: string;
  subtitle?: string;
  entries: TooltipEntry[];
  footer?: ReactNode;
}

export default function ChartTooltip({ title, subtitle, entries, footer }: ChartTooltipProps) {
  return (
    <div className="rounded-md border border-[var(--border-hi)] bg-[var(--bg-card)] px-3 py-2 shadow-lg min-w-[160px]">
      <p className="text-[11px] font-mono font-semibold text-[var(--text-primary)]">{title}</p>
      {subtitle && (
        <p className="text-[10px] font-mono text-[var(--text-secondary)] mt-0.5">{subtitle}</p>
      )}
      <ul className="mt-1.5 space-y-1 list-none">
        {entries.map((entry) => (
          <li key={entry.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="w-2 h-2 rounded-sm shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate max-w-[140px]">
              {entry.label}
            </span>
            <span className="ml-auto text-[11px] font-mono text-[var(--text-primary)] tabular-nums">
              {entry.value}
            </span>
          </li>
        ))}
      </ul>
      {footer && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)]">
          {footer}
        </div>
      )}
    </div>
  );
}
