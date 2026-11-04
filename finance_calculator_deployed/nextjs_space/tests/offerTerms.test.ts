import { describe, expect, test } from 'vitest';
import {
  certificateText,
  dominantValue,
  offerTermKeys,
  packagingDescription,
  sanitizeOfferTermKeys,
  withoutOfferSelfPickup,
} from '@/lib/offerTerms';
import { attachNotesToZestawienie } from '@/lib/itemNotes';
import { editableIncoterm, type Incoterm, type ItemInputs } from '@/lib/calculatorData';
import { PDF_LABELS } from '@/lib/pdfLabels';
import { en, pl } from '@/lib/translations';

const CERT_22 = 0;
const CERT_31 = 1;
const CERT_32 = 2;
const S01 = 0;
const S03 = 1;

const item = (certIdx: number, sscPackingIdx = S01, incoterm: Incoterm = 'CPT') => ({
  type: 'HRS',
  inputs: { marginPct: 7, extra: 0, transport: 0, certIdx, sscPackingIdx, incoterm } as unknown as ItemInputs,
});
const route = { destAddress: 'Warszawa, ul. Prosta 1', selfPickup: false };
const certLine = (cert: string) => `${pl.huta.certificate}: ${cert}`;
const packingLine = (description: string) => `${pl.ssc.packaging}: ${description}`;
const notesOf = (items: ReturnType<typeof item>[]) => attachNotesToZestawienie(items, pl, 'pl', route).map((i) => i.notes);

describe('dominantValue', () => {
  test('the value most items share wins', () => {
    expect(dominantValue([1, 1, 1, 1, 2], 0)).toBe(1);
  });

  test('a tie takes the fallback when it is one of the tied values', () => {
    expect(dominantValue([2, 1, 2, 1], 1)).toBe(1);
  });

  test('a tie without the fallback takes the first tied value', () => {
    expect(dominantValue([2, 0, 0, 2], 1)).toBe(2);
  });

  test('undefined values are ignored; none at all gives undefined', () => {
    expect(dominantValue([undefined, 2, undefined], 1)).toBe(2);
    expect(dominantValue([undefined, undefined], 1)).toBeUndefined();
  });
});

describe('offer terms + exceptions in Uwagi', () => {
  test('all items 3.1: terms say 3.1, no item repeats the certificate', () => {
    const items = [item(CERT_31), item(CERT_31), item(CERT_31)];
    expect(offerTermKeys(items, route).cert).toBe(CERT_31);
    expect(notesOf(items).flat().some((n) => n.startsWith(`${pl.huta.certificate}:`))).toBe(false);
  });

  test('3.1 x4 + 3.2 x1: terms say 3.1, only the 3.2 item lists it', () => {
    const items = [item(CERT_31), item(CERT_31), item(CERT_32), item(CERT_31), item(CERT_31)];
    expect(offerTermKeys(items, route).cert).toBe(CERT_31);
    const notes = notesOf(items);
    expect(notes[2]).toContain(certLine('3.2'));
    [0, 1, 3, 4].forEach((i) => expect(notes[i].some((n) => n.startsWith(`${pl.huta.certificate}:`))).toBe(false));
  });

  test('certificate tie takes the default of the first item type (3.1 for HRS)', () => {
    const items = [item(CERT_22), item(CERT_31)];
    expect(offerTermKeys(items, route).cert).toBe(CERT_31);
    expect(notesOf(items)[0]).toContain(certLine('2.2'));
  });

  test('S01 everywhere: no packaging line; one S03 item lists only itself', () => {
    expect(notesOf([item(CERT_31), item(CERT_31)]).flat().some((n) => n.startsWith(`${pl.ssc.packaging}:`))).toBe(false);
    const items = [item(CERT_31), item(CERT_31, S03), item(CERT_31)];
    expect(offerTermKeys(items, route).packing).toBe(S01);
    const notes = notesOf(items);
    expect(notes[1]).toContain(packingLine(pl.ssc.packagingDesc.S03));
    expect(notes.flat().some((n) => n.includes('S03'))).toBe(false);
    expect(notes[0].some((n) => n.startsWith(`${pl.ssc.packaging}:`))).toBe(false);
  });

  test('delivery: dominant CPT with the address in terms, only the FCA item lists its term', () => {
    const items = [item(CERT_31), item(CERT_31, S01, 'FCA'), item(CERT_31)];
    expect(offerTermKeys(items, route)).toMatchObject({ incoterm: 'CPT', destAddress: 'Warszawa, ul. Prosta 1' });
    const notes = notesOf(items);
    expect(notes[1][0]).toBe('Dostawa: FCA');
    expect(notes[0].some((n) => n.startsWith('Dostawa:'))).toBe(false);
  });

  test('delivery: dominant FCA Kraków prints no address in terms', () => {
    const items = [item(CERT_31, S01, 'FCA_KRAKOW'), item(CERT_31, S01, 'FCA_KRAKOW'), item(CERT_31)];
    expect(offerTermKeys(items, route)).toMatchObject({ incoterm: 'FCA_KRAKOW', destAddress: undefined });
  });

  test('offer-wide self pickup: FCA without an address, no delivery notes', () => {
    const items = [item(CERT_31), item(CERT_31)];
    const pickup = { ...route, selfPickup: true };
    expect(offerTermKeys(items, pickup)).toMatchObject({ incoterm: 'FCA', destAddress: undefined });
    const notes = attachNotesToZestawienie(items, pl, 'pl', pickup).map((i) => i.notes);
    expect(notes.flat().some((n) => n.startsWith('Dostawa:'))).toBe(false);
  });

  test('items saved without inputs give no terms', () => {
    expect(offerTermKeys([{ type: 'HRS' }], route)).toEqual({
      cert: undefined, packing: undefined, incoterm: undefined, destAddress: undefined,
    });
  });
});

