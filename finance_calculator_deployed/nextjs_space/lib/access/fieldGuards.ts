// Field-level permissions on offer content (ROLE sheet: "may change PGL base", "may change
// price / margin"). Pure. The calculator locks the fields in the UI; the API re-checks here,
// because the client is never trusted.
//
// A value is allowed when the user may change it, OR it is the system default (live base PGL,
// default margin), OR it is unchanged from the saved version being edited - so a user without
// the permission can still edit other parts of an offer whose PGL a reviewer adjusted.

import type { Permissions } from './types';

interface Item {
  id?: unknown;
  type?: unknown;
  pgl?: unknown;
  inputs?: { marginPct?: unknown } | null;
}

function items(data: unknown): Item[] {
  const list = (data as { zestawienie?: unknown } | null)?.zestawienie;
  return Array.isArray(list) ? (list as Item[]) : [];
}

const EPSILON = 1e-6;
const same = (a: number, b: number) => Math.abs(a - b) <= EPSILON;

/** A number only when the value really is one - Number(null) / Number('') would give 0. */
function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** The saved version of the same line: matched by id, else by position. */
function previousItem(before: Item[], item: Item, index: number): Item | undefined {
  if (item.id !== undefined && item.id !== null) {
    const byId = before.find((b) => b.id === item.id);
    if (byId) return byId;
  }
  return before[index];
}

export type FieldViolation = 'pgl_locked' | 'margin_locked';

export function fieldViolation(
  perms: Pick<Permissions, 'canChangePglBase' | 'canChangePriceMargin'> | 'all',
  next: unknown,
  previous: unknown,
  baseFor: (type: string) => number,
  defaultMarginPct: number
): FieldViolation | null {
  if (perms === 'all') return null;
  const before = items(previous);

  for (const [index, item] of items(next).entries()) {
    const prev = previousItem(before, item, index);
    if (!perms.canChangePglBase) {
      // A non-numeric PGL would slip past both this guard and the base-price rule.
      const pgl = num(item.pgl);
      if (pgl === null) return 'pgl_locked';
      const base = typeof item.type === 'string' ? baseFor(item.type) : Number.NaN;
      const prevPgl = num(prev?.pgl);
      if (!same(pgl, base) && !(prevPgl !== null && same(prevPgl, pgl))) return 'pgl_locked';
    }
    const marginRaw = item.inputs?.marginPct;
    if (!perms.canChangePriceMargin && marginRaw !== undefined) {
      const margin = num(marginRaw);
      const prevMargin = num(prev?.inputs?.marginPct);
      const allowed =
        margin !== null && (same(margin, defaultMarginPct) || (prevMargin !== null && same(prevMargin, margin)));
      if (!allowed) return 'margin_locked';
    }
  }
  return null;
}
