'use client';

// Small filter controls shared by the analytics panels. Visual language is the one already
// used by the calculator's toggle buttons and the offers list: mono type, 1px borders drawn
// from --border, the accent blue for the active state, and no colour that is not a theme
// custom property - so light, dark and high contrast all work without a second stylesheet.

import { useEffect, useRef, useState } from 'react';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

interface SegmentedProps<T extends string> {
  label?: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
}

/** One-of-many switch. Used for measures, chart types, granularity and the date basis. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-mono">
          {label}
        </span>
      )}
      <div
        className="flex flex-wrap gap-1 p-0.5 rounded-md border border-[var(--border)] bg-[var(--bg-input)]"
        role="group"
        aria-label={label}
      >
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              title={option.title ?? option.label}
              aria-pressed={isActive}
              onClick={() => onChange(option.value)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors border ${
                isActive
                  ? 'border-[#3b8ef5] text-[#3b8ef5] bg-[rgba(59,142,245,0.15)] font-bold'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hi)]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional colour dot, so a steel type is recognisable in the filter too. */
  color?: string;
}

interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  /** Empty means "everything" - see the note in lib/analyticsQuery.ts. */
  selected: string[];
  onChange: (selected: string[]) => void;
  allLabel: string;
  selectedLabel: string;
  emptyLabel?: string;
}

/**
 * Many-of-many filter in a dropdown.
 *
 * An empty selection reads as "no filter", not "nothing": unticking every steel type shows
 * all of them rather than blanking the page, which is what a reader who just cleared a filter
 * expects to see.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  allLabel,
  selectedLabel,
  emptyLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside and Escape both close it; a filter panel left hanging over a chart is worse
  // than one extra click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (value: string) => {
    // An empty selection is DISPLAYED as everything ticked, so unticking one entry there has
    // to produce "all except this one" - not "only this one", which is what a naive
    // includes/append would do and would read as the filter inverting itself.
    const effective = selected.length === 0 ? options.map((o) => o.value) : selected;
    onChange(
      effective.includes(value) ? effective.filter((v) => v !== value) : [...effective, value]
    );
  };

  const summary =
    selected.length === 0 || selected.length === options.length
      ? allLabel
      : `${selected.length} ${selectedLabel}`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-input)] text-[11px] font-mono text-[var(--text-primary)] hover:border-[var(--border-hi)] transition-colors"
      >
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
          {label}
        </span>
        <span>{summary}</span>
        <span className="text-[8px] text-[var(--text-secondary)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 min-w-[220px] max-h-[320px] overflow-y-auto rounded-md border border-[var(--border-hi)] bg-[var(--bg-card)] shadow-lg">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <button
              type="button"
              onClick={() => onChange(options.map((o) => o.value))}
              className="text-[10px] font-mono text-[var(--accent-cr)] hover:underline"
            >
              {allLabel}
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          </div>

          {options.length === 0 && (
            <p className="px-3 py-3 text-[11px] font-mono text-[var(--text-secondary)]">
              {emptyLabel ?? '—'}
            </p>
          )}

          {options.map((option) => {
            const isOn = selected.length === 0 || selected.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono cursor-pointer hover:bg-[rgba(59,142,245,0.10)]"
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggle(option.value)}
                  className="accent-[#3b8ef5]"
                />
                {option.color && (
                  <span
                    aria-hidden
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: option.color }}
                  />
                )}
                <span className="text-[var(--text-primary)] truncate">{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DateRangeProps {
  fromLabel: string;
  toLabel: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

/** Two native date inputs. Only shown once the reader picks the custom period preset. */
export function DateRange({ fromLabel, toLabel, from, to, onChange }: DateRangeProps) {
  const inputClass =
    'px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] text-[11px] font-mono text-[var(--text-primary)] focus:border-[var(--accent-cr)] outline-none';
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-mono">
          {fromLabel}
        </span>
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onChange(e.target.value, to)}
          className={inputClass}
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-mono">
          {toLabel}
        </span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onChange(from, e.target.value)}
          className={inputClass}
        />
      </label>
    </div>
  );
}
