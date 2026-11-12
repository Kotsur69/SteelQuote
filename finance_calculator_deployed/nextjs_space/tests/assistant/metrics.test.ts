// The metric catalog against the golden set (docs/ai-assistant-plan.md 12.1): every aggregate
// and ranking case of tests/assistant/golden.json, whose expected numbers come from the
// independent oracle, must come out of runMetricsQuery - i.e. out of the analytics engine.

import { describe, expect, test } from 'vitest';
import { cases, periodOf, queryOf } from './goldenCases';
import { METRIC_IDS, metricsQuerySchema, runMetricsQuery, type MetricId, type MetricsOk } from '@/lib/assistant/metrics';
import { clientKeyOf, demoDeps, userIdOf } from './demoRows';
import { PEOPLE } from '../../scripts/assistant-demo/spec';

// Golden number key -> where runMetricsQuery reports it.
const KEY_TO_METRIC: Record<string, { metric: MetricId; pln?: boolean }> = {
  won: { metric: 'offers_won' }, lost: { metric: 'offers_lost' }, tons: { metric: 'tons_offered' },
  tonsWon: { metric: 'tons_won' }, tonsLost: { metric: 'tons_lost' },
  valueEur: { metric: 'value_offered' }, valuePln: { metric: 'value_offered', pln: true },
  valueWonEur: { metric: 'value_won' }, valueWonPln: { metric: 'value_won', pln: true },
  valueLostEur: { metric: 'value_lost' }, valueLostPln: { metric: 'value_lost', pln: true },
  clients: { metric: 'clients_offered' }, winRateOffers: { metric: 'win_rate_offers' },
  winRateTons: { metric: 'win_rate_tons' }, marginWeighted: { metric: 'margin_weighted' },
  marginSimple: { metric: 'margin_simple' }, avgTons: { metric: 'avg_tons_per_offer' },
};

function actual(result: MetricsOk, key: string): number | null | undefined {
  const reason = /^reason\.(.+)\.(offers|sharePct)$/.exec(key);
  if (reason) {
    const row = result.lost_reasons?.find((r) => r.reason === reason[1]);
    return reason[2] === 'offers' ? row?.offers : row?.share_pct;
  }
  if (key === 'offersWithMargin') return result.coverage.find((c) => c.offers_with_margin !== undefined)?.offers_with_margin;
  if (key === 'offers') {
    const cell = result.values.find((v) => v.metric === 'offers_created' || v.metric === 'offers_sent');
    return cell ? cell.value : result.coverage[0].offers;
  }
  const map = KEY_TO_METRIC[key];
  const cell = result.values.find((v) => v.metric === map?.metric);
  return map?.pln ? cell?.value_pln : cell?.value;
}

describe('metric catalog == golden oracle', () => {
  test('catalog covers every metric the golden set asks for', () => {
    const asked = new Set(cases.flatMap((c) => c.expect.params?.metrics ?? []).filter((m) => m !== 'margin'));
    for (const metric of asked) expect(METRIC_IDS).toContain(metric);
  });

  for (const c of cases.filter((x) => x.group === 'aggregate')) {
    test(`${c.id} ${c.question}`, async () => {
      const result = await runMetricsQuery(queryOf(c.expect.params!), demoDeps(c.asker));
      expect(result.status).toBe('ok');
      for (const [key, expected] of Object.entries(c.expect.numbers!)) {
        expect(actual(result as MetricsOk, key), key).toBe(expected);
      }
    });
  }

  for (const c of cases.filter((x) => x.group === 'comparison' && x.expect.behavior === 'answer')) {
    test(`${c.id} ${c.question}`, async () => {
      const p = c.expect.params!;
      const query = metricsQuerySchema.parse({ ...queryOf(p), compare: periodOf(p.compare!) });
      const result = (await runMetricsQuery(query, demoDeps(c.asker))) as MetricsOk;
      expect(result.status).toBe('ok');
      const cmp = result.comparison!;
      const n = c.expect.numbers!;
      expect(result.values[0].value, 'current').toBe(n.current);
      expect(cmp.values[0].value, 'previous').toBe(n.previous);
      expect(cmp.deltas[0].delta_abs, 'deltaAbs').toBe(n.deltaAbs);
      expect(cmp.deltas[0].delta_pct, 'deltaPct').toBe(n.deltaPct);
    });
  }

  for (const c of cases.filter((x) => x.group === 'ranking')) {
    test(`${c.id} ${c.question}`, async () => {
      const p = c.expect.params!;
      const result = (await runMetricsQuery(queryOf(p), demoDeps(c.asker))) as MetricsOk;
      expect(result.status).toBe('ok');
      const got = Object.fromEntries(
        result.groups!.rows.map((row, i) => {
          const name =
            p.group_by === 'person' ? row.label
            : p.group_by === 'client' ? clientKeyOf(row.key)
            : p.group_by === 'month' ? row.key.slice(0, 7)
            : row.key;
          return [`${i + 1}.${name}`, row.values[0].value];
        })
      );
      // Ties: the oracle breaks them by spec key, the tool by label - compare as sets of
      // (name, value) with the same value sequence.
      const strip = (o: Record<string, number | null>) => Object.entries(o).map(([k, v]) => `${k.replace(/^\d+\./, '')}=${v}`).sort();
      expect(Object.values(got)).toEqual(Object.values(c.expect.numbers!));
      expect(strip(got)).toEqual(strip(c.expect.numbers!));
    });
  }
});

