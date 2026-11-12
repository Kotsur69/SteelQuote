// The /analytics URL schema (docs/ai-assistant-plan.md 6.1, D23): a state survives the round
// trip through the URL unchanged, defaults stay out of the URL, and a broken link degrades field
// by field instead of failing.

import { describe, expect, test } from 'vitest';
import { DEFAULT_URL_STATE, parseUrlState, toApiQuery, toSearch, type AnalyticsUrlState } from '@/lib/analyticsUrlState';

const FULL: AnalyticsUrlState = {
  preset: 'custom',
  from: '2026-10-01',
  to: '2026-10-31',
  basis: 'decided',
  granularity: 'week',
  split: 'decision',
  users: ['3', '7'],
  types: ['HRS', 'CR'],
  statuses: ['sent'],
  decisions: ['lost'],
  clients: ['12'],
  measure: 'value',
  timeKind: 'line',
  breakdown: 'client',
  breakdownKind: 'table',
  role: 'N0',
  focus: 'lostReasons',
};

const parse = (search: string) => parseUrlState(new URLSearchParams(search));

describe('analytics URL state', () => {
  test('a full state survives the round trip', () => {
    expect(parse(toSearch(FULL))).toEqual(FULL);
  });

  test('the default state is an empty URL, and an empty URL is the default state', () => {
    expect(toSearch(DEFAULT_URL_STATE)).toBe('');
    expect(parse('')).toEqual(DEFAULT_URL_STATE);
  });

  test('every bad value falls back to its own default, the rest of the link still applies', () => {
    const state = parse('preset=nope&basis=sent&granularity=century&users=3,abc,-1&types=XYZ,HRS&measure=weight&chart=pie3d&focus=footer&role=%3Cscript%3E');
    expect(state).toEqual({
      ...DEFAULT_URL_STATE,
      basis: 'sent',
      users: ['3'],
      types: ['HRS'],
    });
  });

  test('from / to are read only with the custom preset, and only as ISO dates', () => {
    expect(parse('preset=last30&from=2026-01-01&to=2026-01-31')).toMatchObject({ preset: 'last30', from: '', to: '' });
    expect(parse('preset=custom&from=2026-13-45&to=2026-10-31')).toMatchObject({ preset: 'custom', from: '', to: '2026-10-31' });
  });

  test('the API query carries filters only, never view settings', () => {
    const api = new URLSearchParams(toApiQuery(FULL));
    expect(Object.fromEntries(api)).toEqual({
      preset: 'custom', from: '2026-10-01', to: '2026-10-31', basis: 'decided', granularity: 'week', split: 'decision',
      users: '3,7', types: 'HRS,CR', statuses: 'sent', decisions: 'lost', clients: '12',
    });
  });
});
