import { describe, expect, test } from 'vitest';
import {
  FALLBACK_LOST_REASONS,
  activeLostReasons,
  cleanNote,
  sortLostReasons,
  lostReasonLabel,
  validateLostChoice,
  type LostReasonDef,
} from '@/lib/lostReasons';
import { findDuplicateLabel, nextSortOrder, parseReasonLabels, parseReorder } from '@/lib/lostReasonValidation';
import { computeLostReasons, type NormalizedOffer } from '@/lib/analyticsAggregate';

const def = (code: string, sortOrder: number, extra: Partial<LostReasonDef> = {}): LostReasonDef => ({
  code,
  sortOrder,
  labels: { pl: `${code} pl`, en: `${code} en`, cs: `${code} cs`, de: `${code} de` },
  archived: false,
  isSystem: code === 'other',
  ...extra,
});

const LIST: LostReasonDef[] = [
  def('other', 1000),
  def('price', 10),
  def('competitor_faster', 40),
  def('lead_time', 20, { archived: true }),
];

describe('validateLostChoice', () => {
  const active = new Set(['price', 'other']);

  test('requires a reason', () => {
    expect(validateLostChoice('', 'x', active)).toEqual({ ok: false, error: 'reason_required' });
    expect(validateLostChoice(undefined, null, active)).toEqual({ ok: false, error: 'reason_required' });
  });

  test('refuses an archived or unknown code', () => {
    expect(validateLostChoice('lead_time', '', active)).toEqual({ ok: false, error: 'reason_unknown' });
  });

  test("'other' needs a note, other reasons do not", () => {
    expect(validateLostChoice('other', '   ', active)).toEqual({ ok: false, error: 'note_required' });
    expect(validateLostChoice('other', ' too slow ', active)).toEqual({ ok: true, reason: 'other', note: 'too slow' });
    expect(validateLostChoice('price', '', active)).toEqual({ ok: true, reason: 'price', note: null });
  });

  test('caps the note at 500 characters', () => {
    const result = validateLostChoice('price', 'x'.repeat(600), active);
    expect(result.ok && result.note?.length).toBe(500);
  });

  test('a capped note never ends in whitespace', () => {
    expect(cleanNote(`${'x'.repeat(499)}  tail`)).toBe('x'.repeat(499));
    expect(cleanNote('   ')).toBeNull();
    expect(cleanNote(42)).toBeNull();
  });
});

describe('list helpers', () => {
  test('active reasons exclude archived ones, in admin order, catch-all last', () => {
    expect(activeLostReasons(LIST).map((r) => r.code)).toEqual(['price', 'competitor_faster', 'other']);
  });

  test('labels resolve per language; an unknown code shows itself', () => {
    expect(lostReasonLabel('price', LIST, 'de')).toBe('price de');
    expect(lostReasonLabel('price', LIST, 'fr')).toBe('price en');
    expect(lostReasonLabel('r42', LIST, 'pl')).toBe('r42');
  });

  test('fallback list mirrors migration 024 and keeps other as the system reason', () => {
    expect(FALLBACK_LOST_REASONS.map((r) => r.code)).toEqual([
      'price', 'lead_time', 'competitor', 'project_cancelled', 'no_response', 'payment_terms', 'other',
    ]);
    expect(FALLBACK_LOST_REASONS.filter((r) => r.isSystem).map((r) => r.code)).toEqual(['other']);
  });
});

