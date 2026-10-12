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
};

export default function FallbacksSection({ type, book, draft, disabled, t, onCell }: Props) {
  const rows: { key: ScalarKey; label: string }[] = [
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
