// Excel export of an assistant answer (docs/ai-assistant-plan.md D8): the same figures the chat
// showed, as raw numbers a reader can sum and pivot, plus the offers behind them so any number
// can be checked row by row.
//
// Sheets: Result (values / comparison / breakdown + the footer definitions), Lost reasons (when
// asked), Offers (one row per offer counted, per date basis).
//
// lib/analyticsExport.ts is the panel's browser-side export of an /api/analytics payload; this
// one runs on the server over a re-run assistant query, so the two share only the column fitting.
//
// Pure: takes a computed MetricsOk, returns the file bytes. Server-only (xlsx write).

import * as XLSX from 'xlsx';
import type { DateBasis } from '../analytics';
import { autoFitColumns } from '../excelExport';
import type { Lang } from './format';
import { METRICS, type MetricCell, type MetricsOk } from './metrics';

type Cell = string | number | null;
type Row = Cell[];

const T = {
  pl: {
    sheets: { result: 'Wynik', reasons: 'Powody przegranej', offers: 'Oferty' },
    title: 'Asystent SteelQuote - eksport odpowiedzi',
    period: 'Okres', compared: 'Porównanie z',
    metric: 'Miara', value: 'Wartość', change: 'Zmiana', changePct: 'Zmiana %',
    notes: 'Definicje i zakres',
    reason: 'Powód', offersCount: 'Oferty', share: 'Udział %', tons: 'Tony', eur: 'EUR', pln: 'PLN',
    basis: 'Podstawa daty', id: 'ID', name: 'Oferta', owner: 'Handlowiec', client: 'Klient', steel: 'Typy stali',
    status: 'Status', decision: 'Decyzja', margin: 'Marża %', created: 'Utworzona', sent: 'Wysłana', decided: 'Decyzja klienta',
    bases: { created: 'utworzenie', sent: 'wysłanie', decided: 'decyzja' } as Record<DateBasis, string>,
  },
  en: {
    sheets: { result: 'Result', reasons: 'Lost reasons', offers: 'Offers' },
    title: 'SteelQuote assistant - answer export',
    period: 'Period', compared: 'Compared with',
    metric: 'Metric', value: 'Value', change: 'Change', changePct: 'Change %',
    notes: 'Definitions and scope',
    reason: 'Reason', offersCount: 'Offers', share: 'Share %', tons: 'Tons', eur: 'EUR', pln: 'PLN',
    basis: 'Date basis', id: 'ID', name: 'Offer', owner: 'Salesperson', client: 'Client', steel: 'Steel types',
    status: 'Status', decision: 'Decision', margin: 'Margin %', created: 'Created', sent: 'Sent', decided: 'Client decision',
    bases: { created: 'created', sent: 'sent', decided: 'decided' } as Record<DateBasis, string>,
  },
} as const;

/** A money metric is two columns (EUR and PLN); everything else one, with its unit. */
function cellColumns(cell: MetricCell): { headers: string[]; values: Cell[] } {
  const unit = METRICS[cell.metric].unit;
  if (unit === 'money') {
    return { headers: [`${cell.label} (EUR)`, `${cell.label} (PLN)`], values: [cell.value, cell.value_pln ?? null] };
  }
  const suffix = unit === 'money_eur' ? ' (EUR)' : unit === 'tons' ? ' (t)' : unit.startsWith('percent') ? ' (%)' : '';
  return { headers: [`${cell.label}${suffix}`], values: [cell.value] };
}

function resultSheet(result: MetricsOk, footer: string[], lang: Lang): Row[] {
  const t = T[lang];
  const rows: Row[] = [[t.title], [t.period, result.period.label, result.period.from, result.period.to]];
  const cmp = result.comparison;
  if (cmp) rows.push([t.compared, cmp.period.label, cmp.period.from, cmp.period.to]);
  rows.push([]);

  if (cmp) {
    rows.push([t.metric, result.period.label, cmp.period.label, t.change, t.changePct]);
    result.values.forEach((v, i) => {
      const d = cmp.deltas[i];
      const headers = cellColumns(v).headers;
      rows.push([headers[0], v.value, cmp.values[i].value, d.delta_abs, d.delta_pct]);
      if (headers.length > 1) rows.push([headers[1], v.value_pln ?? null, cmp.values[i].value_pln ?? null, d.delta_abs_pln ?? null, null]);
    });
  } else if (result.groups) {
    const g = result.groups;
    rows.push(['', ...(g.rows[0]?.values ?? []).flatMap((v) => cellColumns(v).headers)]);
    for (const row of g.rows) rows.push([row.label, ...row.values.flatMap((v) => cellColumns(v).values)]);
  } else {
    rows.push([t.metric, t.value]);
    for (const v of result.values) {
      const { headers, values } = cellColumns(v);
      headers.forEach((header, i) => rows.push([header, values[i]]));
    }
  }

  rows.push([], [t.notes], ...footer.map((line) => [line]));
  return rows;
}

function reasonsSheet(result: MetricsOk, lang: Lang): Row[] {
  const t = T[lang];
  return [
    [t.reason, t.offersCount, t.share, t.tons, t.eur, t.pln],
    ...(result.lost_reasons ?? []).map((r) => [r.label, r.offers, r.share_pct, r.tons, r.value_eur, r.value_pln]),
  ];
}

function offersSheet(result: MetricsOk, lang: Lang): Row[] {
  const t = T[lang];
  const groups = result.offers ?? [];
  const many = groups.length > 1;
  return [
    [...(many ? [t.basis] : []), t.id, t.name, t.owner, t.client, t.steel, t.tons, t.eur, t.pln, t.margin, t.status, t.decision, t.created, t.sent, t.decided],
    ...groups.flatMap(({ basis, offers }) =>
      offers.map((o): Row => [
        ...(many ? [t.bases[basis]] : []),
        o.id, o.label, o.ownerName, o.clientCompany, o.steelTypes.join(', '), o.tons, o.valueEur, o.valuePln, o.marginPct,
        o.status, o.decision, o.createdAt, o.sentAt, o.decidedAt,
      ])
    ),
  ];
}

function sheet(rows: Row[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = autoFitColumns(rows);
  return ws;
}

export function buildAnswerWorkbook(result: MetricsOk, footer: string[], lang: Lang): Buffer {
  const t = T[lang];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(resultSheet(result, footer, lang)), t.sheets.result);
  if (result.lost_reasons?.length) XLSX.utils.book_append_sheet(wb, sheet(reasonsSheet(result, lang)), t.sheets.reasons);
  XLSX.utils.book_append_sheet(wb, sheet(offersSheet(result, lang)), t.sheets.offers);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** "asystent_2026-10-01_2026-10-31.xlsx" - ASCII only, safe in a Content-Disposition header. */
export function exportFileName(result: MetricsOk): string {
  const span = [result.period.from, result.period.to].filter(Boolean).join('_') || 'all';
  return `asystent_${span}.xlsx`;
}
