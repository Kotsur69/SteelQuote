'use client';

import type { SteelType } from '@/lib/calculatorData';
import { bookCell, defaultCell, type PriceBook, type PriceTableKey } from '@/lib/priceBook';
import type { Translations } from '@/lib/translations';
import PriceCellInput from '@/components/priceBook/PriceCellInput';
import BulkDeltaControl from '@/components/priceBook/BulkDeltaControl';
import { bandLabel, cellId, gridLayout, type TypeDraft } from '@/components/priceBook/draft';

type Props = {
  type: SteelType;
  table: PriceTableKey;
  title: string;
  rowHeader: string;
  colHeader: string;
  book: PriceBook;
  draft: TypeDraft;
  disabled: boolean;
  t: Translations;
  onCell: (id: string, raw: string, current: number) => void;
  /** Adds X to every cell of this matrix (draft only). */
  onTableDelta: (table: PriceTableKey, delta: number) => void;
};

// Editable grid of one matrix. Rows/columns come from the code structure; a cell that does
// not exist there renders as a read-only '—' (no price defined for that combination).
export default function MatrixGrid({ type, table, title, rowHeader, colHeader, book, draft, disabled, t, onCell, onTableDelta }: Props) {
  const { rows, cols } = gridLayout(type, table);
  const singleCol = cols.length === 1;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold tracking-wider uppercase text-[var(--text-secondary)]">{title}</h4>
        <BulkDeltaControl t={t} disabled={disabled} applyLabel={t.priceBook.bulkApply} onApply={(delta) => onTableDelta(table, delta)} />
      </div>
      <div className="overflow-x-auto rounded border border-[var(--border)]">
        <table className="border-collapse text-[11px] font-mono tabular-nums">
          <thead>
            <tr className="bg-[rgba(127,127,127,0.06)]">
              <th scope="col" className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 py-1.5 text-left font-semibold text-[var(--text-secondary)] whitespace-nowrap border-b border-r border-[var(--border)]">
                {rowHeader}{singleCol ? '' : ` \\ ${colHeader}`}
              </th>
              {cols.map((col) => (
                <th key={col} scope="col" className="px-1.5 py-1.5 text-center font-semibold text-[var(--text-secondary)] whitespace-nowrap border-b border-[var(--border)]">
                  {singleCol ? t.priceBook.value : bandLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row} className="border-b border-[rgba(127,127,127,0.12)] last:border-b-0">
                <th scope="row" className="sticky left-0 z-10 bg-[var(--bg-card)] px-2 py-1 text-left font-medium text-[var(--text-primary)] whitespace-nowrap border-r border-[var(--border)]">
                  {bandLabel(row)}
                </th>
                {cols.map((col) => {
                  const fallback = defaultCell(type, table, row, col);
                  if (fallback === undefined) {
                    return (
                      <td key={col} className="px-1.5 py-1 text-center text-[var(--text-muted)]" title={t.priceBook.emptyCell}>
                        —
                      </td>
                    );
                  }
                  const id = cellId(table, row, col);
                  const current = bookCell(book, type, table, row, col) ?? fallback;
                  const label = singleCol
                    ? `${title}: ${bandLabel(row)}`
                    : `${title}: ${rowHeader} ${bandLabel(row)}, ${colHeader} ${bandLabel(col)}`;
                  return (
                    <td key={col} className="px-1 py-1 text-center">
                      <PriceCellInput
                        current={current}
                        defaultValue={fallback}
                        raw={draft.cells[id]}
                        label={label}
                        defaultHint={t.priceBook.defaultValue}
                        invalidHint={t.priceBook.invalidValue}
                        disabled={disabled}
                        width="w-[54px]"
                        onChange={(raw) => onCell(id, raw, current)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
