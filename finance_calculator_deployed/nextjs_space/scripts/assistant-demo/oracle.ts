// Golden-set oracle: computes the expected answer of an aggregate question straight from the
// demo spec (spec.ts + offerData.ts), WITHOUT the analytics engine or the database. The
// assistant's tools must reproduce these numbers through lib/analytics*; a mismatch means one
// of the two is wrong - which is the point of having two independent implementations.
//
// Definitions follow docs/ai-assistant-plan.md 3.1 / 3.2 and the rules in lib/analyticsQuery.ts:
//   - one row per offer family = its LATEST version,
//   - dates are Warsaw calendar days (the spec stores Warsaw wall-clock time),
//   - a basis other than 'created' drops rows whose date is missing,
//   - money in EUR (source of truth) + PLN converted per offer with its frozen rate,
//   - a steel-type filter keeps only matching line items.

import { PEOPLE, buildDemoOffers, type Decision, type LostReason, type OfferSpec, type Status, type SteelType } from './spec';
import { buildOfferData } from './offerData';
import { expectedOwners, type Asker } from './visibility';

export type Basis = 'created' | 'sent' | 'decided';
export type GroupBy = 'person' | 'client' | 'steel_type' | 'month';

export interface OracleFilters {
  people?: string[];
  clients?: string[];
  steelTypes?: SteelType[];
  statuses?: Status[];
  decisions?: Decision[];
}

export interface OracleQuery {
  basis: Basis;
  /** Inclusive YYYY-MM-DD. */
  from: string;
  to: string;
  filters?: OracleFilters;
}

export interface Row {
  key: string;
  /** Database id of the latest version (ids are sequential on a reset seed). */
  id: number;
  owner: string;
  client: string;
  status: Status;
  decision: Decision;
  lostReason: LostReason | null;
  created: string;
  sent: string | null;
  decided: string | null;
  items: { type: SteelType; tons: number; valueEur: number; marginPct: number | null }[];
  rate: number;
}

