'use client';

import { useState } from 'react';
import { MAX_QUOTE_VALIDITY_HOURS, QUOTE_VALIDITY_HOUR_PRESETS } from '@/lib/quoteValidity';

// Offer validity in hours (24h default, 48h, or a custom number of hours) - same button
// layout as PaymentTermPicker, which it replaced in the calculator.
interface QuoteValidityPickerProps {
  value: number | null;
  onChange: (hours: number | null) => void;
  customLabel: string;
  className?: string;
}

const isPreset = (hours: number | null) =>
  hours !== null && (QUOTE_VALIDITY_HOUR_PRESETS as readonly number[]).includes(hours);

export default function QuoteValidityPicker({ value, onChange, customLabel, className }: QuoteValidityPickerProps) {
  // Separate from `value`: clicking the custom button reveals an input without forcing a
  // number yet. A saved non-preset value opens the input straight away.
  const [showCustomInput, setShowCustomInput] = useState(() => value !== null && !isPreset(value));
  const isCustomActive = showCustomInput || (value !== null && !isPreset(value));

  const btnCls = (active: boolean) =>
    `px-2.5 py-1.5 rounded text-[11px] font-mono font-medium border transition-colors whitespace-nowrap ${
      active
        ? 'bg-[rgba(59,142,245,0.15)] border-[#3b8ef5] text-[#3b8ef5] font-semibold'
        : 'bg-[var(--bg-input)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-cr)]'
    }`;

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className ?? ''}`}>
      {QUOTE_VALIDITY_HOUR_PRESETS.map((hours) => (
        <button
          key={hours}
          type="button"
          onClick={() => {
            setShowCustomInput(false);
            onChange(hours);
          }}
          className={btnCls(!isCustomActive && value === hours)}
        >
          {hours}h
        </button>
      ))}
      <button type="button" onClick={() => setShowCustomInput(true)} className={btnCls(isCustomActive)}>
        {customLabel}
      </button>
      {isCustomActive && (
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={MAX_QUOTE_VALIDITY_HOURS}
            autoFocus
            value={value ?? ''}
            onChange={(e) => {
              if (e.target.value === '') {
                onChange(null);
                return;
              }
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n)) onChange(Math.min(MAX_QUOTE_VALIDITY_HOURS, Math.max(1, n)));
            }}
            className="w-16 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)] font-mono text-right focus:border-[var(--accent-cr)] outline-none"
          />
          <span className="text-[11px] font-mono text-[var(--text-secondary)]">h</span>
        </span>
      )}
    </div>
  );
}
