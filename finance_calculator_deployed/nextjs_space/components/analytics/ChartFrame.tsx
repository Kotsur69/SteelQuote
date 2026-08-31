'use client';

// The shell every analytics panel sits in, plus the two pieces of chart furniture that must
// look identical across all of them: the legend and the tooltip.
//
// Three rules from the chart guidelines are enforced here rather than left to each panel:
//
//  * A legend is always present for two or more series, and it carries the colour swatch next
//    to a text label - identity is never colour alone. A single series needs no legend box,
//    because the panel title already names it.
//  * Wide content scrolls inside its own container. The page body never scrolls sideways.
//  * Every panel can switch to a table. That is the standing relief for the three steel
//    accents whose light-mode contrast sits below 3:1, and it is also the answer for anyone
//    who simply wants the numbers.

import type { ReactNode } from 'react';

interface ChartFrameProps {
  title: string;
  /** Accent for the heading dot. Ties a panel to the thing it is about. */
  accent?: string;
  /** Controls rendered on the header's right-hand side (measure, chart type, ...). */
  controls?: ReactNode;
  /** Legend entries. Rendered whenever there are two or more. */
  legend?: { key: string; label: string; color: string }[];
  /** Shown instead of the body when there is nothing to draw. */
  empty?: boolean;
  emptyLabel?: string;
  children: ReactNode;
}

export default function ChartFrame({
  title,
  accent = 'var(--accent-cr)',
  controls,
  legend,
  empty,
  emptyLabel,
  children,
}: ChartFrameProps) {
  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
        <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
          {title}
        </h2>
        {controls && <div className="ml-auto flex flex-wrap items-center gap-2">{controls}</div>}
      </header>

      {legend && legend.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 pt-3 list-none">
          {legend.map((entry) => (
            <li key={entry.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                {entry.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {empty ? (
        <p className="px-4 py-10 text-center text-[12px] font-mono text-[var(--text-secondary)]">
          {emptyLabel ?? '—'}
        </p>
      ) : (
        <div className="p-4 overflow-x-auto">{children}</div>
      )}
    </section>
  );
}
