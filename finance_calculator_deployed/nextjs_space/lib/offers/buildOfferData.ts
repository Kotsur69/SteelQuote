// Server-side builder of offer_data for a draft the assistant proposes (docs/ai-assistant-plan.md
// 7.2). The calculator builds offer_data in the browser; a draft built here must open in the
// calculator exactly like one the user typed in, so it reproduces the calculator's save:
//   - every line is priced by the same engine as price_item (priceItemCore: default options of
//     the steel type, live price book, PGL of the validity quarter),
//   - the item snapshot has the calculator's field set (addToZestawienie),
//   - the top-level editor state is the one the calculator holds right after adding the last
//     line (collectOfferData), plus the new-offer defaults (this-month validity, payment term of
//     the client or the global one, 24 h quote validity, frozen EUR/PLN rate, no route).
// Parity with a real calculator save is pinned by tests/offers/buildOfferData.test.ts.
//
// Pure: no I/O. The caller loads settings, price book and PGL.

import type { ItemInputs, SteelType } from '../calculatorData';
import type { AppSettings } from '../currency';
import type { ClientInfo } from '../pdfGenerator';
import type { PriceBook } from '../priceBook';
import { priceItemCore, type DeliveryTerm, type PriceItemInput, type PriceItemResult } from '../pricing/priceItem';
import type { OfferData } from './create';

export const MAX_DRAFT_ITEMS = 20;
/** Editor length the calculator keeps while coil mode is on (its initial sheet length). */
const CALCULATOR_DEFAULT_LENGTH = 3000;
/** Empty delivery route (components/TransportPanel.tsx EMPTY_TRANSPORT_ROUTE): no route, typed transport. */
const EMPTY_ROUTE = {
  destAddress: '', distanceKm: null, destLabel: null, hasLongElements: false, oversizeManual: false, manualMode: false,
} as const;

export type DraftItemInput = Omit<PriceItemInput, 'valid_from' | 'incoterm'>;

export interface DraftTerms {
  validFrom: string;
  validTo: string;
  paymentTermDays: number;
  quoteValidityHours: number;
  incoterm: DeliveryTerm;
}

export interface DraftInput {
  clientInfo: ClientInfo;
  items: readonly DraftItemInput[];
  terms: DraftTerms;
}

export interface BuildEnv {
  settings: AppSettings;
  book: PriceBook;
  /** PGL base of the validity quarter per steel type (lib/access/config.ts loadBaseResolver). */
  pglOf: (type: SteelType) => number;
  defaultMarginPct: number;
  /** First item id; the calculator uses Date.now() per added line. */
  stamp: number;
}

export interface PricedLine {
  index: number;
  item: Record<string, unknown>;
  oneTimeGrade: boolean;
  baseFallbackUsed: boolean;
}

export type BuildResult =
  | { ok: true; offerData: OfferData; lines: PricedLine[] }
  /** A line that cannot be priced: the assistant asks, no draft is proposed (plan D20). */
  | { ok: false; index: number; problem: Exclude<PriceItemResult, { status: 'ok' }> };

/** A priced line in the calculator's item snapshot shape (Calculator.tsx addToZestawienie). */
export function itemOf(input: DraftItemInput, priced: Extract<PriceItemResult, { status: 'ok' }>, id: number): Record<string, unknown> {
  const p = priced.pricing;
  // Same keys as the calculator's ZestawienieItem snapshot; coating only for coated types.
  return {
    id,
    type: input.type,
    grade: priced.grade,
    thickness: input.thickness,
    width: input.width,
    length: priced.length,
    sumaHuta: p.sumaHuta,
    sumaSSC: p.sumaSSC,
    marza: p.marza,
    finalPrice: p.finalPrice,
    tons: priced.tons,
    totalValue: p.totalValue,
    pgl: p.pgl,
    isCoil: priced.isCoil,
    ...(input.type === 'HDG' || input.type === 'ZM' ? { coating: priced.inputs.selectedCoating } : {}),
    inputs: priced.inputs,
  };
}

/** Top-level calculator editor state after the last line was added (collectOfferData). */
function editorState(input: DraftItemInput, inputs: ItemInputs, tons: number, pglBase: number): OfferData {
  const isCoil = (input.length ?? 0) === 0;
  const { selectedGrade, selectedCoating, marginPct, extra, extraComment, extraCommentInPdf, transport, incoterm } = inputs;
  const optionFields = Object.fromEntries(
    Object.entries(inputs).filter(([key]) => !NON_OPTION_FIELDS.has(key))
  );
  return {
    currentType: input.type,
    thickness: input.thickness,
    width: input.width,
    length: isCoil ? CALCULATOR_DEFAULT_LENGTH : input.length,
    isCoilMode: isCoil,
    gradeInput: selectedGrade?.name ?? '',
    selectedGrade,
    ...optionFields,
    selectedCoating,
    pglBase, marginPct, extra, extraComment, extraCommentInPdf, transport, tons, incoterm,
    quantitySource: inputs.quantitySource ?? 'tons',
    sheetCount: inputs.sheetCount ?? 0,
  };
}

const NON_OPTION_FIELDS = new Set([
  'selectedGrade', 'selectedCoating', 'marginPct', 'extra', 'extraComment', 'extraCommentInPdf',
  'transport', 'smallQtySurcharge', 'incoterm', 'quantitySource', 'sheetCount',
]);

export function buildOfferData(draft: DraftInput, env: BuildEnv): BuildResult {
  if (draft.items.length === 0 || draft.items.length > MAX_DRAFT_ITEMS) {
    throw new Error(`A draft needs 1-${MAX_DRAFT_ITEMS} items`);
  }
  const lines: PricedLine[] = [];
  let last: { input: DraftItemInput; inputs: ItemInputs; tons: number; pgl: number } | null = null;

  for (const [index, input] of draft.items.entries()) {
    const pgl = env.pglOf(input.type);
    const priced = priceItemCore(
      { ...input, incoterm: draft.terms.incoterm }, pgl, env.settings, env.book, env.defaultMarginPct
    );
    if (priced.status !== 'ok') return { ok: false, index, problem: priced };
    lines.push({
      index,
      item: itemOf(input, priced, env.stamp + index),
      oneTimeGrade: priced.oneTimeGrade,
      baseFallbackUsed: priced.baseFallbackUsed,
    });
    last = { input, inputs: priced.inputs, tons: priced.tons, pgl };
  }
  if (!last) throw new Error('unreachable: no priced line');

  const { terms } = draft;
  const offerData: OfferData = {
    ...editorState(last.input, last.inputs, last.tons, last.pgl),
    validFrom: terms.validFrom,
    validTo: terms.validTo,
    paymentTermDays: terms.paymentTermDays,
    quoteValidityHours: terms.quoteValidityHours,
    zestawienie: lines.map((l) => l.item),
    clientInfo: draft.clientInfo,
    transportRoute: EMPTY_ROUTE,
    displayCurrency: 'EUR',
    eurPlnRate: env.settings.eurPlnRate,
  };
  return { ok: true, offerData, lines };
}
