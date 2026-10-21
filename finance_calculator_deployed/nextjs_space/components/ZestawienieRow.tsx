'use client';

import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { findGrade, type PriceBook } from '@/lib/priceBook';
import { fixedGrouped } from '@/lib/numberFormat';
import type { Translations, Language } from '@/lib/translations';
import type { ZestawienieItem } from '@/components/Calculator';

interface ZestawienieRowProps {
  item: ZestawienieItem;
  idx: number;
  t: Translations;
  language: Language;
  isDark: boolean;
  symbol: string;
  currencyUnit: string;
  money2: (eur: number) => string;
  moneyCeil: (eur: number) => string;
  priceBook: PriceBook;
  /** Settings threshold; a lower item margin gets the same warning as the margin input. */
  minMarginPct: number;
  onEdit: (id: number) => void;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function ZestawienieRow({
  item,
  idx,
  t,
  language,
  isDark,
  symbol,
  currencyUnit,
  money2,
  moneyCeil,
  priceBook,
  minMarginPct,
  onEdit,
  onDuplicate,
  onDelete,
}: ZestawienieRowProps) {
  const dragControls = useDragControls();
  // Margin % straight from the item snapshot; legacy items without `inputs` derive it
  // from marza = (PGL + Σ Mill) × pct / 100 (see pricingEngine.computeCenaKoncowa).
  const cenaWsadu = item.pgl + item.sumaHuta;
  const rawMarginPct = item.inputs?.marginPct ?? (cenaWsadu > 0 ? (item.marza / cenaWsadu) * 100 : null);
  const marginPct = rawMarginPct === null ? null : Math.round(rawMarginPct * 100) / 100;
  // Same rule as lib/offerReview.ts: below the minimum = the position will need approval.
  const isMarginBelowMin = rawMarginPct !== null && rawMarginPct < minMarginPct;
  // One-time = the saved grade is not in the price book at all; retired = still in the book
  // but no longer offered for new items.
  const snapshotGrade = item.inputs?.selectedGrade;
  const bookGrade = snapshotGrade ? findGrade(priceBook, item.type, snapshotGrade.name) : undefined;
  const isOneTimeGrade = !!snapshotGrade && !bookGrade;
  const isRetiredGrade = bookGrade?.retired === true;

  return (
    <Reorder.Item
      value={item}
      as="tr"
      dragListener={false}
      dragControls={dragControls}
      onClick={() => onEdit(item.id)}
      whileDrag={{
        backgroundColor: isDark ? 'rgba(59,142,245,0.10)' : 'rgba(59,142,245,0.06)',
        scale: 1.008,
      }}
      style={{ position: 'relative' }}
      className={`cursor-pointer border-b border-[rgba(42,48,72,0.4)] ${isDark ? 'hover:bg-[rgba(255,255,255,0.025)]' : 'hover:bg-[rgba(0,0,0,0.025)]'}`}
    >
      <td
        className="px-1.5 sm:px-2 py-2 text-center cursor-grab select-none active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => dragControls.start(e)}
        title={language === 'pl' ? 'Przeciągnij, aby zmienić kolejność' : 'Drag to reorder'}
        style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
      >
        {/* touchAction: none stops iOS/Android from starting a page-scroll gesture here instead
            of the drag — Reorder.Item only sets that CSS itself when dragListener is the
            default true, and we use a custom handle with dragListener={false}. The whole <td>
            (not just the icon) is the touch/click target, kept comfortably sized for fingers. */}
        <GripVertical className="inline-block h-4 w-4 text-[var(--text-muted)]" />
      </td>
      <td className="px-1.5 sm:px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{idx + 1}</td>
      <td className="px-2 sm:px-3.5 py-2 text-left">
        <div className="font-semibold text-xs text-[var(--text-primary)] flex items-center gap-1.5">
          {item.grade}
          {/* Znacznik gatunku jednorazowego — wyłącznie wewnętrzny (PDF i Excel
              pokazują samą nazwę). Sprawdzamy snapshot, a nie item.grade, żeby
              stare pozycje bez `inputs` nigdy nie dostały fałszywej etykiety. */}
          {isOneTimeGrade && (
            <span className="text-[9px] font-semibold tracking-wider uppercase text-[var(--accent-cr)] border border-[var(--accent-cr)] rounded px-1.5 py-0.5">
              {t.inputs.oneTimeGradeBadge}
            </span>
          )}
          {isRetiredGrade && (
            <span className="text-[9px] font-semibold tracking-wider uppercase text-[var(--text-muted)] border border-[var(--border)] rounded px-1.5 py-0.5">
              {t.priceBook.retiredMark}
            </span>
          )}
        </div>
        <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
          {item.thickness} × {item.width}{item.isCoil ? '' : ` × ${item.length}`} mm
          {item.isCoil && <span className="ml-1.5 text-[9px] font-semibold text-[#a855f7] bg-[rgba(168,85,247,0.12)] px-1.5 py-0.5 rounded">{t.inputs.coilMode}</span>}
        </div>
      </td>
      <td className="px-2 sm:px-3.5 py-2 text-center">
        <span className={`inline-block font-mono text-[10px] font-bold px-2 py-0.5 rounded tracking-wider
          ${{
            HRS: 'bg-[rgba(232,160,32,0.12)] text-[var(--accent-hrs)]',
            CR: 'bg-[rgba(59,142,245,0.12)] text-[var(--accent-cr)]',
            HDG: 'bg-[rgba(46,204,113,0.12)] text-[var(--accent-hdg)]',
            PICKLED: 'bg-[rgba(224,73,154,0.12)] text-[var(--accent-pickled)]',
            TEARDROP: 'bg-[rgba(34,193,214,0.12)] text-[var(--accent-teardrop)]',
            ZM: 'bg-[rgba(139,124,246,0.12)] text-[var(--accent-zm)]',
          }[item.type]}`}>
          {item.type}
        </span>
      </td>
      <td className="px-2 sm:px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{money2(item.pgl)}</td>
      <td className="px-2 sm:px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{money2(item.sumaHuta)}</td>
      <td className="px-2 sm:px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{money2(item.sumaSSC)}</td>
      <td
        className={`px-2 sm:px-3.5 py-2 font-mono text-xs text-right whitespace-nowrap ${
          isMarginBelowMin ? 'bg-[rgba(239,68,68,0.12)] text-[#ef4444] font-semibold' : 'text-[var(--text-value)]'
        }`}
        title={isMarginBelowMin ? `${t.summary.marginBelowMinWarning} (${minMarginPct}%)` : undefined}
      >
        {isMarginBelowMin && <span aria-hidden className="mr-1">⚠️</span>}
        {money2(item.marza)}
        {marginPct !== null && <span className={isMarginBelowMin ? '' : 'text-[var(--text-secondary)]'}> / {marginPct}%</span>}
        {isMarginBelowMin && <span className="sr-only"> {t.summary.marginBelowMinWarning} ({minMarginPct}%)</span>}
      </td>
      <td className="px-2 sm:px-3.5 py-2 font-mono text-[13px] font-bold text-[var(--accent-sum)] text-right whitespace-nowrap">{moneyCeil(item.finalPrice)} {symbol}</td>
      <td className="px-2 sm:px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right whitespace-nowrap">{fixedGrouped(item.tons, 2)} {t.common.tons}</td>
      <td className="px-2 sm:px-3.5 py-2 font-mono text-[13px] font-bold text-[var(--accent-sum)] text-right whitespace-nowrap">{moneyCeil(item.totalValue)} {currencyUnit}</td>
      <td className="px-2 sm:px-3.5 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onEdit(item.id)} className="bg-transparent border border-[var(--border)] rounded px-1 sm:px-2 py-1 text-[13px] hover:border-[var(--accent-cr)] hover:text-[var(--accent-cr)] transition-colors ml-0.5 sm:ml-1" title={t.common.edit}>✏️</button>
        <button onClick={() => onDuplicate(item.id)} className="bg-transparent border border-[var(--border)] rounded px-1 sm:px-2 py-1 text-[13px] hover:border-[#a78bfa] hover:text-[#a78bfa] transition-colors ml-0.5 sm:ml-1" title={t.common.duplicate}>⧉</button>
        <button onClick={() => onDelete(item.id)} className="bg-transparent border border-[var(--border)] rounded px-1 sm:px-2 py-1 text-[13px] hover:border-[var(--accent-sum)] hover:text-[var(--accent-sum)] transition-colors ml-0.5 sm:ml-1" title={t.common.delete}>🗑</button>
      </td>
    </Reorder.Item>
  );
}
