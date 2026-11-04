import { describe, expect, test } from 'vitest';
import { buildItemNotes } from '@/lib/itemNotes';
import type { ItemInputs } from '@/lib/calculatorData';
import { en, pl } from '@/lib/translations';

// Only the delivery line is under test; a bare snapshot keeps the surcharge lines out of the way.
const inputs = (extra: Partial<ItemInputs>): ItemInputs =>
  ({ marginPct: 7, extra: 0, transport: 0, ...extra }) as ItemInputs;
const route = { destAddress: ' Warszawa, ul. Prosta 1 ', selfPickup: false };

describe('buildItemNotes - delivery terms', () => {
  test('CPT names the delivery address, first in the list', () => {
    const notes = buildItemNotes('HRS', inputs({ incoterm: 'CPT' }), pl, 'pl', route);
    expect(notes[0]).toBe('Dostawa: CPT Warszawa, ul. Prosta 1');
  });

  test('CPT without an address prints the term alone', () => {
    const notes = buildItemNotes('HRS', inputs({ incoterm: 'CPT' }), en, 'en', { destAddress: '' });
    expect(notes[0]).toBe('Delivery: CPT');
  });

  test('an item saved as DAP still prints its term and the address', () => {
    const notes = buildItemNotes('HRS', inputs({ incoterm: 'DAP' }), pl, 'pl', route);
    expect(notes[0]).toBe('Dostawa: DAP Warszawa, ul. Prosta 1');
  });

  test('FCA never prints the delivery address', () => {
    expect(buildItemNotes('HRS', inputs({ incoterm: 'FCA' }), pl, 'pl', route)[0]).toBe('Dostawa: FCA');
  });

  test('FCA Kraków prints its place and never the delivery address', () => {
    expect(buildItemNotes('HRS', inputs({ incoterm: 'FCA_KRAKOW' }), pl, 'pl', route)[0]).toBe('Dostawa: FCA Kraków');
  });

  test('offer-wide self pickup prints FCA even on an item stored as CPT', () => {
    const notes = buildItemNotes('HRS', inputs({ incoterm: 'CPT' }), pl, 'pl', { ...route, selfPickup: true });
    expect(notes[0]).toBe('Dostawa: FCA');
  });

  test('offer-wide self pickup keeps FCA Kraków', () => {
    const notes = buildItemNotes('HRS', inputs({ incoterm: 'FCA_KRAKOW' }), pl, 'pl', { ...route, selfPickup: true });
    expect(notes[0]).toBe('Dostawa: FCA Kraków');
  });

  test('items saved before the field get no delivery line', () => {
    const notes = buildItemNotes('HRS', inputs({}), pl, 'pl', route);
    expect(notes.some((n) => n.startsWith('Dostawa:'))).toBe(false);
  });

  test('an unknown stored term is ignored, not printed', () => {
    const notes = buildItemNotes('HRS', inputs({ incoterm: 'EXW' as never }), pl, 'pl', route);
    expect(notes.some((n) => n.startsWith('Dostawa:'))).toBe(false);
  });
});
