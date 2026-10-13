'use client';

// The effective price book for the UI: code defaults + the DB overrides from GET
// /api/price-book. Fetched fresh on every mount, so a superuser's change applies on the next
// calculator load. Until the response arrives (or when it fails) the code defaults are used,
// so the calculator always works; `ready` tells callers when the real book is in place.

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PRICE_BOOK, mergePriceBook, type GradeRow, type PriceBook, type PriceBookEntry } from '@/lib/priceBook';

const PRICE_BOOK_TIMEOUT_MS = 5000;

export interface PriceBookPayload {
  entries: PriceBookEntry[];
  grades: GradeRow[] | null;
  /** False when migration 031 has not been run yet (the API serves code defaults). */
  migrated: boolean;
}

export function bookFromPayload(payload: PriceBookPayload): PriceBook {
  return mergePriceBook(DEFAULT_PRICE_BOOK, payload.entries, payload.grades);
}

export function parsePriceBookPayload(data: unknown): PriceBookPayload | null {
  if (typeof data !== 'object' || data === null) return null;
  const { entries, grades, migrated } = data as Record<string, unknown>;
  if (!Array.isArray(entries)) return null;
  if (grades !== null && !Array.isArray(grades)) return null;
  return {
    entries: entries as PriceBookEntry[],
    grades: grades as GradeRow[] | null,
    migrated: migrated === true,
  };
}

export async function fetchPriceBookPayload(): Promise<PriceBookPayload | null> {
  try {
    // A hung request must not block the calculator: after the timeout the defaults stay.
    const res = await fetch('/api/price-book', { cache: 'no-store', signal: AbortSignal.timeout(PRICE_BOOK_TIMEOUT_MS) });
    if (!res.ok) {
      console.error('Price book request failed:', res.status);
      return null;
    }
    return parsePriceBookPayload(await res.json());
  } catch (error) {
    console.error('Price book request failed:', error);
    return null;
  }
}

export interface UsePriceBook {
  priceBook: PriceBook;
  /** True once the request finished (successfully or not). */
  ready: boolean;
  reload: () => Promise<void>;
}

export function usePriceBook(): UsePriceBook {
  const [priceBook, setPriceBook] = useState<PriceBook>(DEFAULT_PRICE_BOOK);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const payload = await fetchPriceBookPayload();
    if (payload) setPriceBook(bookFromPayload(payload));
    setReady(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { priceBook, ready, reload };
}