describe('metric rules', () => {
  test('a mixed-basis question runs each metric on its own date', async () => {
    const result = (await runMetricsQuery(
      metricsQuerySchema.parse({ metrics: ['offers_sent', 'offers_won'], period: { year: 2026, month: 10 } }),
      demoDeps('admin')
    )) as MetricsOk;
    expect(result.values.map((v) => v.basis)).toEqual(['sent', 'decided']);
    expect(result.coverage.map((c) => c.basis).sort()).toEqual(['decided', 'sent']);
  });

  test('money is formatted in EUR and PLN, pl-PL', async () => {
    const result = (await runMetricsQuery(
      metricsQuerySchema.parse({ metrics: ['value_won'], period: { year: 2026, quarter: 3 } }),
      demoDeps('admin')
    )) as MetricsOk;
    expect(result.values[0].text).toMatch(/^\d{1,3}( \d{3})*,\d{2} EUR \(\d{1,3}( \d{3})*,\d{2} PLN\)$/);
  });

  test('no matching offers is reported as empty, with null rates instead of zeros', async () => {
    const result = (await runMetricsQuery(
      metricsQuerySchema.parse({ metrics: ['offers_won', 'win_rate_offers'], period: { year: 2020 } }),
      demoDeps('admin')
    )) as MetricsOk;
    expect(result.empty).toBe(true);
    expect(result.values[1]).toMatchObject({ value: null, text: 'brak danych' });
  });

  test('a person outside the asker\'s scope yields nothing (visibility is the scope)', async () => {
    const kasia = userIdOf('kasia');
    const result = (await runMetricsQuery(
      metricsQuerySchema.parse({ metrics: ['tons_won'], period: { preset: 'ytd' }, filters: { people: [kasia] } }),
      demoDeps('marekN')
    )) as MetricsOk;
    expect(result.empty).toBe(true);
  });

  test('month without a year: finished month resolves, the running month asks', async () => {
    const october = await runMetricsQuery(metricsQuerySchema.parse({ metrics: ['offers_sent'], period: { month: 10 } }), demoDeps('admin'));
    expect(october).toMatchObject({ status: 'ok', period: { from: '2026-10-01', to: '2026-10-31', label: 'październik 2026' } });
    const november = await runMetricsQuery(metricsQuerySchema.parse({ metrics: ['offers_sent'], period: { month: 11 } }), demoDeps('admin'));
    expect(november).toMatchObject({ status: 'needs_clarification' });
    expect((november as { options: { label: string }[] }).options.map((o) => o.label)).toEqual(['listopad 2026 (do dziś)', 'listopad 2025']);
    const december = await runMetricsQuery(metricsQuerySchema.parse({ metrics: ['offers_sent'], period: { month: 12 } }), demoDeps('admin'));
    expect(december).toMatchObject({ status: 'ok', period: { from: '2025-12-01', to: '2025-12-31' } });
  });

  test('a period that has not started is not answered with zeros', async () => {
    const result = await runMetricsQuery(metricsQuerySchema.parse({ metrics: ['offers_sent'], period: { year: 2027, month: 1 } }), demoDeps('admin'));
    expect(result.status).toBe('future_period');
  });

  test('unknown metric ids and extra keys are rejected by the schema', () => {
    expect(metricsQuerySchema.safeParse({ metrics: ['revenue_forecast'], period: { preset: 'ytd' } }).success).toBe(false);
    expect(metricsQuerySchema.safeParse({ metrics: ['offers_sent'], period: { preset: 'ytd' }, sql: 'select 1' }).success).toBe(false);
  });

  test('D12: comparing the running month asks, with three fully specified choices', async () => {
    const run = (compare: unknown, lang: 'pl' | 'en' = 'pl') =>
      runMetricsQuery(metricsQuerySchema.parse({ metrics: ['offers_sent'], period: { preset: 'thisMonth' }, compare }), demoDeps('admin', lang));

    const pl = (await run('previous_period')) as { status: string; question: string; options: { label: string; period: unknown; compare: unknown }[] };
    expect(pl).toMatchObject({ status: 'needs_clarification', question: 'comparison' });
    // Golden cmp-042..045 (today = 2026-11-09).
    expect(pl.options.map((o) => o.label)).toEqual(['1-9 lis vs 1-9 paź', 'listopad do dziś vs cały październik', 'październik vs wrzesień']);
    expect(pl.options.map((o) => [o.period, o.compare])).toEqual([
      [{ from: '2026-11-01', to: '2026-11-09' }, { from: '2026-10-01', to: '2026-10-09' }],
      [{ from: '2026-11-01', to: '2026-11-09' }, { from: '2026-10-01', to: '2026-10-31' }],
      [{ from: '2026-10-01', to: '2026-10-31' }, { from: '2026-09-01', to: '2026-09-30' }],
    ]);

    const en = (await run('previous_period', 'en')) as typeof pl;
    expect(en.options.map((o) => o.label)).toEqual(['1-9 Nov vs 1-9 Oct', 'November to date vs all of October', 'October vs September']);

    const lastYear = (await run('same_period_last_year')) as typeof pl;
    expect(lastYear.options[0].label).toBe('1-9 lis 2026 vs 1-9 lis 2025');
    expect(lastYear.options[2].period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(lastYear.options[2].compare).toEqual({ from: '2025-10-01', to: '2025-10-31' });

    // Every choice answers without asking again.
    for (const option of pl.options) {
      const picked = await runMetricsQuery(
        metricsQuerySchema.parse({ metrics: ['offers_sent'], period: option.period, compare: option.compare }),
        demoDeps('admin')
      );
      expect(picked.status).toBe('ok');
    }
  });

  test('comparison: previous period of a quarter, last year, base 0 and guard rails', async () => {
    const q3 = (await runMetricsQuery(
      metricsQuerySchema.parse({ metrics: ['tons_won'], period: { year: 2026, quarter: 3 }, compare: 'previous_period' }),
      demoDeps('admin')
    )) as MetricsOk;
    expect(q3.comparison!.period).toMatchObject({ from: '2026-04-01', to: '2026-06-30', label: 'II kwartał 2026' });

    const ly = (await runMetricsQuery(
      metricsQuerySchema.parse({ metrics: ['offers_sent'], period: { year: 2026, month: 10 }, compare: 'same_period_last_year' }),
      demoDeps('admin')
    )) as MetricsOk;
    expect(ly.comparison!.period).toMatchObject({ from: '2025-10-01', to: '2025-10-31' });
    expect(ly.comparison!.deltas[0].text).toBe('+7; +100,0%');

    // Nothing in the comparison window: no "infinity %".
    const fromNothing = (await runMetricsQuery(
      metricsQuerySchema.parse({ metrics: ['offers_sent'], period: { year: 2026, month: 10 }, compare: { year: 2020, month: 10 } }),
      demoDeps('admin')
    )) as MetricsOk;
    expect(fromNothing.comparison!.deltas[0]).toMatchObject({ delta_abs: 14, delta_pct: null });

    const withGroups = await runMetricsQuery(
      metricsQuerySchema.parse({ metrics: ['offers_sent'], period: { year: 2026, month: 10 }, compare: 'previous_period', group_by: 'person' }),
      demoDeps('admin')
    );
    expect(withGroups.status).toBe('invalid');

    const allTime = await runMetricsQuery(
      metricsQuerySchema.parse({ metrics: ['offers_sent'], period: { preset: 'all' }, compare: 'previous_period' }),
      demoDeps('admin')
    );
    expect(allTime.status).toBe('invalid');
  });

  test('margin change is stated in percentage points', async () => {
    const result = (await runMetricsQuery(
      metricsQuerySchema.parse({ metrics: ['margin_weighted'], period: { year: 2026, quarter: 3 }, compare: { year: 2026, quarter: 2 } }),
      demoDeps('admin')
    )) as MetricsOk;
    expect(result.comparison!.deltas[0].text).toBe('+0,45 p.p.; +5,5%');
  });

  test('people named in the fixture exist', () => {
    expect(PEOPLE.length).toBeGreaterThan(0);
  });
});

describe('comparison edge cases (review fixes)', () => {
  test('no % change against a zero or negative base - a sign flip would read backwards', async () => {
    const { delta } = await import('@/lib/assistant/compare');
    // Margin from -2,00% to -1,00%: an improvement of 1 p.p., never "-50%".
    expect(delta(-1, -2, 2)).toEqual({ abs: 1, pct: null });
    expect(delta(5, 0, 0)).toEqual({ abs: 5, pct: null });
    expect(delta(12, 10, 0)).toEqual({ abs: 2, pct: 20 });
  });

  test('compare with lost_reasons is refused, not silently half-answered', async () => {
    const query = metricsQuerySchema.parse({ ...queryOf({ metrics: ['offers_lost', 'lost_reasons'], period: '2026-10', basis: 'decided', filters: {} }), compare: 'previous_period' });
    const result = await runMetricsQuery(query, demoDeps('admin'));
    expect(result.status).toBe('invalid');
  });
});
