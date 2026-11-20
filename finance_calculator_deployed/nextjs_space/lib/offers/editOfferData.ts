// Applies an assistant-proposed edit to an existing offer_data (docs/ai-assistant-plan.md 7,
// propose_offer_edit). Pure: no I/O.
//
// What an edit may change: the margin (all lines or one), the tons of a line, removing lines,
// adding new lines (priced like a fresh calculator line), the client and the payment / quote
// validity terms. A changed line is re-priced with pricingEngine.computeItemPricing - the same
// function the calculator uses to re-price a saved line - keeping the line's own PGL and its
// saved option values, grade, coating and transport. The table lookups (dimension, coating,
// base, yield, scrap %) come from the CURRENT price book and settings, as in the calculator;
// when that moves a line's mill or SSC surcharges, the result says so (`repriced`).

import { editableIncoterm, type ItemInputs, type SteelType } from '../calculatorData';
import type { AppSettings } from '../currency';
import type { ClientInfo } from '../pdfGenerator';
import type { PriceBook } from '../priceBook';
import {
  computeItemPricing, sheetsFromTons, sheetWeightTons, smallQuantitySurcharge, type RecomputableItem,
} from '../pricingEngine';
import { DELIVERY_TERMS, priceItemCore, sheetDensity, type DeliveryTerm, type PriceItemResult } from '../pricing/priceItem';
import { itemOf, type DraftItemInput } from './buildOfferData';
import type { OfferData } from './create';

export interface LineChange {
  /** 1-based, in the stored order (as get_offer lists them). */
  line: number;
  margin_pct?: number;
  tons?: number;
  remove?: boolean;
}

export interface OfferEdit {
  /** New margin for every line (a per-line margin_pct wins over it). */
  marginPct?: number;
  lines?: readonly LineChange[];
  addItems?: readonly DraftItemInput[];
  /** Delivery term of added lines; default = the one term the offer's lines already use. */
  addIncoterm?: DeliveryTerm;
  client?: { info: ClientInfo; paymentTermDays: number };
  paymentTermDays?: number;
  quoteValidityHours?: number;
}

export interface EditEnv {
  settings: AppSettings;
  book: PriceBook;
  /** PGL of the offer's validity quarter, for added lines. */
  pglOf: (type: SteelType) => number;
  defaultMarginPct: number;
  stamp: number;
}

export type EditProblem =
  | { kind: 'no_line'; line: number }
  | { kind: 'duplicate_line'; line: number }
  | { kind: 'legacy_line'; line: number }
  | { kind: 'no_lines_left' }
  /** Lines added to an offer whose lines use several (or no) delivery terms: ask which one. */
  | { kind: 'needs_incoterm' }
  | { kind: 'added_line'; index: number; problem: Exclude<PriceItemResult, { status: 'ok' }> };

/** A re-priced line whose table surcharges differ from what was saved (price book changed). */
export interface RepricedLine {
  line: number;
  sumaHuta: [number, number];
  sumaSSC: [number, number];
}

export type EditResult =
  | { ok: true; offerData: OfferData; repriced: RepricedLine[] }
  | { ok: false; problem: EditProblem };

type Item = Record<string, unknown> & { inputs?: unknown };

const isDeliveryTerm = (term: string): term is DeliveryTerm => (DELIVERY_TERMS as readonly string[]).includes(term);

/** Saved inputs that can be re-priced: an object with a numeric margin and transport. */
function repriceableInputs(inputs: unknown): ItemInputs | null {
  if (!inputs || typeof inputs !== 'object') return null;
  const i = inputs as Record<string, unknown>;
  return typeof i.marginPct === 'number' && typeof i.transport === 'number' ? (inputs as ItemInputs) : null;
}

