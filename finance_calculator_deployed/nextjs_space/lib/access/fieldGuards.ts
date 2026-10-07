// Field-level permissions on offer content (ROLE sheet: "may change PGL base", "may change
// price / margin"). Pure. The calculator locks the fields in the UI; the API re-checks here,
// because the client is never trusted.
//
// A value is allowed when the user may change it, OR it is the system default (live base PGL,
// default margin), OR it is unchanged from the saved version being edited - so a user without
// the permission can still edit other parts of an offer whose PGL a reviewer adjusted.

import type { Permissions } from './types';

interface Item {
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
  const prevPgl = new Set(before.map((i) => Number(i.pgl)).filter(Number.isFinite));
  const prevMargin = new Set(before.map((i) => Number(i.inputs?.marginPct)).filter(Number.isFinite));

  for (const item of items(next)) {
    const pgl = Number(item.pgl);
    if (!perms.canChangePglBase && Number.isFinite(pgl)) {
      const base = typeof item.type === 'string' ? baseFor(item.type) : Number.NaN;
      const allowed = same(pgl, base) || [...prevPgl].some((p) => same(p, pgl));
      if (!allowed) return 'pgl_locked';
    }
    const margin = Number(item.inputs?.marginPct);
    if (!perms.canChangePriceMargin && Number.isFinite(margin)) {
      const allowed = same(margin, defaultMarginPct) || [...prevMargin].some((p) => same(p, margin));
      if (!allowed) return 'margin_locked';
    }
  }
  return null;
}
