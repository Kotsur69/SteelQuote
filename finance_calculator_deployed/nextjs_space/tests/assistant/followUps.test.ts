// Follow-up chips (docs/ai-assistant-plan.md 6.2, D24): built by the server from the query that
// ran, so every chip is a valid tool call - checked here against the tools' own schemas.

import { describe, expect, test, vi } from 'vitest';
import { buildFollowUps, MAX_CHIPS, type FollowUpCall } from '@/lib/assistant/followUps';
import { runMetricsQuery, type MetricsOk, type MetricsQuery } from '@/lib/assistant/metrics';
import { TOOLS } from '@/lib/assistant/tools';
import { SPEC_TODAY } from '../../scripts/assistant-demo/spec';
import { clientIdOf, demoDeps } from './demoRows';
import { queryOf } from './goldenCases';

// The tool registry loads lib/auth, which needs a secret at import time; a test value only.
vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'test-secret-for-follow-ups';
});

const ctx = { today: SPEC_TODAY, lang: 'pl' as const, scope: 'all' as const };

async function chipsFor(query: MetricsQuery, scope: 'all' | 'own' = 'all'): Promise<FollowUpCall[]> {
  const result = (await runMetricsQuery(query, demoDeps('admin'))) as MetricsOk;
  expect(result.status).toBe('ok');
  return buildFollowUps(query, result, { ...ctx, scope });
}

function expectValidCalls(chips: FollowUpCall[]) {
  for (const chip of chips) {
    const tool = TOOLS.find((t) => t.name === chip.tool)!;
    expect(tool.schema.safeParse(chip.input).success, `${chip.label}: ${JSON.stringify(chip.input)}`).toBe(true);
  }
}

const october = (metrics: string[], filters = {}) => queryOf({ metrics, period: '2026-10', basis: 'sent', filters });

describe('follow-up chips', () => {
  test('a closed month: compare with the named previous month first, at most three chips', async () => {
    const chips = await chipsFor(october(['offers_sent']));
    expect(chips.length).toBeLessThanOrEqual(MAX_CHIPS);
    expect(chips[0]).toMatchObject({ tool: 'query_metrics', label: 'Porównaj z: wrzesień 2026', input: { compare: 'previous_period' } });
    expectValidCalls(chips);
  });

  test('a running month gets the generic label (the click leads to the D12 question)', async () => {
    const chips = await chipsFor(queryOf({ metrics: ['offers_sent'], period: 'thisMonth', basis: 'sent', filters: {} }));
    expect(chips[0].label).toBe('Porównaj z poprzednim okresem');
  });

  test('own scope never offers a breakdown by salesperson', async () => {
    const chips = await chipsFor(october(['tons_offered']), 'own');
    expect(chips.map((c) => c.label)).not.toContain('Rozbij na handlowców');
    expectValidCalls(chips);
  });

  test('a lost figure offers the lost reasons first', async () => {
    const chips = await chipsFor(queryOf({ metrics: ['offers_lost'], period: '2026-10', basis: 'decided', filters: {} }));
    expect(chips[0]).toMatchObject({ label: 'Pokaż powody przegranej', input: { metrics: ['offers_lost', 'lost_reasons'] } });
    expectValidCalls(chips);
  });

  test('an empty result offers dropping each narrowing filter instead', async () => {
    const query = queryOf({ metrics: ['offers_sent'], period: '2020-01', basis: 'sent', filters: { clients: ['profilex'] } });
    const chips = await chipsFor(query);
    expect(chips).toEqual([
      { tool: 'query_metrics', input: { ...query, filters: {} }, label: 'Bez filtra: klient' },
    ]);
  });

  test('lost reasons from a comparison answer drop the comparison (one window only)', async () => {
    const query: MetricsQuery = { ...queryOf({ metrics: ['offers_lost'], period: '2026-10', basis: 'decided', filters: {} }), compare: 'previous_period' };
    const chips = await chipsFor(query);
    const reasons = chips.find((c) => c.label === 'Pokaż powody przegranej')!;
    expect(reasons.input).not.toHaveProperty('compare');
    expectValidCalls(chips);
    const rerun = await runMetricsQuery(reasons.input as MetricsQuery, demoDeps('admin'));
    expect(rerun.status).toBe('ok');
  });

  test('a comparison answer offers breakdowns, never a second comparison', async () => {
    const query: MetricsQuery = { ...october(['offers_sent']), compare: 'previous_period' };
    const chips = await chipsFor(query);
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) expect(chip.input).not.toHaveProperty('compare');
    expectValidCalls(chips);
  });

  test('"show these offers" lists the counted offers by the same window and basis', async () => {
    const query = october(['offers_sent'], { clients: ['profilex'] });
    const chips = await chipsFor(query);
    const show = chips.find((c) => c.tool === 'search_offers');
    expect(show?.input).toEqual({ clients: [clientIdOf('profilex')], period: { from: '2026-10-01', to: '2026-10-31' }, basis: 'sent' });
    expectValidCalls(chips);
  });
});