function repriceLine(item: Item, inputs: ItemInputs, change: { marginPct?: number; tons?: number }, env: EditEnv): Item {
  const type = item.type as SteelType;
  const tons = change.tons ?? Number(item.tons);
  const isCoil = item.isCoil === true;
  const tonsChanged = change.tons !== undefined && change.tons !== Number(item.tons);
  let nextInputs: ItemInputs = { ...inputs, ...(change.marginPct !== undefined ? { marginPct: change.marginPct } : {}) };
  if (tonsChanged) {
    // As when the line is edited in the calculator: the small-quantity surcharge follows the
    // tons, and a sheet line typed in tons shows the matching sheet count.
    const weight = isCoil ? 0 : sheetWeightTons(Number(item.thickness), Number(item.width), Number(item.length), sheetDensity(type));
    nextInputs = {
      ...nextInputs,
      smallQtySurcharge: smallQuantitySurcharge(env.book, type, tons),
      ...(isCoil ? {} : { quantitySource: 'tons' as const, sheetCount: sheetsFromTons(tons, weight) }),
    };
  }
  const next = { ...item, tons, inputs: nextInputs };
  const priced = computeItemPricing(next as unknown as RecomputableItem, Number(item.pgl), env.settings, env.book);
  if (!priced) throw new Error('computeItemPricing returned null for a line with inputs');
  return { ...next, ...priced };
}

/** The single delivery term the offer's lines use, or null when they mix terms or have none. */
function offerIncoterm(items: readonly Item[]): DeliveryTerm | null {
  const terms = new Set(items.map((it) => editableIncoterm((it.inputs as { incoterm?: unknown } | undefined)?.incoterm)));
  const [only] = terms;
  return terms.size === 1 && only && isDeliveryTerm(only) ? only : null;
}

export function applyOfferEdit(offerData: OfferData, edit: OfferEdit, env: EditEnv): EditResult {
  const items = (Array.isArray(offerData.zestawienie) ? offerData.zestawienie : []) as Item[];
  const byLine = new Map<number, LineChange>();
  for (const change of edit.lines ?? []) {
    if (change.line < 1 || change.line > items.length) return { ok: false, problem: { kind: 'no_line', line: change.line } };
    if (byLine.has(change.line)) return { ok: false, problem: { kind: 'duplicate_line', line: change.line } };
    byLine.set(change.line, change);
  }

  const kept: Item[] = [];
  const repriced: RepricedLine[] = [];
  for (const [i, item] of items.entries()) {
    const change = byLine.get(i + 1);
    if (change?.remove) continue;
    const marginPct = change?.margin_pct ?? edit.marginPct;
    const tons = change?.tons;
    if (marginPct === undefined && tons === undefined) {
      kept.push(item);
      continue;
    }
    // Lines saved before ItemInputs existed cannot be re-priced safely (same rule as the calculator).
    const inputs = repriceableInputs(item.inputs);
    if (!inputs) return { ok: false, problem: { kind: 'legacy_line', line: i + 1 } };
    const next = repriceLine(item, inputs, { marginPct, tons }, env);
    if (next.sumaHuta !== item.sumaHuta || next.sumaSSC !== item.sumaSSC) {
      repriced.push({ line: i + 1, sumaHuta: [Number(item.sumaHuta), Number(next.sumaHuta)], sumaSSC: [Number(item.sumaSSC), Number(next.sumaSSC)] });
    }
    kept.push(next);
  }

  const adds = edit.addItems ?? [];
  // A new line never picks a delivery term on its own (the calculator makes the user choose).
  const addIncoterm = adds.length > 0 ? edit.addIncoterm ?? offerIncoterm(items) : null;
  if (adds.length > 0 && !addIncoterm) return { ok: false, problem: { kind: 'needs_incoterm' } };
  for (const [index, add] of adds.entries()) {
    const priced = priceItemCore({ ...add, incoterm: addIncoterm as DeliveryTerm }, env.pglOf(add.type), env.settings, env.book, env.defaultMarginPct);
    if (priced.status !== 'ok') return { ok: false, problem: { kind: 'added_line', index, problem: priced } };
    kept.push(itemOf(add, priced, env.stamp + index));
  }
  if (kept.length === 0) return { ok: false, problem: { kind: 'no_lines_left' } };

  return {
    ok: true,
    repriced,
    offerData: {
      ...offerData,
      zestawienie: kept,
      ...(edit.client ? { clientInfo: edit.client.info, paymentTermDays: edit.client.paymentTermDays } : {}),
      ...(edit.paymentTermDays !== undefined ? { paymentTermDays: edit.paymentTermDays } : {}),
      ...(edit.quoteValidityHours !== undefined ? { quoteValidityHours: edit.quoteValidityHours } : {}),
    },
  };
}
