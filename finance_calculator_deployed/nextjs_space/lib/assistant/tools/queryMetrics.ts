// query_metrics: the one tool behind every aggregate question (plan D5). It binds the metric
// catalog (lib/assistant/metrics.ts) to the asking user's visibility and to the clock, then
// builds the tables and the server-written footer the panel shows.

import { fetchAnalyticsRows } from '../../analyticsQuery';
import { loadLostReasons } from '../../lostReasonsDb';
import type { AnswerBlock, TableBlock } from '../blocks';
import { buildMetricsFooter, scopeKind } from '../footer';
import { formatCount } from '../format';
import { METRIC_IDS, metricsQuerySchema, runMetricsQuery, type MetricsOk } from '../metrics';
import { scopedNames } from './directory';
import { defineTool, pick, type ToolRuntime } from './types';

const DIMENSION_LABEL: Record<string, [string, string]> = {
  person: ['Handlowiec', 'Salesperson'], client: ['Klient', 'Client'], steel_type: ['Typ stali', 'Steel type'],
  status: ['Status', 'Status'], decision: ['Decyzja klienta', 'Client decision'],
  month: ['Miesiąc', 'Month'], week: ['Tydzień', 'Week'], quarter: ['Kwartał', 'Quarter'],
};

function tables(result: MetricsOk, rt: ToolRuntime): TableBlock[] {
  const out: TableBlock[] = [];
  const { lang } = rt;

  if (result.groups) {
    const g = result.groups;
    const [pl, en] = DIMENSION_LABEL[g.dimension];
    out.push({
      type: 'table',
      columns: [pick(lang, pl, en), ...(g.rows[0]?.values.map((v) => v.label) ?? [])],
      rows: g.rows.map((row) => [row.label, ...row.values.map((v) => v.text)]),
      ...(g.rows.length < g.total_groups
        ? { note: pick(lang, `Pokazano ${g.rows.length} z ${g.total_groups}.`, `Showing ${g.rows.length} of ${g.total_groups}.`) }
        : {}),
    });
  } else if (result.values.length > 1) {
    out.push({
      type: 'table',
      columns: [pick(lang, 'Miara', 'Metric'), pick(lang, 'Wartość', 'Value')],
      rows: result.values.map((v) => [v.label, v.text]),
    });
  }

  if (result.lost_reasons && result.lost_reasons.length > 0) {
    out.push({
      type: 'table',
      title: pick(lang, 'Powody przegranej', 'Lost reasons'),
      columns: [pick(lang, 'Powód', 'Reason'), pick(lang, 'Oferty', 'Offers'), pick(lang, 'Udział', 'Share'), pick(lang, 'Tony', 'Tons'), pick(lang, 'Wartość', 'Value')],
      rows: result.lost_reasons.map((r) => [r.label, formatCount(r.offers, lang), r.share_text, r.tons_text, r.value_text]),
    });
  }
  return out;
}

export const queryMetrics = defineTool({
  name: 'query_metrics',
  description:
    'Exact aggregates over offers the user may see: counts, tons, value (EUR + PLN), distinct clients, win rate, margin, lost reasons. ' +
    `Metrics: ${METRIC_IDS.join(', ')}. ` +
    'Pick the metric by the verb: created ("zrobił, stworzył") -> offers_created / basis "created"; sent ("wysłał, ofertował, dostał ofertę") -> offers_sent / basis "sent"; ' +
    'sold / won ("sprzedał, wygrał") -> *_won; lost ("przegrał, stracił") -> *_lost. "basis" applies only to tons_offered, value_offered, clients_offered, margin_*, avg_* (default "sent"). ' +
    'Margin questions: ask for margin_weighted AND margin_simple. "Ile X sprzedał" without a unit: tons_won + value_won + offers_won. ' +
    'period: preset, or {year, month}, {year, quarter}, {year}, or {from, to}. If the user named a month or quarter WITHOUT a year, omit "year" - the server decides or asks. Never compute dates yourself. ' +
    'filters.people / filters.clients take ids from find_people / find_clients. group_by + sort + limit give rankings and breakdowns. ' +
    'The app shows the tables and a footer (definitions, period, scope, offer count) under your text - do not repeat them; quote numbers exactly as given in "text".',
  schema: metricsQuerySchema,
  run: async (query, rt) => {
    const result = await runMetricsQuery(query, {
      today: rt.today,
      lang: rt.lang,
      selfId: rt.ctx.userId,
      teamUserIds: rt.ctx.teamUserIds,
      fetchRows: (filters, window) => fetchAnalyticsRows(rt.ctx, filters, window, rt.db),
      loadLostReasons: async () => (await loadLostReasons(rt.db)).reasons,
    });

    if (result.status === 'needs_clarification') {
      return {
        result: {
          status: 'needs_clarification',
          options: result.options.map((o) => o.label),
          message: pick(rt.lang, 'Okres jest niejednoznaczny. Zapytaj, o który chodzi - przyciski są już pokazane. Nie wybieraj samodzielnie.', 'The period is ambiguous. Ask which one is meant - buttons are already shown. Do not choose yourself.'),
        },
        blocks: [{ type: 'clarify', options: result.options.map((o) => ({ label: o.label, value: o.label })) }],
      };
    }
    if (result.status === 'future_period') {
      return { result: { status: 'future_period', message: pick(rt.lang, `Okres ${result.label} jeszcze nie nastąpił - nie ma danych i nie wolno prognozować.`, `The period ${result.label} has not started yet - there is no data and no forecasting.`) } };
    }
    if (result.status === 'invalid') return { result: { status: 'invalid', message: result.message } };

    const names = await scopedNames(rt, result.applied.filters.people ?? [], result.applied.filters.clients ?? []);
    const footer = buildMetricsFooter(result, scopeKind(rt.ctx), names, rt.lang);
    const blocks: AnswerBlock[] = [...tables(result, rt), { type: 'footer', lines: footer.lines }];

    const { applied: _applied, ...forModel } = result;
    return {
      result: {
        ...forModel,
        ...(result.empty ? { message: pick(rt.lang, 'Brak ofert spełniających kryteria - powiedz to wprost.', 'No offers match - say so plainly.') } : {}),
        scope: scopeKind(rt.ctx),
      },
      blocks,
    };
  },
});
