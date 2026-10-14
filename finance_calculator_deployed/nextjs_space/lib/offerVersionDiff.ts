// "What changed" between two saved versions of an offer (offer_X.N vs its predecessor).
// Pure module, shared by the list APIs (diff on the server) and the list pages (formatting
// in the viewer's language, lib/offerVersionDiffFormat.ts). offer_data comes from the
// database as untrusted JSON, so every field is read defensively.
//
// Only the offer itself is compared: the zestawienie items, terms and client. offer_data also
// carries the calculator's "next item" form state (currentType, thickness, top-level
// marginPct/extra/transport/tons/pglBase, option idx fields...) - none of it is read here, so
// changing only that state produces no change entries.
import { ceilToUnit, offerCurrency, offerRate, toDisplay, type Currency } from './currency';

export type ChangeField =
  | 'item_added'
  | 'item_removed'
  | 'item_spec'
  | 'tons'
  | 'margin'
  | 'marza'
  | 'final_price'
  | 'transport'
  | 'extra'
  | 'extra_comment'
  | 'total'
  | 'transport_route'
  | 'payment_term'
  | 'valid_from'
  | 'valid_to'
  | 'currency'
  | 'eur_pln_rate'
  | 'company'
  | 'nip'
  | 'sap_id'
  | 'address'
  | 'contact'
  | 'email'
  | 'phone'
  | 'offer_name';

export type ChangeValue = string | number | null;

export interface OfferChange {
  field: ChangeField;
  /** Item label ("HDG 2×1250") for per-item changes. */
  item?: string;
  old: ChangeValue;
  new: ChangeValue;
  /** new - old, in the unit of the values (t, pp, money). Absent when not meaningful. */
  delta?: number;
  /** Money values are already converted to this display currency. */
  currency?: Currency;
  /** Currency of `old` when it differs from `currency` (offer total across a currency switch). */
  oldCurrency?: Currency;
}

/** Stored in old/new of a transport_route change when the client picks the goods up. */
export const SELF_PICKUP = '__self_pickup__';

type Data = Record<string, unknown>;

const EPS = 1e-9;
// Money below half a cent is float noise, not a price change.
const MONEY_EPS = 0.005;

