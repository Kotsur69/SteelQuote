import { describe, expect, test } from 'vitest';
import { DEFAULT_PRICE_BOOK, defaultCell } from '@/lib/priceBook';
import { EMPTY_DRAFT, cellId, diffDraft, gridLayout, withCell, withTableDelta } from '@/components/priceBook/draft';

const book = DEFAULT_PRICE_BOOK;

function pricedCells(table: 'dimension') {
  const { rows, cols } = gridLayout('HRS', table);
  return rows.flatMap((r) => cols.map((c) => ({ r, c, v: defaultCell('HRS', table, r, c) })))
    .filter((x): x is { r: string; c: string; v: number } => x.v !== undefined);
}

describe('withTableDelta', () => {
  test('adds X to every priced cell of the matrix and only that matrix', () => {
    const cells = pricedCells('dimension');
    const draft = withTableDelta(EMPTY_DRAFT, book, 'HRS', 'dimension', 5);
    for (const { r, c, v } of cells) expect(Number(draft.cells[cellId('dimension', r, c)])).toBeCloseTo(v + 5, 2);
    expect(Object.keys(draft.cells)).toHaveLength(cells.length);
    expect(diffDraft(book, 'HRS', draft).changeCount).toBe(cells.length);
  });

  test('builds on a value already typed in, and supports a negative delta', () => {
    const [{ r, c }] = pricedCells('dimension');
    const id = cellId('dimension', r, c);
    const draft = withTableDelta(withCell(EMPTY_DRAFT, id, '100'), book, 'HRS', 'dimension', -2.5);
    expect(draft.cells[id]).toBe('97.5');
  });

  test('leaves an invalid typed cell untouched', () => {
    const [{ r, c }] = pricedCells('dimension');
    const id = cellId('dimension', r, c);
    const draft = withTableDelta(withCell(EMPTY_DRAFT, id, 'abc'), book, 'HRS', 'dimension', 5);
    expect(draft.cells[id]).toBe('abc');
  });
});
