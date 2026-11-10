// Polish name matching (docs/ai-assistant-plan.md 12.4): declined names and missing diacritics
// must find the right person / client; ambiguous names must return every candidate.

import { describe, expect, test } from 'vitest';
import { bestMatches, foldDiacritics, matchNames } from '@/lib/assistant/polish';
import { CLIENTS, PEOPLE } from '../../scripts/assistant-demo/spec';

const people = (query: string) => bestMatches(matchNames(query, PEOPLE, (p) => p.fullName)).map((m) => m.item.key);
const clients = (query: string) => bestMatches(matchNames(query, CLIENTS, (c) => c.company, true)).map((m) => m.item.key);

describe('people', () => {
  test.each([
    ['Marek Nowak', ['marekN']],
    ['Marka Nowaka', ['marekN']],
    ['Markowi Nowakowi', ['marekN']],
    ['Anny Kowalskiej', ['anna']],
    ['Anną Kowalską', ['anna']],
    ['Kowalskiej', ['anna']],
    ['Marka Wiśniewskiego', ['marekW']],
    ['lukasz zak', ['lukasz']],
    ['Łukasza Żaka', ['lukasz']],
    ['Katarzyna Wąsik', ['kasia']],
    ['katarzyny wasik', ['kasia']],
    ['Zielińskiego', ['piotr']],
    ['Nowak Marek', ['marekN']],
  ])('%s', (query, expected) => {
    expect(people(query)).toEqual(expected);
  });

  test('an ambiguous first name returns both candidates', () => {
    expect(people('Marek').sort()).toEqual(['marekN', 'marekW']);
    expect(people('Marka').sort()).toEqual(['marekN', 'marekW']);
    expect(people('marek').sort()).toEqual(['marekN', 'marekW']);
  });

  test('an unknown name returns nothing', () => {
    expect(people('Tomasz')).toEqual([]);
    expect(people('Marek Kowalski')).toEqual([]);
  });
});

describe('clients', () => {
  test.each([
    ['Profilex', ['profilex']],
    ['Profilexu', ['profilex']],
    ['Żurawca', ['zurawiec']],
    ['zurawiec konstrukcje', ['zurawiec']],
    ['Kęty-Blach', ['kety']],
    ['slezy stal', ['sleza']],
    ['Odlewni Śląskiej', ['odlewnia']],
    ['Wąsik Metal', ['wasikMetal']],
    ['Wąsik', ['wasikMetal']],
    ['Marek-Stal', ['marekStal']],
    ['lodz', ['profilex']],
    ['Stal-Bud', ['stalbud']],
  ])('%s', (query, expected) => {
    expect(clients(query)).toEqual(expected);
  });

  test('legal forms alone do not match every company', () => {
    expect(clients('Nieznana Firma Sp. z o.o.')).toEqual([]);
  });
});

test('diacritics fold to plain letters', () => {
  expect(foldDiacritics('Łódź Żółć Ślęża')).toBe('lodz zolc sleza');
});