export interface Totals {
  offers: number;
  tons: number;
  valueEur: number;
  valuePln: number;
  clients: number;
  /** Tonnage-weighted margin % over items that carry one; null when none does. */
  marginWeighted: number | null;
  /** Plain average of the per-offer (weighted) margins; null when no offer has one. */
  marginSimple: number | null;
  /** Offers that contributed to the margin figures. */
  offersWithMargin: number;
  won: number;
  lost: number;
  tonsWon: number;
  tonsLost: number;
  valueWonEur: number;
  valueWonPln: number;
  valueLostEur: number;
  valueLostPln: number;
  winRateOffers: number | null;
  winRateTons: number | null;
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

let cache: Row[] | null = null;

/** Latest version of every family, with ids assigned in seed insertion order. */
export function rows(): Row[] {
  if (cache) return cache;
  const out: Row[] = [];
  let nextId = 1;
  let stamp = 1_790_000_000_000;
  for (const offer of buildDemoOffers()) {
    const lastIndex = offer.versions.length - 1;
    const data = buildOfferData(offer, offer.versions[lastIndex], stamp + lastIndex * 10);
    nextId += offer.versions.length;
    stamp += 1000;
    out.push(toRow(offer, nextId - 1, data));
  }
  cache = out;
  return out;
}

function toRow(offer: OfferSpec, id: number, data: Record<string, unknown>): Row {
  const v = offer.versions[offer.versions.length - 1];
  const items = (data.zestawienie as Record<string, unknown>[]).map((it) => {
    const inputs = it.inputs as { marginPct?: number } | undefined;
    return {
      type: it.type as SteelType,
      tons: it.tons as number,
      valueEur: it.totalValue as number,
      marginPct: typeof inputs?.marginPct === 'number' ? inputs.marginPct : null,
    };
  });
  return {
    key: offer.key, id, owner: offer.owner, client: offer.client,
    status: v.status, decision: v.decision, lostReason: v.lostReason ?? null,
    created: v.createdAt.slice(0, 10),
    sent: v.sentAt?.slice(0, 10) ?? null,
    decided: v.decidedAt?.slice(0, 10) ?? null,
    items, rate: offer.eurPlnRate,
  };
}

/** Rows the asker may see, inside the window, after filters; items narrowed by steel type. */
export function select(asker: Asker, q: OracleQuery): Row[] {
  const owners = expectedOwners(asker);
  const f = q.filters ?? {};
  return rows()
    .filter((r) => owners.has(r.owner))
    .filter((r) => {
      const d = q.basis === 'created' ? r.created : q.basis === 'sent' ? r.sent : r.decided;
      return d !== null && d >= q.from && d <= q.to;
    })
    .filter((r) => !f.people?.length || f.people.includes(r.owner))
    .filter((r) => !f.clients?.length || f.clients.includes(r.client))
    .filter((r) => !f.statuses?.length || f.statuses.includes(r.status))
    .filter((r) => !f.decisions?.length || f.decisions.includes(r.decision))
    .map((r) => (f.steelTypes?.length ? { ...r, items: r.items.filter((i) => f.steelTypes!.includes(i.type)) } : r))
    .filter((r) => r.items.length > 0);
}

interface OfferFigures { tons: number; eur: number; pln: number; margin: number | null }

// Per-offer rounding is part of the definition (the same figure the offer table shows): tons to
// 3 places, EUR to cents, PLN = unrounded EUR x the offer's frozen rate, to cents. Totals are
// sums of these per-offer figures.
function figures(r: Row): OfferFigures {
  const rawEur = r.items.reduce((s, i) => s + i.valueEur, 0);
  let marginNum = 0;
  let marginTons = 0;
  for (const i of r.items) {
    if (i.marginPct === null || i.tons <= 0) continue;
    marginNum += i.marginPct * i.tons;
    marginTons += i.tons;
  }
  return {
    tons: round(r.items.reduce((s, i) => s + i.tons, 0), 3),
    eur: round(rawEur, 2),
    pln: round(rawEur * r.rate, 2),
    margin: marginTons > 0 ? marginNum / marginTons : null,
  };
}

/** Locale-independent ordering, so ties sort identically on every machine. */
const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function basisDate(r: Row, basis: Basis): string | null {
  return basis === 'created' ? r.created : basis === 'sent' ? r.sent : r.decided;
}

export function totals(selected: Row[]): Totals {
  let tons = 0, eur = 0, pln = 0, marginNum = 0, marginDen = 0, simpleSum = 0, simpleN = 0;
  let won = 0, lost = 0, tonsWon = 0, tonsLost = 0, wonEur = 0, wonPln = 0, lostEur = 0, lostPln = 0;
  for (const r of selected) {
    const f = figures(r);
    tons += f.tons; eur += f.eur; pln += f.pln;
    for (const i of r.items) {
      if (i.marginPct !== null && i.tons > 0) { marginNum += i.marginPct * i.tons; marginDen += i.tons; }
    }
    if (f.margin !== null) { simpleSum += f.margin; simpleN++; }
    if (r.decision === 'won') { won++; tonsWon += f.tons; wonEur += f.eur; wonPln += f.pln; }
    if (r.decision === 'lost') { lost++; tonsLost += f.tons; lostEur += f.eur; lostPln += f.pln; }
  }
  const rate = (a: number, b: number) => (a + b > 0 ? round((a / (a + b)) * 100, 1) : null);
  return {
    offers: selected.length,
    tons: round(tons, 3), valueEur: round(eur, 2), valuePln: round(pln, 2),
    clients: new Set(selected.map((r) => r.client)).size,
    marginWeighted: marginDen > 0 ? round(marginNum / marginDen, 2) : null,
    marginSimple: simpleN > 0 ? round(simpleSum / simpleN, 2) : null,
    offersWithMargin: simpleN,
    won, lost,
    tonsWon: round(tonsWon, 3), tonsLost: round(tonsLost, 3),
    valueWonEur: round(wonEur, 2), valueWonPln: round(wonPln, 2),
    valueLostEur: round(lostEur, 2), valueLostPln: round(lostPln, 2),
    winRateOffers: rate(won, lost), winRateTons: rate(tonsWon, tonsLost),
  };
}

/**
 * Totals per group, largest tonnage first (ties by key, so the order is stable). Months bucket on
 * the query's basis date, like the /analytics time series.
 */
export function grouped(selected: Row[], by: GroupBy, basis: Basis): { key: string; totals: Totals }[] {
  const groups = new Map<string, Row[]>();
  const add = (key: string, r: Row) => groups.set(key, [...(groups.get(key) ?? []), r]);
  for (const r of selected) {
    if (by === 'person') add(r.owner, r);
    else if (by === 'client') add(r.client, r);
    else if (by === 'month') {
      const date = basisDate(r, basis);
      if (date) add(date.slice(0, 7), r);
    } else {
      for (const t of new Set(r.items.map((i) => i.type))) add(t, { ...r, items: r.items.filter((i) => i.type === t) });
    }
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, totals: totals(list) }))
    .sort((a, b) => b.totals.tons - a.totals.tons || byKey(a.key, b.key));
}

/** Lost offers by reason, with share of lost offers (sums to 100). */
export function lostReasons(selected: Row[]): { reason: string; offers: number; sharePct: number }[] {
  const lost = selected.filter((r) => r.decision === 'lost');
  const counts = new Map<string, number>();
  for (const r of lost) {
    // Same fallback as the engine: a lost offer without a (non-empty) reason counts as 'other'.
    const reason = r.lostReason || 'other';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  // Ordered by count (the answer's table order); the panel orders by the admin list instead.
  return [...counts.entries()]
    .map(([reason, offers]) => ({ reason, offers, sharePct: round((offers / lost.length) * 100, 1) }))
    .sort((a, b) => b.offers - a.offers || byKey(a.reason, b.reason));
}

export function personName(key: string): string {
  return PEOPLE.find((p) => p.key === key)?.fullName ?? key;
}
