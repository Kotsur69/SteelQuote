// Builds offer_data exactly as the calculator stores it, priced with the real engine.
// Shared by the seed writer (seed.ts) and the golden-set oracle (oracle.ts), so both see the
// same item values without the oracle touching the database or the analytics engine.

import { DEFAULT_SETTINGS } from '@/lib/currency';
import { DEFAULT_PRICE_BOOK, findGrade } from '@/lib/priceBook';
import { computeItemPricing, smallQuantitySurcharge } from '@/lib/pricingEngine';
import type { ItemInputs } from '@/lib/calculatorData';
import { CLIENTS, PGL, type ItemSpec, type OfferSpec, type VersionSpec } from './spec';


// Option toggles exactly as the calculator saves them for a plain item (taken from a real
// saved offer); only the fields an item varies on are set in buildItem.
const BASE_INPUTS = {
  cert: 5, extra: 0, transport: 20,
  tolThick: 0, tolThickIdx: 0,
  crOpak: 5, crOpakIdx: 1, crWykon: 0, crWykonIdx: 0, crZabezp: 0, crZgrzew: -3, crPowierz: 0,
  hdgOpak: 5, hdgOpakIdx: 1, hdgWykon: 0, hdgZabezp: 0, hdgZabezpIdx: 3, hdgZgrzew: -3, hdgPowierz: 0,
  zmOpak: 5, zmOpakIdx: 1, zmZabezp: 0, zmZabezpIdx: 2, zmZgrzew: -3, zmPowierz: 0,
  sscEdging: 0, sscLabels: 0, sscLenTol: 0, sscMarking: 0, sscPacking: 0, sscPackingIdx: 0,
  sscSurface: 10, sscFlatness: 0, sscMaxWeight: 0,
  incoterm: 'CPT',
} as const;

const COATING: Partial<Record<ItemSpec['type'], string>> = { HDG: 'Z275', ZM: 'ZM120' };

export function quarterOf(local: string): { key: string; from: string; to: string } {
  const year = Number(local.slice(0, 4));
  const q = Math.floor((Number(local.slice(5, 7)) - 1) / 3) + 1;
  const startMonth = (q - 1) * 3 + 1;
  const end = new Date(Date.UTC(year, startMonth + 2, 0)).toISOString().slice(0, 10);
  return { key: `${year}-Q${q}`, from: `${year}-${String(startMonth).padStart(2, '0')}-01`, to: end };
}

export function buildItem(spec: ItemSpec, pgl: number, itemId: number): Record<string, unknown> {
  const grade = findGrade(DEFAULT_PRICE_BOOK, spec.type, spec.grade);
  if (!grade) throw new Error(`Unknown grade ${spec.grade} for ${spec.type}`);
  const inputs = {
    ...BASE_INPUTS,
    selectedGrade: { name: grade.name, value: grade.surcharge },
    selectedCoating: COATING[spec.type] ?? '',
    marginPct: spec.marginPct,
    smallQtySurcharge: smallQuantitySurcharge(DEFAULT_PRICE_BOOK, spec.type, spec.tons),
  } as unknown as ItemInputs;
  const isCoil = spec.length === 0;
  const priced = computeItemPricing(
    { type: spec.type, thickness: spec.thickness, width: spec.width, length: spec.length, grade: spec.grade, tons: spec.tons, isCoil, inputs },
    pgl, DEFAULT_SETTINGS, DEFAULT_PRICE_BOOK
  );
  if (!priced) throw new Error('computeItemPricing returned null');
  const item: Record<string, unknown> = {
    id: itemId,
    type: spec.type, grade: spec.grade, thickness: spec.thickness, width: spec.width,
    length: spec.length, isCoil, tons: spec.tons, ...priced,
  };
  // Legacy items were saved before ItemInputs existed: no inputs, so no recorded margin.
  if (!spec.legacy) item.inputs = inputs;
  return item;
}

export function buildOfferData(offer: OfferSpec, version: VersionSpec, stamp: number): Record<string, unknown> {
  const client = CLIENTS.find((c) => c.key === offer.client);
  if (!client) throw new Error(`${offer.key}: unknown client ${offer.client}`);
  const quarter = quarterOf(version.createdAt);
  const pglTable = PGL[quarter.key];
  if (!pglTable) throw new Error(`No PGL for ${quarter.key}`);
  return {
    clientInfo: {
      company: client.company, nip: client.nip, sapId: client.sapId, address: client.address,
      firstName: client.firstName, lastName: client.lastName, email: '', phone: '',
    },
    currentType: version.items[0].type,
    validFrom: quarter.from,
    validTo: quarter.to,
    eurPlnRate: offer.eurPlnRate,
    displayCurrency: 'EUR',
    paymentTermDays: offer.paymentTermDays,
    quoteValidityHours: offer.quoteValidityHours,
    zestawienie: version.items.map((it, i) => buildItem(it, pglTable[it.type], stamp + i)),
  };
}

