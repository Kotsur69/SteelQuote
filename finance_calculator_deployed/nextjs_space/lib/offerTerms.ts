// Offer-level sales terms (OWS block of the offer PDF) derived from the items: the certificate,
// SSC packaging and delivery term that MOST items share go into the terms once, and only the
// items that differ repeat them in their "Uwagi" (lib/itemNotes.ts). Only option indexes and
// the incoterm travel to /api/generate-pdf - the server renders the localized text itself.
import {
  CERT_OPTIONS,
  DEFAULT_DELIVERY_INCOTERM,
  SSC_PACKING_OPTIONS,
  editableIncoterm,
  effectiveIncoterm,
  isDeliveredIncoterm,
  isIncoterm,
  type Incoterm,
  type ItemInputs,
  type SteelType,
} from './calculatorData';
import { OPTION_GROUP_SPECS, resolveOptionIdx } from './priceBook';
import { defaultOptionSelection } from './optionSelection';
import type { Translations } from './translations';

const MAX_ADDRESS_LENGTH = 300;

/** The offer's saved transport route (offer_data.transportRoute), as far as terms and notes need it. */
export interface DeliveryRoute {
  destAddress?: string;
  selfPickup?: boolean;
}

/** One item's term values. Undefined = not stored on the item (offers saved before the field). */
export interface ItemTermKeys {
  cert?: number;
  packing?: number;
  incoterm?: Incoterm;
}

/** Offer-level term values sent to the PDF endpoint. Undefined = the line is left out. */
export interface OfferTermKeys extends ItemTermKeys {
  destAddress?: string;
}

interface TermItem {
  type?: string;
  inputs?: ItemInputs;
}

/** Items saved without a type were always priced as HRS (same fallback as the notes). */
export function asSteelType(type: string | undefined): SteelType {
  return (type as SteelType | undefined) ?? 'HRS';
}

function optionIdx(type: SteelType, inputs: ItemInputs, group: 'cert' | 'sscPacking'): number | undefined {
  const spec = OPTION_GROUP_SPECS[group];
  return resolveOptionIdx(type, group, inputs[spec.idxField], inputs[spec.valueField]) ?? undefined;
}

/** Term values of one item. Offer-wide self pickup makes every item FCA (FCA Kraków stays). */
export function itemTermKeys(type: SteelType, inputs: ItemInputs | undefined, route?: DeliveryRoute): ItemTermKeys {
  if (!inputs) return {};
  const term = effectiveIncoterm(inputs.incoterm, route?.selfPickup === true);
  return {
    cert: optionIdx(type, inputs, 'cert'),
    packing: optionIdx(type, inputs, 'sscPacking'),
    incoterm: isIncoterm(term) ? term : undefined,
  };
}

/**
 * The offer-wide self pickup switch no longer exists in the calculator, but offers saved with it
 * still carry the flag (their PDFs keep reading it through itemTermKeys). Opening one in the form
 * moves the flag onto the items: each becomes FCA (FCA Kraków stays) with transport 0, so the tick
 * boxes work per item again. Items without an inputs snapshot have no term to set and stay as saved.
 */
export function withoutOfferSelfPickup<T extends Record<string, unknown>>(data: T): T {
  const route = data.transportRoute as DeliveryRoute | null | undefined;
  if (route?.selfPickup !== true) return data;
  const items = data.zestawienie as SelfPickupItem[] | undefined;
  return {
    ...data,
    incoterm: effectiveIncoterm(editableIncoterm(data.incoterm), true),
    transport: 0,
    transportRoute: { ...route, selfPickup: false },
    ...(Array.isArray(items) ? { zestawienie: items.map(toPickupItem) } : {}),
  };
}

interface SelfPickupItem {
  tons: number;
  finalPrice: number;
  totalValue: number;
  inputs?: ItemInputs;
}

function toPickupItem(item: SelfPickupItem): SelfPickupItem {
  if (!item.inputs) return item;
  const finalPrice = item.finalPrice - item.inputs.transport;
  return {
    ...item,
    finalPrice,
    totalValue: Math.round(finalPrice * item.tons * 100) / 100,
    inputs: { ...item.inputs, transport: 0, incoterm: effectiveIncoterm(item.inputs.incoterm, true) ?? undefined },
  };
}

/**
 * The value most items share. On a tie the fallback wins when it is one of the tied values,
 * otherwise the tied value that appears first. Undefined values are ignored; undefined when
 * no item has a value at all.
 */
export function dominantValue<T>(values: readonly (T | undefined)[], fallback: T): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) {
    if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  const max = Math.max(...counts.values());
  const tied = [...counts.keys()].filter((value) => counts.get(value) === max);
  if (tied.length === 1) return tied[0];
  return tied.includes(fallback) ? fallback : tied[0];
}

/** Offer-level terms: the dominant certificate, SSC packaging and delivery term of the items. */
export function offerTermKeys(items: readonly TermItem[], route?: DeliveryRoute): OfferTermKeys {
  const keys = items.map((item) => itemTermKeys(asSteelType(item.type), item.inputs, route));
  // The certificate default depends on the steel type (2.2 for CR/ZM, 3.1 otherwise) - an
  // offer takes the default of its first item.
  const certFallback = defaultOptionSelection(asSteelType(items[0]?.type)).cert;
  const packingFallback = defaultOptionSelection('HRS').sscPacking;
  const incoterm = dominantValue<Incoterm>(keys.map((k) => k.incoterm), DEFAULT_DELIVERY_INCOTERM);
  const destAddress = route?.destAddress?.trim();
  return {
    cert: dominantValue(keys.map((k) => k.cert), certFallback),
    packing: dominantValue(keys.map((k) => k.packing), packingFallback),
    incoterm,
    // Only a delivered term names the address; with FCA the client collects.
    destAddress: isDeliveredIncoterm(incoterm) && destAddress ? destAddress : undefined,
  };
}

/**
 * SSC packaging as printed for the client: the description from the UI hover text
 * (S01 -> "Kantówki" / "Wooden battens"), never the internal code.
 */
export function packagingDescription(t: Translations, packingIdx: number): string | undefined {
  const code = SSC_PACKING_OPTIONS[packingIdx]?.label;
  if (!code) return undefined;
  const descriptions: Readonly<Record<string, string>> = t.ssc.packagingDesc;
  return descriptions[code] ?? code;
}

/**
 * Certificate as printed for the client: "3.1 EN 10204". The one shared cert -> text mapping;
 * the Excel export still has its own copy until its new format lands (lib/excelExport.ts).
 */
export function certificateText(certIdx: number): string | undefined {
  const option = CERT_OPTIONS[certIdx];
  return option ? `${option.label} EN 10204` : undefined;
}

/** Validates offer terms from a request body: indexes in range, known incoterm, bounded address. */
export function sanitizeOfferTermKeys(value: unknown): OfferTermKeys {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const index = (v: unknown, length: number): number | undefined =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < length ? v : undefined;
  const address = typeof raw.destAddress === 'string' ? raw.destAddress.trim().slice(0, MAX_ADDRESS_LENGTH) : '';
  return {
    cert: index(raw.cert, CERT_OPTIONS.length),
    packing: index(raw.packing, SSC_PACKING_OPTIONS.length),
    incoterm: isIncoterm(raw.incoterm) ? raw.incoterm : undefined,
    destAddress: address || undefined,
  };
}
