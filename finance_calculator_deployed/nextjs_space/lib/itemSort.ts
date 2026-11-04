// View-only ordering of the calculator item list. The source list keeps the offer order
// (drag order) that the PDF, the Excel export and the saved offer all read, so nothing here
// may change item values or the list it is given.

export type ItemSortKey = 'grade' | 'dimension' | 'type' | 'tons' | 'price';
export type SortDirection = 'asc' | 'desc';

export interface ItemSort {
  key: ItemSortKey;
  direction: SortDirection;
}

export interface SortableItem {
  type: string;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  tons: number;
  finalPrice: number;
}

// Natural order so S355 sorts before S1100. A fixed locale keeps the order identical
// whichever UI language is active.
const TEXT_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

// Saved offers are stored JSON, so an old item can hold null where a number is expected,
// and a NaN comparison would leave the order undefined.
const toNumber = (value: number): number => (Number.isFinite(value) ? value : 0);

const compareNumbers = (a: number, b: number): number => toNumber(a) - toNumber(b);

function compareByKey(a: SortableItem, b: SortableItem, key: ItemSortKey): number {
  switch (key) {
    case 'grade':
      return TEXT_COLLATOR.compare(a.grade, b.grade);
    case 'dimension':
      return (
        compareNumbers(a.thickness, b.thickness) ||
        compareNumbers(a.width, b.width) ||
        compareNumbers(a.length, b.length)
      );
    case 'type':
      return TEXT_COLLATOR.compare(a.type, b.type);
    case 'tons':
      return compareNumbers(a.tons, b.tons);
    case 'price':
      return compareNumbers(a.finalPrice, b.finalPrice);
  }
}

/** Returns a sorted copy holding the same item objects; equal items keep their list order. */
export function sortItems<T extends SortableItem>(items: readonly T[], sort: ItemSort | null): T[] {
  if (!sort) return [...items];
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => sign * compareByKey(a, b, sort.key));
}

/** Header click cycle: ascending, then descending, then back to the offer order. */
export function nextItemSort(current: ItemSort | null, key: ItemSortKey): ItemSort | null {
  if (current?.key !== key) return { key, direction: 'asc' };
  return current.direction === 'asc' ? { key, direction: 'desc' } : null;
}