function num(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function obj(v: unknown): Data {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Data) : {};
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function differs(a: number | null, b: number | null, eps = EPS): boolean {
  if (a === null || b === null) return a !== b;
  return Math.abs(a - b) > eps;
}

function items(data: Data): Data[] {
  return Array.isArray(data.zestawienie) ? data.zestawienie.map(obj) : [];
}

// Items are matched across versions by item.id. An item without one (hand-edited legacy data)
// is matched by its spec plus occurrence instead of its position, so removing an item in the
// middle does not shift every later one onto the wrong neighbour.
function itemKeys(list: Data[]): string[] {
  const seen = new Map<string, number>();
  return list.map((item) => {
    const id = item.id;
    if (typeof id === 'number' || typeof id === 'string') return `id:${id}`;
    const spec = itemSpec(item);
    const n = (seen.get(spec) ?? 0) + 1;
    seen.set(spec, n);
    return `spec:${spec}#${n}`;
  });
}

function fmtDim(v: unknown): string {
  const n = num(v);
  return n === null ? '?' : String(round(n, 3));
}

/** "HDG 2×1250" - type, thickness × width. */
export function itemLabel(item: Data): string {
  return `${str(item.type) || '?'} ${fmtDim(item.thickness)}×${fmtDim(item.width)}`;
}

/** Full spec, used to detect an item edited into a different product. */
function itemSpec(item: Data): string {
  const length = num(item.length);
  const dims = length && !item.isCoil ? `${itemLabel(item)}×${fmtDim(length)}` : itemLabel(item);
  return [dims, str(item.grade)].filter(Boolean).join(' ');
}

function itemTons(item: Data): number {
  return num(item.tons) ?? 0;
}

/** Same as the lists' calculateOfferTotal: sum of item totalValue, in EUR. */
export function offerTotalEur(data: unknown): number {
  return items(obj(data)).reduce((sum, item) => sum + (num(item.totalValue) ?? 0), 0);
}

interface MoneyCtx {
  currency: Currency;
  rate: number;
}

function moneyCtx(data: Data): MoneyCtx {
  return { currency: offerCurrency(data), rate: offerRate(data) };
}

// Per-ton amounts of both versions are shown in the NEWER version's currency and rate, so the
// delta is the real price change and not a side effect of a refreshed exchange rate. The final
// price is rounded up to a full unit like everywhere else (ceilToUnit), the rest to cents.
function moneyChange(
  field: ChangeField,
  item: string,
  oldEur: number | null,
  newEur: number | null,
  m: MoneyCtx,
  ceil = false
): OfferChange | null {
  if (oldEur === null || newEur === null || !differs(oldEur, newEur, MONEY_EPS)) return null;
  const show = (eur: number) =>
    ceil ? ceilToUnit(eur, m.rate, m.currency) : round(toDisplay(eur, m.rate, m.currency), 2);
  const o = show(oldEur);
  const n = show(newEur);
  if (o === n) return null;
  return { field, item, old: o, new: n, delta: round(n - o, 2), currency: m.currency };
}

function marginChange(prev: Data, curr: Data, label: string, m: MoneyCtx): OfferChange | null {
  const oldPct = num(obj(prev.inputs).marginPct);
  const newPct = num(obj(curr.inputs).marginPct);
  if (oldPct === null || newPct === null) {
    // Legacy items (saved before ItemInputs) have no margin %, only the €/t margin amount.
    return moneyChange('marza', label, num(prev.marza), num(curr.marza), m);
  }
  if (!differs(oldPct, newPct)) return null;
  return { field: 'margin', item: label, old: oldPct, new: newPct, delta: round(newPct - oldPct, 2) };
}

function diffItem(prev: Data, curr: Data, m: MoneyCtx): OfferChange[] {
  const label = itemLabel(curr);
  const prevInputs = obj(prev.inputs);
  const currInputs = obj(curr.inputs);
  const out: (OfferChange | null)[] = [];

  if (itemSpec(prev) !== itemSpec(curr)) {
    out.push({ field: 'item_spec', item: label, old: itemSpec(prev), new: itemSpec(curr) });
  }
  const oldTons = itemTons(prev);
  const newTons = itemTons(curr);
  if (differs(oldTons, newTons)) {
    out.push({ field: 'tons', item: label, old: oldTons, new: newTons, delta: round(newTons - oldTons, 3) });
  }
  out.push(marginChange(prev, curr, label, m));
  out.push(moneyChange('final_price', label, num(prev.finalPrice), num(curr.finalPrice), m, true));
  out.push(moneyChange('transport', label, num(prevInputs.transport), num(currInputs.transport), m));
  out.push(moneyChange('extra', label, num(prevInputs.extra), num(currInputs.extra), m));
  out.push(textChange('extra_comment', str(prevInputs.extraComment), str(currInputs.extraComment), label));

  return out.filter((c): c is OfferChange => c !== null);
}

function diffItems(prev: Data, curr: Data): OfferChange[] {
  const m = moneyCtx(curr);
  const prevItems = items(prev);
  const currItems = items(curr);
  const prevKeys = itemKeys(prevItems);
  const currKeyList = itemKeys(currItems);
  const prevByKey = new Map(prevItems.map((it, i) => [prevKeys[i], it]));
  const currKeys = new Set(currKeyList);
  const out: OfferChange[] = [];

  currItems.forEach((item, i) => {
    const before = prevByKey.get(currKeyList[i]);
    if (before) out.push(...diffItem(before, item, m));
    else out.push({ field: 'item_added', item: itemLabel(item), old: null, new: itemTons(item) });
  });
  prevItems.forEach((item, i) => {
    if (!currKeys.has(prevKeys[i])) {
      out.push({ field: 'item_removed', item: itemLabel(item), old: itemTons(item), new: null });
    }
  });
  return out;
}

// Each version's total in ITS OWN currency and rate - exactly the 💰 amount its list row shows.
function diffTotal(prev: Data, curr: Data): OfferChange | null {
  const pm = moneyCtx(prev);
  const cm = moneyCtx(curr);
  const o = ceilToUnit(offerTotalEur(prev), pm.rate, pm.currency);
  const n = ceilToUnit(offerTotalEur(curr), cm.rate, cm.currency);
  if (pm.currency !== cm.currency) {
    return { field: 'total', old: o, new: n, currency: cm.currency, oldCurrency: pm.currency };
  }
  if (o === n) return null;
  return { field: 'total', old: o, new: n, delta: n - o, currency: cm.currency };
}

function routeText(v: unknown): string {
  const route = obj(v);
  if (route.selfPickup === true) return SELF_PICKUP;
  const address = str(route.destAddress);
  const km = num(route.distanceKm);
  return km === null ? address : `${address} (${round(km, 1)} km)`.trim();
}

function contactText(client: Data): string {
  return [str(client.firstName), str(client.lastName)].filter(Boolean).join(' ');
}

const CLIENT_FIELDS: Array<[ChangeField, (c: Data) => string]> = [
  ['company', (c) => str(c.company)],
  ['nip', (c) => str(c.nip)],
  ['sap_id', (c) => str(c.sapId)],
  ['address', (c) => str(c.address)],
  ['contact', contactText],
  ['email', (c) => str(c.email)],
  ['phone', (c) => str(c.phone)],
];

function textChange(field: ChangeField, o: string, n: string, item?: string): OfferChange | null {
  if (o === n) return null;
  const change: OfferChange = { field, old: o || null, new: n || null };
  return item ? { ...change, item } : change;
}

function diffTerms(prev: Data, curr: Data): OfferChange[] {
  const out: (OfferChange | null)[] = [];
  out.push(textChange('transport_route', routeText(prev.transportRoute), routeText(curr.transportRoute)));

  const oldTerm = num(prev.paymentTermDays);
  const newTerm = num(curr.paymentTermDays);
  if (differs(oldTerm, newTerm)) out.push({ field: 'payment_term', old: oldTerm, new: newTerm });

  out.push(textChange('valid_from', str(prev.validFrom), str(curr.validFrom)));
  out.push(textChange('valid_to', str(prev.validTo), str(curr.validTo)));

  const oldCur = offerCurrency(prev);
  const newCur = offerCurrency(curr);
  if (oldCur !== newCur) out.push({ field: 'currency', old: oldCur, new: newCur });
  // The rate is frozen on every save; it only matters when one of the versions shows PLN.
  if (oldCur === 'PLN' || newCur === 'PLN') {
    const oldRate = offerRate(prev);
    const newRate = offerRate(curr);
    if (differs(oldRate, newRate, 1e-6)) out.push({ field: 'eur_pln_rate', old: oldRate, new: newRate });
  }

  const oldClient = obj(prev.clientInfo);
  const newClient = obj(curr.clientInfo);
  for (const [field, read] of CLIENT_FIELDS) out.push(textChange(field, read(oldClient), read(newClient)));

  return out.filter((c): c is OfferChange => c !== null);
}

const PRIORITY: Partial<Record<ChangeField, number>> = {
  item_added: 0,
  item_removed: 0,
  tons: 0,
  margin: 1,
  marza: 1,
  total: 2,
};

const REST_PRIORITY = 3;

export function changePriority(change: OfferChange): number {
  return PRIORITY[change.field] ?? REST_PRIORITY;
}

export interface OfferNames {
  prev?: string | null;
  curr?: string | null;
}

/**
 * Every change between two offer_data objects, most important first:
 * items/tons > margin > total > the rest (original order kept within a group).
 */
export function diffOfferVersions(prevData: unknown, currData: unknown, names: OfferNames = {}): OfferChange[] {
  const prev = obj(prevData);
  const curr = obj(currData);
  const total = diffTotal(prev, curr);
  const name = textChange('offer_name', str(names.prev), str(names.curr));
  const changes = [
    ...diffItems(prev, curr),
    ...(total ? [total] : []),
    ...diffTerms(prev, curr),
    ...(name ? [name] : []),
  ];

  return changes
    .map((c, i) => ({ c, i }))
    .sort((a, b) => changePriority(a.c) - changePriority(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

// ---------------------------------------------------------------------------------------------
// Per-row summary returned by the list APIs.

export type VersionEvent = 'created' | 'edit' | 'reviewer_edit' | 'renegotiation';

export interface ChangeSummary {
  /** Set for the first version of a family (nothing to compare with). */
  base: { items: number; tons: number } | null;
  changes: OfferChange[];
  event: VersionEvent;
  /** Who saved this version (offers.created_by); null for rows saved before migration 033. */
  author: string | null;
}

/** Columns added to a list query by PREDECESSOR_COLUMNS (lib/offerVersions.ts). */
export interface PredecessorColumns {
  prev_id?: number | null;
  prev_offer_data?: unknown;
  prev_offer_name?: string | null;
  prev_client_decision?: string | null;
  created_by?: number | null;
  created_by_name?: string | null;
  created_by_email?: string | null;
}

export interface SummarizableRow extends PredecessorColumns {
  offer_data: unknown;
  offer_name?: string | null;
  user_id?: number | null;
}

function versionEvent(row: SummarizableRow): VersionEvent {
  if (row.prev_client_decision === 'lost') return 'renegotiation';
  const author = row.created_by ?? null;
  const owner = row.user_id ?? null;
  return author !== null && owner !== null && author !== owner ? 'reviewer_edit' : 'edit';
}

export function buildChangeSummary(row: SummarizableRow): ChangeSummary {
  const author = row.created_by_name || row.created_by_email || null;
  if (row.prev_id === null || row.prev_id === undefined) {
    const list = items(obj(row.offer_data));
    const tons = round(list.reduce((sum, it) => sum + itemTons(it), 0), 3);
    return { base: { items: list.length, tons }, changes: [], event: 'created', author };
  }
  const changes = diffOfferVersions(row.prev_offer_data, row.offer_data, {
    prev: row.prev_offer_name ?? null,
    curr: row.offer_name ?? null,
  });
  return { base: null, changes, event: versionEvent(row), author };
}

type PredecessorKey = keyof PredecessorColumns;

/** Replaces the raw predecessor/author columns of a list row with its change_summary. */
export function withChangeSummary<T extends SummarizableRow>(
  row: T
): Omit<T, PredecessorKey> & { change_summary: ChangeSummary } {
  const change_summary = buildChangeSummary(row);
  const {
    prev_id: _prevId,
    prev_offer_data: _prevData,
    prev_offer_name: _prevName,
    prev_client_decision: _prevDecision,
    created_by: _createdBy,
    created_by_name: _createdByName,
    created_by_email: _createdByEmail,
    ...rest
  } = row;
  return { ...rest, change_summary };
}
