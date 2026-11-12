// Excel export of an answer (lib/assistant/exportWorkbook.ts, plan D8): the file holds the same
// raw values as the answer and one row per counted offer, so every figure can be checked.

import * as XLSX from 'xlsx';
import { describe, expect, test } from 'vitest';
import { buildAnswerWorkbook, exportFileName } from '@/lib/assistant/exportWorkbook';
import { runMetricsQuery, type MetricsOk, type MetricsQuery } from '@/lib/assistant/metrics';
import { demoDeps } from './demoRows';
import { queryOf } from './goldenCases';

type Cell = string | number | null;

async function exported(query: MetricsQuery) {
  const result = (await runMetricsQuery(query, { ...demoDeps('admin'), includeOffers: true })) as MetricsOk;
  expect(result.status).toBe('ok');
  const wb = XLSX.read(buildAnswerWorkbook(result, ['Definicja: test'], 'pl'), { type: 'buffer' });
  const sheet = (name: string) => XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, defval: null });
  return { result, wb, sheet };
}

describe('answer workbook', () => {
  test('a comparison: both values, the change and the offers behind the current window', async () => {
    const query: MetricsQuery = { ...queryOf({ metrics: ['offers_sent'], period: '2026-10', basis: 'sent', filters: {} }), compare: 'previous_period' };
    const { result, wb, sheet } = await exported(query);
    expect(wb.SheetNames).toEqual(['Wynik', 'Oferty']);

    const rows = sheet('Wynik');
    const cmp = result.comparison!;
    const row = rows.find((r) => r[0] === result.values[0].label)!;
    expect(row).toEqual([result.values[0].label, result.values[0].value, cmp.values[0].value, cmp.deltas[0].delta_abs, cmp.deltas[0].delta_pct]);
    expect(rows.flat()).toContain('Definicja: test');

    // Header + one row per offer counted in the answer's window.
    expect(sheet('Oferty').length - 1).toBe(result.coverage[0].offers);
    expect(exportFileName(result)).toBe('asystent_2026-10-01_2026-10-31.xlsx');
  });

  test('money is two columns (EUR and PLN) and lost reasons get their own sheet', async () => {
    const query = queryOf({ metrics: ['value_lost', 'lost_reasons'], period: '2026', basis: 'decided', filters: {} });
    const { result, wb, sheet } = await exported(query);
    expect(wb.SheetNames).toEqual(['Wynik', 'Powody przegranej', 'Oferty']);
    const value = result.values.find((v) => v.metric === 'value_lost')!;
    const flat = sheet('Wynik');
    expect(flat.find((r) => r[0] === `${value.label} (EUR)`)?.[1]).toBe(value.value);
    expect(flat.find((r) => r[0] === `${value.label} (PLN)`)?.[1]).toBe(value.value_pln);
    expect(sheet('Powody przegranej').length - 1).toBe(result.lost_reasons!.length);
  });
});
