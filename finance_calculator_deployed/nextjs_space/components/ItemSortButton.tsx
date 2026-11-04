'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ItemSort, ItemSortKey } from '@/lib/itemSort';

interface ItemSortButtonProps {
  sortKey: ItemSortKey;
  label: string;
  sort: ItemSort | null;
  /** Translated "Sort by" prefix for the tooltip. */
  sortByLabel: string;
  onSort: (key: ItemSortKey) => void;
}

/** Value for aria-sort on the header cell that holds the given sort keys. */
export function ariaSortFor(sort: ItemSort | null, ...keys: ItemSortKey[]): 'ascending' | 'descending' | 'none' {
  if (!sort || !keys.includes(sort.key)) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

export default function ItemSortButton({ sortKey, label, sort, sortByLabel, onSort }: ItemSortButtonProps) {
  const direction = sort?.key === sortKey ? sort.direction : null;
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={`${sortByLabel}: ${label}`}
      className={`-my-1 inline-flex cursor-pointer items-center gap-1 rounded-sm py-1 font-mono uppercase tracking-wide transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-cr)] ${
        direction ? 'font-bold text-[var(--accent-cr)]' : ''
      }`}
    >
      {label}
      <Icon aria-hidden className={`h-3 w-3 shrink-0 ${direction ? '' : 'opacity-50'}`} />
    </button>
  );
}
