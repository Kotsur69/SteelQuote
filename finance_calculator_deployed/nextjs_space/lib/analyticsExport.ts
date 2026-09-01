// Excel export of what the analytics panel is currently showing.
//
// Two sheets, because the two are read differently: "Summary" is the headline figures plus
// every breakdown, for pasting into a report; "Offers" is the row-level data behind them, for
// anyone who wants to check a number or pivot it themselves.
//
// The export follows the FILTERS, not the database: what you see is what you get, including
// the period, the steel-type narrowing and the currency currently on screen.

import * as XLSX from 'xlsx';
import { autoFitColumns } from './excelExport';
import type { AnalyticsGroup, AnalyticsPayload } from './analytics';
import type { Currency } from './currency';

interface ExportLabels {
  summary: string;
  offers: string;
  period: string;
  measureTons: string;
  measureValue: string;
  offersCount: string;
  clients: string;
  won: string;
  lost: string;
  pending: string;
  winRate: string;
  margin: string;
  steelType: string;
  status: string;
  decision: string;
  salesperson: string;
  client: string;
  offerName: string;
  createdAt: string;
  sentAt: string;
  decidedAt: string;
  total: string;
}

/** Rows of a breakdown, prefixed by a section title, ready to stack onto the summary sheet. */
function groupRows(
  title: string,
  groups: AnalyticsGroup[],
  currency: Currency,
  labels: ExportLabels
): (string | number | null)[][] {
  return [
    [title],
    [
      '',
      labels.measureTons,
      `${labels.measureValue} (${currency})`,
      labels.offersCount,
      labels.clients,
      labels.won,
      labels.lost,
      labels.winRate,
      labels.margin,
    ],
    ...groups.map((g) => [
      g.label,
      g.tonsOffered,
      currency === 'PLN' ? g.valueOfferedPln : g.valueOfferedEur,
      g.offers,
      g.clients,
      g.tonsWon,
      g.tonsLost,
      g.winRateTons,
      g.avgMarginPct,
    ]),
    [],
  ];
}

export function exportAnalyticsToExcel(
  payload: AnalyticsPayload,
  currency: Currency,
  labels: ExportLabels,
  fileName = 'analiza'
): void {
  const money = (eur: number, pln: number) => (currency === 'PLN' ? pln : eur);
  const { kpi } = payload;

  const summary: (string | number | null)[][] = [
    [
      labels.period,
      `${payload.period.from ?? '—'} … ${payload.period.to ?? '—'}`,
      payload.filters.basis,
      payload.filters.granularity,
    ],
    [],
    [labels.summary],
    [labels.measureTons, kpi.tonsOffered],
    [`${labels.measureValue} (${currency})`, money(kpi.valueOfferedEur, kpi.valueOfferedPln)],
    [labels.offersCount, kpi.offers],
    [labels.clients, kpi.clients],
    [labels.won, kpi.tonsWon, kpi.offersWon],
    [labels.lost, kpi.tonsLost, kpi.offersLost],
    [labels.pending, kpi.tonsPending, kpi.offersPending],
    [labels.winRate, kpi.winRateTons],
    [labels.margin, kpi.avgMarginPct],
    [],
    ...groupRows(labels.steelType, payload.bySteelType, currency, labels),
    ...groupRows(labels.status, payload.byStatus, currency, labels),
    ...groupRows(labels.decision, payload.byDecision, currency, labels),
    ...(payload.scope.canFilterSalespeople
      ? groupRows(labels.salesperson, payload.bySalesperson, currency, labels)
      : []),
    ...groupRows(labels.client, payload.byClient, currency, labels),
  ];

  const offerRows = [
    [
      'ID',
      labels.offerName,
      labels.salesperson,
      labels.client,
      labels.steelType,
      labels.measureTons,
      `${labels.measureValue} (${currency})`,
      labels.margin,
      labels.status,
      labels.decision,
      labels.createdAt,
      labels.sentAt,
      labels.decidedAt,
    ],
    ...payload.rows.map((row) => [
      row.id,
      row.label,
      row.ownerName ?? '',
      row.clientCompany ?? '',
      row.steelTypes.join(', '),
      row.tons,
      money(row.valueEur, row.valuePln),
      row.marginPct,
      row.status,
      row.decision,
      row.createdAt,
      row.sentAt ?? '',
      row.decidedAt ?? '',
    ]),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet['!cols'] = autoFitColumns(summary);
  const offersSheet = XLSX.utils.aoa_to_sheet(offerRows);
  offersSheet['!cols'] = autoFitColumns(offerRows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, labels.summary.slice(0, 31));
  XLSX.utils.book_append_sheet(workbook, offersSheet, labels.offers.slice(0, 31));

  const stamp = payload.period.to ?? new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${fileName}_${stamp}.xlsx`);
}
