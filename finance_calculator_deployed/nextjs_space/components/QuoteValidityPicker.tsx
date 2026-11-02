'use client';

import { useState } from 'react';
import type { Language } from '@/lib/translations';
import {
  HOURS_PER_DAY,
  MAX_QUOTE_VALIDITY_DAYS,
  QUOTE_VALIDITY_DAY_PRESETS,
  formatValidityDays,
} from '@/lib/quoteValidity';

// Offer validity in days (1 / 2 / 5 / 7 days, or a custom number of days) - same button
// layout as PaymentTermPicker. The value itself stays in HOURS (days x 24), which is what
// the offer, the PDF and the quote_validity_hours approval rules store and read.
interface QuoteValidityPickerProps {
  value: number | null;
  onChange: (hours: number | null) => void;
  customLabel: string;
  language: Language;
  className?: string;
}

const isPreset = (hours: number | null) =>
  hours !== null && (QUOTE_VALIDITY_DAY_PRESETS as readonly number[]).some((d) => d * HOURS_PER_DAY === hours);

// Legacy offers can hold a non-whole-day value (e.g. 36h) - shown as 1.5 in the custom box.
const hoursToDays = (hours: number) => Math.round((hours / HOURS_PER_DAY) * 10) / 10;

export default function QuoteValidityPicker({ value, onChange, customLabel, language, className }: QuoteValidityPickerProps) {
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

  // Unit label for the custom box, e.g. "dni" / "days" (the number is typed by the user).
  const unitLabel = formatValidityDays(5, language).replace(/^\d+\s*/, '');

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className ?? ''}`}>
      {QUOTE_VALIDITY_DAY_PRESETS.map((days) => (
        <button
          key={days}
          type="button"
          onClick={() => {
            setShowCustomInput(false);
            onChange(days * HOURS_PER_DAY);
          }}
          className={btnCls(!isCustomActive && value === days * HOURS_PER_DAY)}
        >
          {formatValidityDays(days, language)}
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
            max={MAX_QUOTE_VALIDITY_DAYS}
            step={1}
            autoFocus
            value={value === null ? '' : hoursToDays(value)}
            onChange={(e) => {
              if (e.target.value === '') {
                onChange(null);
                return;
              }
              const days = Math.round(Number(e.target.value));
              if (Number.isFinite(days)) {
                onChange(Math.min(MAX_QUOTE_VALIDITY_DAYS, Math.max(1, days)) * HOURS_PER_DAY);
              }
            }}
            className="w-16 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)] font-mono text-right focus:border-[var(--accent-cr)] outline-none"
          />
          <span className="text-[11px] font-mono text-[var(--text-secondary)]">{unitLabel}</span>
        </span>
      )}
    </div>
  );
}
