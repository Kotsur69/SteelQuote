'use client';

import { cellState, formatPrice } from '@/components/priceBook/draft';

type Props = {
  /** Value in the live book. */
  current: number;
  /** Code default - shown in the tooltip, and as a dot when the book overrides it. */
  defaultValue: number | undefined;
  /** Raw draft text, undefined while untouched. */
  raw: string | undefined;
  label: string;
  defaultHint: string;
  invalidHint: string;
  disabled?: boolean;
  width?: string;
  onChange: (raw: string) => void;
};

// One editable price. State is shown by colour AND a marker, never by colour alone:
// changed = amber border + dot, invalid = red border + aria-invalid, overridden vs. the code
// default = small accent dot in the corner.
export default function PriceCellInput({
  current, defaultValue, raw, label, defaultHint, invalidHint, disabled, width = 'w-[68px]', onChange,
}: Props) {
  const state = cellState(raw, current);
  const isOverridden = defaultValue !== undefined && current !== defaultValue;
  const border = state === 'invalid'
    ? 'border-[var(--accent-sum)]'
    : state === 'changed'
      ? 'border-[var(--accent-hrs)] bg-[rgba(232,160,32,0.10)]'
      : 'border-[var(--border)]';
  const titleParts = [label];
  if (defaultValue !== undefined) titleParts.push(defaultHint.replace('{value}', formatPrice(defaultValue)));
  if (state === 'invalid') titleParts.push(invalidHint);

  return (
    <span className="relative inline-flex">
      <input
        type="text"
        inputMode="decimal"
        value={raw ?? formatPrice(current)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
        aria-invalid={state === 'invalid' || undefined}
        title={titleParts.join(' · ')}
        className={`${width} bg-[var(--bg-input)] border rounded px-1.5 py-1 text-right font-mono text-[12px] tabular-nums text-[var(--text-primary)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-cr)] disabled:opacity-50 disabled:cursor-not-allowed ${border}`}
      />
      {state === 'changed' && (
        <span aria-hidden className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-[var(--accent-hrs)]" />
      )}
      {state === 'clean' && isOverridden && (
        <span aria-hidden className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[var(--accent-cr)]" />
      )}
    </span>
  );
}
