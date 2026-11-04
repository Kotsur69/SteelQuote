import { describe, expect, test } from 'vitest';
import {
  certificateText,
  dominantValue,
  offerTermKeys,
  packagingDescription,
  sanitizeOfferTermKeys,
} from '@/lib/offerTerms';
import { attachNotesToZestawienie } from '@/lib/itemNotes';
import type { Incoterm, ItemInputs } from '@/lib/calculatorData';
import { en, pl } from '@/lib/translations';

const CERT_22 = 0;
const CERT_31 = 1;
const CERT_32 = 2;
const S01 = 0;
const S03 = 1;

const item = (certIdx: number, sscPackingIdx = S01, incoterm: Incoterm = 'DAP') => ({
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

  test('delivery: dominant DAP with the address in terms, only the FCA item lists its term', () => {
    const items = [item(CERT_31), item(CERT_31, S01, 'FCA'), item(CERT_31)];
    expect(offerTermKeys(items, route)).toMatchObject({ incoterm: 'DAP', destAddress: 'Warszawa, ul. Prosta 1' });
    const notes = notesOf(items);
    expect(notes[1][0]).toBe('Dostawa: FCA');
    expect(notes[0].some((n) => n.startsWith('Dostawa:'))).toBe(false);
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

describe('sanitizeOfferTermKeys', () => {
  test('keeps valid values, drops out-of-range indexes and unknown terms', () => {
    expect(sanitizeOfferTermKeys({ cert: 2, packing: 5, incoterm: 'CPT', destAddress: '  Kraków ' }))
      .toEqual({ cert: 2, packing: 5, incoterm: 'CPT', destAddress: 'Kraków' });
    expect(sanitizeOfferTermKeys({ cert: 3, packing: -1, incoterm: 'EXW', destAddress: '   ' }))
      .toEqual({ cert: undefined, packing: undefined, incoterm: undefined, destAddress: undefined });
    expect(sanitizeOfferTermKeys('nope')).toEqual({});
  });
});
