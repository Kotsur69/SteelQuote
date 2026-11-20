'use client';

// A server-built table of an assistant answer (lib/assistant/blocks.ts TableBlock). Cells arrive
// pre-formatted; this only lays them out.

import type { TableBlock } from '@/lib/assistant/blocks';

// A cell that starts with a digit (or a minus) is a figure: right-aligned, tabular.
const isNumeric = (cell: string) => /^-?\d/.test(cell);
// "1 234,00 EUR (5 308,64 PLN)" may break before the PLN part instead of forcing the table to scroll
// sideways in the 420 px panel (the spaces inside each amount are no-break spaces).
const MAX_NOWRAP_CHARS = 16;

export function DataTable({ block }: { block: TableBlock }) {
  return (
    <figure className="m-0">
      {block.title && <figcaption className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-txt-muted">{block.title}</figcaption>}
      <div className="overflow-x-auto rounded-md border border-brd">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--accent-tint)]">
              {block.columns.map((column, i) => (
                <th key={column} scope="col" className={`px-3 py-2 text-xs font-semibold text-txt-secondary ${i === 0 ? 'text-left' : 'text-right'}`}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={`${r}-${row[0]}`} className="border-t border-brd">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`px-3 py-2 align-top ${c === 0 ? 'text-left text-txt-primary' : 'text-txt-value'} ${c > 0 && isNumeric(cell) ? `text-right font-medium tabular-nums ${cell.length <= MAX_NOWRAP_CHARS ? 'whitespace-nowrap' : 'min-w-[8.5rem]'}` : c > 0 ? 'text-right' : ''}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.note && <p className="mt-1 text-xs text-txt-muted">{block.note}</p>}
    </figure>
  );
}

