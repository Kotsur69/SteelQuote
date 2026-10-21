'use client';

import { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Translations } from '@/lib/translations';
import { parsePrice } from '@/components/priceBook/draft';

type Props = {
  t: Translations;
  disabled: boolean;
  /** Button text - per-matrix "Apply" or the section-wide "Apply to all matrices". */
  applyLabel: string;
  onApply: (delta: number) => void;
};

// "Change every price by X" input + button. X may be negative; zero or invalid input keeps the
// button disabled. Applying only edits the draft - saving stays a separate, explicit step.
export default function BulkDeltaControl({ t, disabled, applyLabel, onApply }: Props) {
  const inputId = useId();
  const [raw, setRaw] = useState('');
  const delta = parsePrice(raw);
  const canApply = !disabled && delta !== null && delta !== 0;
  const invalid = raw.trim() !== '' && delta === null;

  const apply = () => {
    if (!canApply || delta === null) return;
    onApply(delta);
    setRaw('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2" title={t.priceBook.bulkHint}>
      <label htmlFor={inputId} className="text-[11px] text-[var(--text-secondary)]">{t.priceBook.bulkLabel}</label>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={`w-[70px] bg-[var(--bg-input)] border rounded px-1.5 py-1 text-right font-mono text-[12px] tabular-nums text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cr)] disabled:opacity-50 ${invalid ? 'border-[var(--accent-sum)]' : 'border-[var(--border)]'}`}
      />
      <span className="text-[11px] text-[var(--text-muted)]">€/t</span>
      <button
        type="button"
        onClick={apply}
        disabled={!canApply}
        className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--border-hi)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <Plus aria-hidden className="h-3 w-3" /> {applyLabel}
      </button>
    </div>
  );
}
