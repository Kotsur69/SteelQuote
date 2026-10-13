'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import {
  currencySymbol,
  formatOfferMoney,
  formatOfferMoneyCeil,
  offerCurrency,
  offerTotalUnit,
  type OfferCurrencyMeta,
} from '@/lib/currency';
import { fixedGrouped } from '@/lib/numberFormat';

// Minimal item shape the read-only offer previews need (/offers, /senior, /admin/oferty).
export interface OfferPreviewItem {
  type: string;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  pgl: number;
  sumaHuta: number;
  marza: number;
  finalPrice: number;
  tons: number;
  totalValue: number;
  inputs?: { marginPct?: number };
}

const TYPE_TEXT_CLASS: Record<string, string> = {
  HRS: 'text-[var(--accent-hrs)]',
  CR: 'text-[var(--accent-cr)]',
  HDG: 'text-[var(--accent-hdg)]',
  PICKLED: 'text-[var(--accent-pickled)]',
  TEARDROP: 'text-[var(--accent-teardrop)]',
  ZM: 'text-[var(--accent-zm)]',
};

const TYPE_CHIP_CLASS: Record<string, string> = {
  HRS: 'border-[var(--accent-hrs)] text-[var(--accent-hrs)] bg-[rgba(232,160,32,0.08)]',
  CR: 'border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)]',
  HDG: 'border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.08)]',
  PICKLED: 'border-[var(--accent-pickled)] text-[var(--accent-pickled)] bg-[rgba(224,73,154,0.08)]',
  TEARDROP: 'border-[var(--accent-teardrop)] text-[var(--accent-teardrop)] bg-[rgba(34,193,214,0.08)]',
  ZM: 'border-[var(--accent-zm)] text-[var(--accent-zm)] bg-[rgba(139,124,246,0.08)]',
};

const CHIP_PREVIEW_COUNT = 3;

// Margin % from the item snapshot; legacy items without `inputs` derive it from
// marza = (PGL + Σ Mill) × pct / 100 — same rule as ZestawienieRow.
export function itemMarginPct(item: Pick<OfferPreviewItem, 'pgl' | 'sumaHuta' | 'marza' | 'inputs'>): number | null {
  const base = item.pgl + item.sumaHuta;
  const raw = item.inputs?.marginPct ?? (base > 0 ? (item.marza / base) * 100 : null);
  return raw === null ? null : Math.round(raw * 100) / 100;
}

interface OfferItemsPreviewProps {
  items: OfferPreviewItem[];
  offerData: OfferCurrencyMeta;
  isExpanded: boolean;
  onExpand: () => void;
}

// Collapsed = chips for the first few items, expanded = full table with PGL, margin and prices.
// Amounts are stored in EUR and shown in the offer's own frozen currency/rate.
export default function OfferItemsPreview({ items, offerData, isExpanded, onExpand }: OfferItemsPreviewProps) {
  const { t, language } = useLanguage();
  if (items.length === 0) return null;

  if (!isExpanded) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {items.slice(0, CHIP_PREVIEW_COUNT).map((item, idx) => (
          <span
            key={idx}
            className={`px-2 py-1 rounded text-[10px] font-mono border ${TYPE_CHIP_CLASS[item.type] ?? 'border-[var(--border)] text-[var(--text-secondary)]'}`}
          >
            {item.type} {item.thickness}×{item.width}×{item.length} {item.grade}
          </span>
        ))}
        {items.length > CHIP_PREVIEW_COUNT && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            className="px-2 py-1 rounded text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            +{items.length - CHIP_PREVIEW_COUNT} {language === 'pl' ? 'więcej' : 'more'}
          </button>
        )}
      </div>
    );
  }

  const perTon = currencySymbol(offerCurrency(offerData));
  const totalUnit = offerTotalUnit(offerData);
  const th = 'px-2.5 py-1.5';
  const td = 'px-2.5 py-1.5 whitespace-nowrap';

  return (
    <div className="mt-3 overflow-x-auto rounded border border-[var(--border)]">
      <table className="w-full border-collapse text-[11px] font-mono">
        <thead>
          <tr className="bg-[var(--bg-panel)] text-[var(--text-secondary)] uppercase tracking-wider">
            <th className={`${th} text-right`}>{language === 'pl' ? 'Lp.' : 'No.'}</th>
            <th className={`${th} text-left`}>{t.zestawienie.grade} / {t.zestawienie.dimensions}</th>
            <th className={`${th} text-center`}>{t.zestawienie.type}</th>
            <th className={`${th} text-right`}>PGL</th>
            <th className={`${th} text-right`}>{t.zestawienie.margin}</th>
            <th className={`${th} text-right`}>{t.zestawienie.price}</th>
            <th className={`${th} text-right`}>{t.zestawienie.tons}</th>
            <th className={`${th} text-right`}>{t.zestawienie.value}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const marginPct = itemMarginPct(item);
            return (
              <tr key={idx} className="border-t border-[var(--border)]">
                <td className={`${td} text-right text-[var(--text-muted)]`}>{idx + 1}</td>
                <td className={`${td} text-left`}>
                  <span className="text-[var(--text-primary)] font-semibold">{item.grade}</span>
                  <span className="text-[var(--text-secondary)] ml-1.5">
                    {item.thickness}×{item.width}{item.length ? `×${item.length}` : ''} mm
                  </span>
                </td>
                <td className={`${td} text-center`}>
                  <span className={TYPE_TEXT_CLASS[item.type]}>{item.type}</span>
                </td>
                <td className={`${td} text-right text-[var(--text-value)]`}>
                  {formatOfferMoney(item.pgl, offerData)} {perTon}
                </td>
                <td className={`${td} text-right text-[var(--text-value)]`}>
                  {formatOfferMoney(item.marza, offerData)} {perTon}
                  {marginPct !== null && <span className="text-[var(--text-secondary)]"> / {marginPct}%</span>}
                </td>
                <td className={`${td} text-right text-[var(--text-value)]`}>
                  {formatOfferMoneyCeil(item.finalPrice, offerData)} {perTon}
                </td>
                <td className={`${td} text-right text-[var(--text-value)]`}>{fixedGrouped(item.tons, 2)}</td>
                <td className={`${td} text-right text-[var(--accent-hrs)] font-semibold`}>
                  {formatOfferMoneyCeil(item.totalValue, offerData)} {totalUnit}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
