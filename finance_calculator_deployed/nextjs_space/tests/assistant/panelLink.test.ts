// Link parity (docs/ai-assistant-plan.md 6.1, D23): the "Otwórz panel analizy" link of every
// golden answer, read the way /analytics reads it (parseUrlState -> toApiQuery ->
// parseAnalyticsRequest -> the analytics engine), shows exactly the numbers of the answer.
// A link that would open a view with different figures is a bug, not a rounding note.

import { describe, expect, test } from 'vitest';
import { computeKpi, normalizeOffers, withinWindow } from '@/lib/analyticsAggregate';
import { parseAnalyticsRequest } from '@/lib/analyticsRequest';
import { parseUrlState, toApiQuery } from '@/lib/analyticsUrlState';
import { METRICS, basisOf, runMetricsQuery, type MetricCell, type MetricsOk, type MetricsQuery } from '@/lib/assistant/metrics';
import { buildPanelLinks, PANEL_VIEW } from '@/lib/assistant/panelLink';
import { SPEC_TODAY } from '../../scripts/assistant-demo/spec';
import { demoDeps } from './demoRows';
import { cases, periodOf, queryOf, type Case } from './goldenCases';

function queryFor(c: Case): MetricsQuery {
  const p = c.expect.params!;
  return c.group === 'comparison' ? { ...queryOf(p), compare: periodOf(p.compare!) } : queryOf(p);
}

const linked = cases.filter(
  (c) => (c.group === 'aggregate' || c.group === 'ranking' || c.group === 'comparison') && c.expect.behavior === 'answer' && c.expect.params
);

describe('panel link shows the numbers of the answer', () => {
  test('the golden set exercises the links', () => {
    expect(linked.length).toBeGreaterThan(40);
  });

  for (const c of linked) {
    test(`${c.id} ${c.question}`, async () => {
      const deps = demoDeps(c.asker);
      const query = queryFor(c);
      const result = (await runMetricsQuery(query, deps)) as MetricsOk;
      expect(result.status).toBe('ok');

      const { links, covered, missing } = buildPanelLinks(query, result, 'pl');
      for (const m of missing) expect(PANEL_VIEW[m] === null || PANEL_VIEW[m]?.decision !== undefined, m).toBe(true);
      if (covered.length === 0) return expect(links).toEqual([]);

      // A comparison answer: link 0 = its period, link 1 = the comparison period.
      const sides: MetricCell[][] = result.comparison ? [result.values, result.comparison.values] : [result.values];
      expect(links.length).toBeGreaterThanOrEqual(sides.length);

      for (const [i, link] of links.entries()) {
        expect(link.href.startsWith('/analytics?')).toBe(true);
        const state = parseUrlState(new URL(link.href, 'http://panel').searchParams);
        const { period, filters } = parseAnalyticsRequest(new URLSearchParams(toApiQuery(state)), SPEC_TODAY);
        const rows = await deps.fetchRows(filters, { from: period.from, to: period.to });
        const kpi = computeKpi(withinWindow(normalizeOffers(rows, filters), period.from, period.to));

        const cells = sides[result.comparison ? i : 0];
        const shown = covered.filter((m) => METRICS[m].unit !== 'table' && basisOf(m, query.basis) === state.basis);
        expect(shown.length, `link ${i} shows nothing`).toBeGreaterThan(0);
        for (const metric of shown) {
          const cell = cells.find((v) => v.metric === metric)!;
          const panel = METRICS[metric].pick(kpi);
          expect(panel.value, `${metric} (link ${i})`).toBe(cell.value);
          if (cell.value_pln !== undefined) expect(panel.valuePln, `${metric} PLN (link ${i})`).toBe(cell.value_pln);
        }
      }
    });
  }
});

describe('metrics the panel cannot show', () => {
  test('win rate by offers has no view: no link, a footer note instead', async () => {
    const query = queryOf({ metrics: ['win_rate_offers'], period: '2026-10', basis: 'decided', filters: {} });
    const result = (await runMetricsQuery(query, demoDeps('admin'))) as MetricsOk;
    expect(buildPanelLinks(query, result, 'pl')).toEqual({ links: [], covered: [], missing: ['win_rate_offers'] });
  });

  test('won and lost value together have no single view (one decision filter at a time)', async () => {
    const query = queryOf({ metrics: ['value_won', 'value_lost'], period: '2026-10', basis: 'decided', filters: {} });
    const result = (await runMetricsQuery(query, demoDeps('admin'))) as MetricsOk;
    const { links, missing } = buildPanelLinks(query, result, 'pl');
    expect(links).toEqual([]);
    expect(missing).toEqual(['value_won', 'value_lost']);
  });
});
