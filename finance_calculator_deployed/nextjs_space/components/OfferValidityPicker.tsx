'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  detectValidityMode,
  quarterDateRange,
  thisMonthValidityRange,
  isQuarterAvailable,
  quarterOf,
  type Quarter,
} from '@/lib/quarterUtils';
import { todayDateString } from '@/lib/dateUtils';

const QUARTERS: Quarter[] = [1, 2, 3, 4];

interface OfferValidityPickerProps {
  validFrom: string;
  validTo: string;
  onChange: (validFrom: string, validTo: string) => void;
  fromLabel: string;
  toLabel: string;
  thisMonthLabel: string;
  customLabel: string;
  isDark: boolean;
  className?: string;
}

// Q1-Q4/"Ten miesiąc"/"Niestandardowy" preset picker dla okresu ważności oferty. Zastępuje
// dawną parę gołych <input type="date"> (nadal dostępną w trybie "custom") — wybór presetu
// oblicza validFrom/validTo i woła onChange z gotową parą, tak samo jak dawniej robiły to
// bezpośrednio pola dat w Calculator.tsx (który dalej odpowiada za efekt uboczny PGL).
export default function OfferValidityPicker({
  validFrom,
  validTo,
  onChange,
  fromLabel,
  toLabel,
  thisMonthLabel,
  customLabel,
  isDark,
  className,
}: OfferValidityPickerProps) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const years = [currentYear, currentYear + 1];

  // Sticky override — pozwala kliknięciu "Niestandardowy" odsłonić gołe pola dat nawet gdy
  // aktualne validFrom/validTo wciąż pasują do jakiegoś presetu (ten sam wzorzec co
  // showCustomInput w PaymentTermPicker.tsx). Kasowane przy zmianie oferty, bo Calculator
  // renderuje ten komponent z `key={currentOfferId ?? 'new'}` (pełny remount).
  const [forceCustom, setForceCustom] = useState(false);
  const detected = detectValidityMode(validFrom, validTo);
  const mode = forceCustom ? 'custom' : (detected?.mode ?? 'custom');

  const [yearOverride, setYearOverride] = useState<number | null>(null);
  const selectedYear = yearOverride ?? detected?.year ?? currentYear;

  const btnCls = (active: boolean) =>
    `px-2.5 py-1.5 rounded text-[11px] font-mono font-medium border transition-colors whitespace-nowrap ${
      active
        ? 'bg-[rgba(59,142,245,0.15)] border-[#3b8ef5] text-[#3b8ef5] font-semibold'
        : 'bg-[var(--bg-input)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-cr)]'
    }`;

  const dateInputCls = `bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[12px] normal-case tracking-normal outline-none focus:border-[var(--accent-cr)] ${
    !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''
  }`;

  const pickQuarter = (quarter: Quarter, year: number) => {
    setForceCustom(false);
    const now = quarterOf(new Date());
    const { start, end } = quarterDateRange(year, quarter);
    const from = year === now.year && quarter === now.quarter ? todayDateString() : start;
    onChange(from, end);
  };

  const pickThisMonth = () => {
    setForceCustom(false);
    const { from, to } = thisMonthValidityRange();
    onChange(from, to);
  };

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className ?? ''}`}>
      <select
        value={selectedYear}
        onChange={(e) => {
          const year = Number(e.target.value);
          setYearOverride(year);
          if (mode === 'quarter' && detected?.quarter) {
            pickQuarter(detected.quarter, year);
          }
        }}
        className={dateInputCls}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      {/* AnimatePresence + key={q} (bez roku) — Q3/Q4 zostają zamontowane bez animacji przy
          zmianie roku (są dostępne po obu stronach), tylko naprawdę NOWO odsłonięte kwartały
          (np. Q1/Q2 po przejściu z 2026 na 2027) dostają enter-animację; miniony kwartał przy
          powrocie na 2026 dostaje exit-animację zamiast znikać skokowo. */}
      <AnimatePresence initial={false} mode="popLayout">
        {QUARTERS.filter((q) => isQuarterAvailable(selectedYear, q)).map((q) => (
          <motion.button
            key={q}
            type="button"
            layout
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={() => pickQuarter(q, selectedYear)}
            className={btnCls(mode === 'quarter' && detected?.quarter === q && detected?.year === selectedYear)}
          >
            Q{q}
          </motion.button>
        ))}
      </AnimatePresence>

      <button type="button" onClick={pickThisMonth} className={btnCls(mode === 'month')}>
        {thisMonthLabel}
      </button>

      <button type="button" onClick={() => setForceCustom(true)} className={btnCls(mode === 'custom')}>
        {customLabel}
      </button>

      {mode === 'custom' ? (
        <>
          <label className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
            {fromLabel}
            <input
              type="date"
              value={validFrom}
              onChange={(e) => onChange(e.target.value, validTo)}
              className={dateInputCls}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
            {toLabel}
            <input
              type="date"
              value={validTo}
              onChange={(e) => onChange(validFrom, e.target.value)}
              min={validFrom || undefined}
              className={dateInputCls}
            />
          </label>
        </>
      ) : (
        validFrom &&
        validTo && (
          <span className="text-[11px] font-mono text-[var(--text-secondary)]">
            {fromLabel} {validFrom} — {toLabel.toLowerCase()} {validTo}
          </span>
        )
      )}
    </div>
  );
}