describe('admin validation', () => {
  test('all four languages are required and trimmed', () => {
    expect(parseReasonLabels({ pl: 'Cena za wysoka', en: 'Price too high', cs: 'Cena', de: '  ' }))
      .toEqual({ ok: false, error: 'label_required', lang: 'de' });
    expect(parseReasonLabels({ pl: ' A ', en: 'B', cs: 'C', de: 'D' }))
      .toEqual({ ok: true, labels: { pl: 'A', en: 'B', cs: 'C', de: 'D' } });
    expect(parseReasonLabels({ pl: 'x'.repeat(81), en: 'B', cs: 'C', de: 'D' }))
      .toEqual({ ok: false, error: 'label_too_long', lang: 'pl' });
    expect(parseReasonLabels(null)).toMatchObject({ ok: false, error: 'label_required', lang: 'pl' });
  });

  test('duplicates are case-insensitive, include archived, skip the edited reason', () => {
    const labels = { pl: 'LEAD_TIME PL', en: 'new', cs: 'new', de: 'new' };
    expect(findDuplicateLabel(labels, LIST)).toBe('pl');
    expect(findDuplicateLabel(labels, LIST, 'lead_time')).toBeNull();
    expect(findDuplicateLabel({ pl: 'nowy', en: 'Price EN', cs: 'x', de: 'y' }, LIST)).toBe('en');
  });

  test('reorder must be a permutation; the catch-all is forced last', () => {
    expect(parseReorder(['other', 'competitor_faster', 'price', 'lead_time'], LIST))
      .toEqual(['competitor_faster', 'price', 'lead_time', 'other']);
    expect(parseReorder(['price', 'price', 'other', 'lead_time'], LIST)).toBeNull();
    expect(parseReorder(['price', 'other'], LIST)).toBeNull();
    expect(parseReorder(['price', 'other', 'lead_time', 'ghost'], LIST)).toBeNull();
    expect(parseReorder('price', LIST)).toBeNull();
  });

  test('labels with control or zero-width characters are refused', () => {
    const zeroWidth = String.fromCharCode(0x200b);
    expect(parseReasonLabels({ pl: `Cena${zeroWidth}`, en: 'B', cs: 'C', de: 'D' }))
      .toEqual({ ok: false, error: 'label_invalid', lang: 'pl' });
    expect(parseReasonLabels({ pl: 'A', en: `B${String.fromCharCode(7)}x`, cs: 'C', de: 'D' }))
      .toEqual({ ok: false, error: 'label_invalid', lang: 'en' });
  });

  test('other stays last after a reorder followed by an add (sort_order tie)', () => {
    // PUT writes 10, 20, 30 ... so 'other' ends up at 40 here; a new reason also gets 40.
    const reordered = [def('price', 10), def('competitor_faster', 20), def('lead_time', 30), def('other', 40)];
    const added = def('r9', nextSortOrder(reordered));
    expect(added.sortOrder).toBe(40);
    expect(sortLostReasons([...reordered, added]).map((r) => r.code))
      .toEqual(['price', 'competitor_faster', 'lead_time', 'r9', 'other']);
  });

  test('a new reason goes after the last regular one, before other', () => {
    expect(nextSortOrder(LIST)).toBe(50);
    expect(nextSortOrder([def('other', 1000)])).toBe(10);
  });
});

describe('computeLostReasons', () => {
  const lost = (id: number, reason: string, tons: number, eur: number, pln: number) =>
    ({ id, decision: 'lost', lostReason: reason, tons, valueEur: eur, valuePln: pln }) as NormalizedOffer;

  // Worked example: 4 lost offers.
  //   price:                2 offers, 10 + 5 t, 8 000 + 4 000 EUR -> 50.0 %
  //   lead_time (archived): 1 offer, 3 t, 2 500 EUR               -> 25.0 %
  //   r9 (unknown code):    1 offer, 1.5 t, 1 000 EUR             -> 25.0 %
  // A won offer is ignored.
  const offers = [
    lost(1, 'price', 10, 8000, 34400),
    lost(2, 'price', 5, 4000, 17200),
    lost(3, 'lead_time', 3, 2500, 10750),
    lost(4, 'r9', 1.5, 1000, 4300),
    { id: 5, decision: 'won', lostReason: null, tons: 99, valueEur: 1, valuePln: 1 } as NormalizedOffer,
  ];

  test('groups in admin order, keeps archived reasons and unknown codes, shares sum to 100', () => {
    const stats = computeLostReasons(offers, LIST);
    expect(stats.map((s) => s.reason)).toEqual(['price', 'lead_time', 'r9']);
    expect(stats[0]).toMatchObject({ offers: 2, tonsLost: 15, valueLostEur: 12000, valueLostPln: 51600, sharePct: 50 });
    expect(stats[1]).toMatchObject({ reason: 'lead_time', archived: true, sharePct: 25, labels: { pl: 'lead_time pl' } });
    expect(stats[2]).toMatchObject({ reason: 'r9', labels: { pl: 'r9', en: 'r9' }, sharePct: 25 });
    expect(stats.reduce((sum, s) => sum + s.sharePct, 0)).toBe(100);
  });

  test('reasons nobody picked are left out', () => {
    expect(computeLostReasons(offers, LIST).some((s) => s.reason === 'competitor_faster')).toBe(false);
    expect(computeLostReasons([], LIST)).toEqual([]);
  });
});
