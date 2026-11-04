'use client';

import type { SteelType } from '@/lib/calculatorData';
import { VALUE_COL, defaultCell, scalarValue, type PriceBook, type ScalarKey } from '@/lib/priceBook';
import type { Translations } from '@/lib/translations';
import PriceCellInput from '@/components/priceBook/PriceCellInput';
import { cellId, type TypeDraft } from '@/components/priceBook/draft';

type Props = {
  type: SteelType;
  book: PriceBook;
  draft: TypeDraft;
  disabled: boolean;
  t: Translations;
  onCell: (id: string, raw: string, current: number) => void;
  group: 'fallbacks' | 'smallQuantity';
};

export default function FallbacksSection({ type, book, draft, disabled, t, onCell, group }: Props) {
  const rows: { key: ScalarKey; label: string }[] = group === 'smallQuantity'
    ? [
        { key: 'smallQtyUnder5', label: t.priceBook.smallQtyUnder5 },
        { key: 'smallQtyUpTo9_9', label: t.priceBook.smallQtyUpTo9_9 },
      ]
    : [
        { key: 'baseFallback', label: t.priceBook.fallbackBase },
        { key: 'yieldAmount', label: t.priceBook.yieldAmount },
        { key: 'teardropOver2050', label: t.priceBook.fallbackTeardrop },
      ];

  return (
    <div className="space-y-2">
      {rows
        .filter((row) => defaultCell(type, 'scalar', row.key, VALUE_COL) !== undefined)
        .map((row) => {
          const id = cellId('scalar', row.key, VALUE_COL);
          const current = scalarValue(book, type, row.key);
          return (
            <label key={row.key} className="flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)] max-w-xl">
              <span>{row.label}</span>
              <PriceCellInput
                current={current}
                defaultValue={defaultCell(type, 'scalar', row.key, VALUE_COL)}
                raw={draft.cells[id]}
                label={row.label}
                defaultHint={t.priceBook.defaultValue}
                invalidHint={t.priceBook.invalidValue}
                disabled={disabled}
                onChange={(raw) => onCell(id, raw, current)}
              />
            </label>
          );
        })}
    </div>
  );
}
