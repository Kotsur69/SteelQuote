'use client';

import { useState } from 'react';

// Termin płatności jako liczba dni — współdzielony widget przycisków między kalkulatorem
// (Calculator.tsx, per-oferta) i panelem admina/seniora (ClientPaymentTermsPanel.tsx,
// domyślny termin per-klient). Zastępuje dawny zakres dat "od-do": handlowiec wybiera
// gotowy próg albo wpisuje własną liczbę dni (0-365, ta sama granica co CHECK w migracji 023).
export const PAYMENT_TERM_DAY_PRESETS = [0, 15, 30, 45, 60, 90] as const;

interface PaymentTermPickerProps {
  value: number | null;
  onChange: (days: number | null) => void;
  prepaymentLabel: string;
  customLabel: string;
  className?: string;
}

export default function PaymentTermPicker({
  value,
  onChange,
  prepaymentLabel,
  customLabel,
  className,
}: PaymentTermPickerProps) {
  // Osobny stan od `value` — kliknięcie "Inny" ma odsłonić puste pole do wpisania, a nie
  // od razu narzucić jakąś liczbę (0 jest już zajęte przez przedpłatę). Jeśli oferta/klient
  // ma już zapisaną wartość spoza presetów (stare dane), pole od razu startuje otwarte.
  const [showCustomInput, setShowCustomInput] = useState(
    () => value !== null && !(PAYMENT_TERM_DAY_PRESETS as readonly number[]).includes(value)
  );
  const isCustomActive = showCustomInput || (value !== null && !(PAYMENT_TERM_DAY_PRESETS as readonly number[]).includes(value));

  const btnCls = (active: boolean) =>
    `px-2.5 py-1.5 rounded text-[11px] font-mono font-medium border transition-colors whitespace-nowrap ${
      active
        ? 'bg-[rgba(59,142,245,0.15)] border-[#3b8ef5] text-[#3b8ef5] font-semibold'
        : 'bg-[var(--bg-input)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-cr)]'
    }`;

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className ?? ''}`}>
      {PAYMENT_TERM_DAY_PRESETS.map((days) => (
        <button
          key={days}
          type="button"
          onClick={() => {
            setShowCustomInput(false);
            onChange(days);
          }}
          className={btnCls(!isCustomActive && value === days)}
        >
          {days === 0 ? prepaymentLabel : days}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setShowCustomInput(true)}
        className={btnCls(isCustomActive)}
      >
        {customLabel}
      </button>
      {isCustomActive && (
        <input
          type="number"
          min={0}
          max={365}
          autoFocus
          value={value ?? ''}
          onChange={(e) => {
            if (e.target.value === '') {
              onChange(null);
              return;
            }
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(365, Math.max(0, n)));
          }}
          className="w-16 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)] font-mono text-right focus:border-[var(--accent-cr)] outline-none"
        />
      )}
    </div>
  );
}
