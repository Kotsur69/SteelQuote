// The metric catalog against the golden set (docs/ai-assistant-plan.md 12.1): every aggregate
// and ranking case of tests/assistant/golden.json, whose expected numbers come from the
// independent oracle, must come out of runMetricsQuery - i.e. out of the analytics engine.

import { describe, expect, test } from 'vitest';
import golden from './golden.json';
import { METRIC_IDS, metricsQuerySchema, runMetricsQuery, type MetricId, type MetricsOk, type MetricsQuery } from '@/lib/assistant/metrics';
import type { PeriodInput } from '@/lib/assistant/periods';
import { clientIdOf, clientKeyOf, demoDeps, userIdOf } from './demoRows';
import { PEOPLE } from '../../scripts/assistant-demo/spec';

interface GoldenParams {
  metrics: string[];
  period: string;
  basis: 'created' | 'sent' | 'decided';
  filters: { people?: string[]; clients?: string[]; steelTypes?: string[] };
  group_by?: 'person' | 'client' | 'steel_type' | 'month';
  limit?: number;
}

interface Case {
  id: string;
  group: string;
  asker: string;
  question: string;
  expect: { behavior: string; params?: GoldenParams; numbers?: Record<string, number | null> };
}

const cases = golden.cases as unknown as Case[];

function periodOf(label: string): PeriodInput {
  if (label === 'thisYear') return { preset: 'ytd' };
  if (label === 'last30days') return { preset: 'last30' };
  if (/^\d{4}$/.test(label)) return { year: Number(label) };
  const month = /^(\d{4})-(\d{2})$/.exec(label);
  if (month) return { year: Number(month[1]), month: Number(month[2]) };
  const quarter = /^(\d{4})-Q(\d)$/.exec(label);
  if (quarter) return { year: Number(quarter[1]), quarter: Number(quarter[2]) };
  return { preset: label as PeriodInput['preset'] };
}

function queryOf(p: GoldenParams): MetricsQuery {
  const metrics = p.metrics.flatMap((m) => (m === 'margin' ? ['margin_weighted', 'margin_simple'] : [m])) as MetricId[];
  return metricsQuerySchema.parse({
    metrics,
    period: periodOf(p.period),
    basis: p.basis,
    filters: {
      ...(p.filters.people ? { people: p.filters.people.map(userIdOf) } : {}),
      ...(p.filters.clients ? { clients: p.filters.clients.map(clientIdOf) } : {}),
      ...(p.filters.steelTypes ? { steel_types: p.filters.steelTypes } : {}),
    },
    ...(p.group_by ? { group_by: p.group_by, sort: 'desc', limit: p.limit } : {}),
  });
}

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

  test('people named in the fixture exist', () => {
    expect(PEOPLE.length).toBeGreaterThan(0);
  });
});