describe('client-facing texts', () => {
  test('packaging prints the description in the PDF language, not the code', () => {
    expect(packagingDescription(en, S01)).toBe('Wooden battens');
    expect(packagingDescription(pl, S01)).toBe('Kantówki');
    expect(packagingDescription(pl, 99)).toBeUndefined();
  });

  test('certificate prints with its standard', () => {
    expect(certificateText(CERT_31)).toBe('3.1 EN 10204');
    expect(certificateText(CERT_32)).toBe('3.2 EN 10204');
    expect(certificateText(9)).toBeUndefined();
  });
});

describe('withoutOfferSelfPickup', () => {
  const saved = (selfPickup: boolean, incoterm?: Incoterm) => ({
    transport: 20,
    incoterm: 'CPT',
    transportRoute: { destAddress: 'Warszawa', selfPickup },
    zestawienie: [{ tons: 2, finalPrice: 814.37, totalValue: 1628.74, inputs: { transport: 20, incoterm } as ItemInputs }],
  });

  test('an offer without the flag comes back untouched', () => {
    const data = saved(false, 'CPT');
    expect(withoutOfferSelfPickup(data)).toBe(data);
  });

  // 814.37 €/t with transport 20 -> 794.37 €/t; 794.37 × 2 t = 1588.74 €.
  test('moves the flag onto the items: FCA with transport 0 and the price without it', () => {
    const result = withoutOfferSelfPickup(saved(true, 'CPT'));
    const [migrated] = result.zestawienie;
    expect(result).toMatchObject({ incoterm: 'FCA', transport: 0, transportRoute: { selfPickup: false, destAddress: 'Warszawa' } });
    expect(migrated.inputs).toMatchObject({ incoterm: 'FCA', transport: 0 });
    expect(migrated.finalPrice).toBeCloseTo(794.37, 2);
    expect(migrated.totalValue).toBe(1588.74);
  });

  test('a legacy item with no term becomes FCA, FCA Kraków stays', () => {
    expect(withoutOfferSelfPickup(saved(true)).zestawienie[0].inputs?.incoterm).toBe('FCA');
    expect(withoutOfferSelfPickup(saved(true, 'FCA_KRAKOW')).zestawienie[0].inputs?.incoterm).toBe('FCA_KRAKOW');
  });

  test('an item without an inputs snapshot stays as saved', () => {
    const legacy = { tons: 1, finalPrice: 800, totalValue: 800 };
    const data = { transportRoute: { selfPickup: true }, zestawienie: [legacy] };
    expect(withoutOfferSelfPickup(data).zestawienie[0]).toEqual(legacy);
  });
});

describe('PDF delivery terms line', () => {
  test('CPT names the address with no "with delivery" wording', () => {
    expect(PDF_LABELS.pl.deliveryTermsNote('CPT', 'Warszawa')).toBe('Warunki dostawy: CPT, Warszawa');
    expect(PDF_LABELS.en.deliveryTermsNote('CPT', '')).toBe('Delivery terms: CPT');
  });

  test('FCA and FCA Kraków print the collection note', () => {
    expect(PDF_LABELS.pl.deliveryTermsNote('FCA', '')).toBe('Warunki dostawy: FCA (odbiór własny)');
    expect(PDF_LABELS.pl.deliveryTermsNote('FCA_KRAKOW', '')).toBe('Warunki dostawy: FCA Kraków (odbiór własny)');
    expect(PDF_LABELS.de.deliveryTermsNote('FCA_KRAKOW', '')).toBe('Lieferbedingungen: FCA Kraków (Selbstabholung)');
  });
});

describe('editableIncoterm', () => {
  test('a saved DAP opens as CPT, the others as they are, unknown as none', () => {
    expect(editableIncoterm('DAP')).toBe('CPT');
    expect(editableIncoterm('FCA_KRAKOW')).toBe('FCA_KRAKOW');
    expect(editableIncoterm('EXW')).toBeNull();
    expect(editableIncoterm(undefined)).toBeNull();
  });
});

describe('sanitizeOfferTermKeys', () => {
  test('keeps valid values, drops out-of-range indexes and unknown terms', () => {
    expect(sanitizeOfferTermKeys({ cert: 2, packing: 5, incoterm: 'CPT', destAddress: '  Kraków ' }))
      .toEqual({ cert: 2, packing: 5, incoterm: 'CPT', destAddress: 'Kraków' });
    expect(sanitizeOfferTermKeys({ cert: 3, packing: -1, incoterm: 'EXW', destAddress: '   ' }))
      .toEqual({ cert: undefined, packing: undefined, incoterm: undefined, destAddress: undefined });
    expect(sanitizeOfferTermKeys('nope')).toEqual({});
  });
});
