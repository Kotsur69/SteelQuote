import { describe, expect, test } from 'vitest';
import { nextItemSort, sortItems, type ItemSort, type SortableItem } from '@/lib/itemSort';

type Item = SortableItem & { id: number; totalValue: number };

function item(id: number, over: Partial<Item> = {}): Item {
  const finalPrice = over.finalPrice ?? 1000;
  const tons = over.tons ?? 10;
  return {
    id,
    type: 'HRS',
    grade: 'S235JR',
    thickness: 4,
    width: 1500,
    length: 3000,
    ...over,
    finalPrice,
    tons,
    totalValue: Math.round(finalPrice * tons * 100) / 100,
  };
}

const ids = (items: readonly Item[]) => items.map((i) => i.id);
const asc = (key: ItemSort['key']): ItemSort => ({ key, direction: 'asc' });
const desc = (key: ItemSort['key']): ItemSort => ({ key, direction: 'desc' });

describe('sortItems', () => {
  test('returns the list order when no sort is active', () => {
    const items = [item(3), item(1), item(2)];

    expect(ids(sortItems(items, null))).toEqual([3, 1, 2]);
  });

  test('sorts grades naturally, so S355 comes before S1100', () => {
    const items = [
      item(1, { grade: 'S1100QL' }),
      item(2, { grade: 'S355MC' }),
      item(3, { grade: 'S235JR+N' }),
    ];

    expect(ids(sortItems(items, asc('grade')))).toEqual([3, 2, 1]);
    expect(ids(sortItems(items, desc('grade')))).toEqual([1, 2, 3]);
  });

  test('ignores letter case when sorting grades', () => {
    const items = [item(1, { grade: 'S355mc' }), item(2, { grade: 'S235JR' }), item(3, { grade: 's420MC' })];

    expect(ids(sortItems(items, asc('grade')))).toEqual([2, 1, 3]);
  });

  test('sorts dimensions by thickness, then width, then length', () => {
    const items = [
      item(1, { thickness: 6, width: 1000, length: 2000 }),
      item(2, { thickness: 4, width: 1500, length: 6000 }),
      item(3, { thickness: 4, width: 1500, length: 3000 }),
      item(4, { thickness: 4, width: 1250, length: 9000 }),
    ];

    expect(ids(sortItems(items, asc('dimension')))).toEqual([4, 3, 2, 1]);
    expect(ids(sortItems(items, desc('dimension')))).toEqual([1, 2, 3, 4]);
  });

  test('puts a coil (stored with length 0) before a sheet of the same thickness and width', () => {
    const items = [item(1, { length: 3000 }), item(2, { length: 0 })];

    expect(ids(sortItems(items, asc('dimension')))).toEqual([2, 1]);
  });

  test('sorts steel types alphabetically by code', () => {
    const items = [item(1, { type: 'ZM' }), item(2, { type: 'HRS' }), item(3, { type: 'CR' })];

    expect(ids(sortItems(items, asc('type')))).toEqual([3, 2, 1]);
  });

  test('sorts tons and price numerically', () => {
    const items = [
      item(1, { tons: 100, finalPrice: 900 }),
      item(2, { tons: 9, finalPrice: 1100 }),
      item(3, { tons: 25.5, finalPrice: 1000 }),
    ];

    expect(ids(sortItems(items, asc('tons')))).toEqual([2, 3, 1]);
    expect(ids(sortItems(items, desc('tons')))).toEqual([1, 3, 2]);
    expect(ids(sortItems(items, asc('price')))).toEqual([1, 3, 2]);
    expect(ids(sortItems(items, desc('price')))).toEqual([2, 3, 1]);
  });

  test('keeps list order for equal values in both directions', () => {
    const items = [item(3, { tons: 5 }), item(1, { tons: 5 }), item(2, { tons: 1 })];

    expect(ids(sortItems(items, asc('tons')))).toEqual([2, 3, 1]);
    expect(ids(sortItems(items, desc('tons')))).toEqual([3, 1, 2]);
  });

  test('treats a missing number in an old saved item as 0 without breaking the order', () => {
    const legacy = item(1, { thickness: 2 });
    const broken = { ...item(2, { thickness: 2 }), length: null } as unknown as Item;
    const items = [legacy, broken, item(3, { thickness: 1 })];

    expect(ids(sortItems(items, asc('dimension')))).toEqual([3, 2, 1]);
  });

  test('does not change the source list', () => {
    const items = [item(1, { tons: 9 }), item(2, { tons: 1 })];

    sortItems(items, asc('tons'));

    expect(ids(items)).toEqual([1, 2]);
  });

  test('keeps the item objects and offer totals identical', () => {
    // 1000 x 10 + 950.5 x 2.5 + 1100.25 x 4 = 10000 + 2376.25 + 4401 = 16777.25 EUR over 16.5 t.
    const items = [
      item(1, { finalPrice: 1000, tons: 10 }),
      item(2, { finalPrice: 950.5, tons: 2.5 }),
      item(3, { finalPrice: 1100.25, tons: 4 }),
    ];
    const total = (list: readonly Item[]) => list.reduce((sum, i) => sum + i.totalValue, 0);
    const totalTons = (list: readonly Item[]) => list.reduce((sum, i) => sum + i.tons, 0);

    const sorted = sortItems(items, desc('price'));

    expect(ids(sorted)).toEqual([3, 1, 2]);
    expect(total(items)).toBe(16777.25);
    expect(total(sorted)).toBe(16777.25);
    expect(totalTons(sorted)).toBe(16.5);
    expect(sorted[0]).toBe(items[2]);
  });
});

describe('nextItemSort', () => {
  test('cycles a column through ascending, descending and off', () => {
    const first = nextItemSort(null, 'grade');
    const second = nextItemSort(first, 'grade');
    const third = nextItemSort(second, 'grade');

    expect(first).toEqual(asc('grade'));
    expect(second).toEqual(desc('grade'));
    expect(third).toBeNull();
  });

  test('starts ascending when switching to another column', () => {
    expect(nextItemSort(desc('grade'), 'tons')).toEqual(asc('tons'));
  });
});
