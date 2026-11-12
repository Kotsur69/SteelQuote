// query_metrics: the one tool behind every aggregate question (plan D5). It binds the metric
// catalog (lib/assistant/metrics.ts) to the asking user's visibility and to the clock, then
// builds what the panel shows under the answer: tables, a chart, the server-written footer with
// the /analytics deep link and the Excel link, and the follow-up chips (plan 6.1, 6.2, D8).

import { fetchAnalyticsRows } from '../../analyticsQuery';
import { loadLostReasons } from '../../lostReasonsDb';
import type { AnswerBlock, ChartBlock, ClarifyBlock, FollowUpsBlock, FooterLink, TableBlock } from '../blocks';
import { buildFollowUps, followUpQuestion, type FollowUpCall } from '../followUps';
import { buildMetricsFooter, scopeKind } from '../footer';
import { formatCount } from '../format';
import { METRICS, METRIC_IDS, metricsQuerySchema, runMetricsQuery, type MetricsOk, type MetricsQuery, type MetricsResult } from '../metrics';
import { buildPanelLinks, missingViewNote } from '../panelLink';
import { MAX_TOKEN_CHARS, signToken } from '../tokens';
import { scopedNames } from './directory';
import { defineTool, pick, type ToolRuntime } from './types';

const DIMENSION_LABEL: Record<string, [string, string]> = {
  person: ['Handlowiec', 'Salesperson'], client: ['Klient', 'Client'], steel_type: ['Typ stali', 'Steel type'],
  status: ['Status', 'Status'], decision: ['Decyzja klienta', 'Client decision'],
  month: ['Miesiąc', 'Month'], week: ['Tydzień', 'Week'], quarter: ['Kwartał', 'Quarter'],
};
const TIME_DIMENSIONS = new Set(['month', 'week', 'quarter']);
const MIN_CHART_POINTS = 2;

/** The signed payload of a follow-up button; chatService verifies and runs it. */
export interface FollowUpPayload {
  tool: FollowUpCall['tool'];
  input: Record<string, unknown>;
  label: string;
}

/** The signed payload of an Excel link; the export route re-runs it. */
export interface ExportPayload {
  query: MetricsQuery;
  lang: ToolRuntime['lang'];
}

const signFollowUp = (rt: ToolRuntime, call: FollowUpCall): string =>
  signToken<FollowUpPayload>('followup', rt.ctx.userId, { tool: call.tool, input: call.input, label: call.label });

// A token the server would refuse to read back is a dead button: such a button is not shown.
const fits = (token: string): boolean => token.length <= MAX_TOKEN_CHARS;

function tables(result: MetricsOk, rt: ToolRuntime): TableBlock[] {
  const out: TableBlock[] = [];
  const { lang } = rt;

  if (result.comparison) {
    const cmp = result.comparison;
    out.push({
      type: 'table',
      columns: [pick(lang, 'Miara', 'Metric'), result.period.label, cmp.period.label, pick(lang, 'Zmiana', 'Change')],
      rows: result.values.map((v, i) => [v.label, v.text, cmp.values[i].text, cmp.deltas[i].text]),
    });
  } else if (result.groups) {
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

/** A time breakdown is a trend: drawn from the same cells as the table, first metric only. */
function chart(result: MetricsOk): ChartBlock | null {
  const g = result.groups;
  if (!g || !TIME_DIMENSIONS.has(g.dimension) || g.rows.length < MIN_CHART_POINTS) return null;
  const first = g.rows[0].values[0];
  if (!first) return null;
  const unit = METRICS[first.metric].unit;
  return {
    type: 'chart',
    kind: unit === 'percent1' || unit === 'percent2' ? 'line' : 'bar',
    title: first.label,
    points: g.rows.map((row) => ({ label: row.label, value: row.values[0].value, text: row.values[0].text })),
  };
}

/** The query with its periods pinned to dates, so an Excel link opened tomorrow shows the same. */
function pinned(query: MetricsQuery, result: MetricsOk): MetricsQuery {
  const { from, to } = result.period;
  const cmp = result.comparison?.period;
  return {
    ...query,
    period: from && to ? { from, to } : { preset: 'all' },
    ...(cmp ? { compare: { from: cmp.from, to: cmp.to } } : {}),
  };
}

function footerLinks(query: MetricsQuery, result: MetricsOk, rt: ToolRuntime): { links: FooterLink[]; note: string | null } {
  const panel = buildPanelLinks(query, result, rt.lang);
  const links = [...panel.links];
  if (!result.empty) {
    const token = signToken<ExportPayload>('export', rt.ctx.userId, { query: pinned(query, result), lang: rt.lang });
    if (fits(token)) links.push({ kind: 'download', label: pick(rt.lang, 'Pobierz Excel', 'Download Excel'), href: `/api/assistant/export/${token}` });
  }
  return { links, note: missingViewNote(panel.missing, rt.lang) };
}

type Clarification = Extract<MetricsResult, { status: 'needs_clarification' }>;

function clarifyBlock(query: MetricsQuery, result: Clarification, rt: ToolRuntime): ClarifyBlock {
  return {
    type: 'clarify',
    options: result.options.map((option) => {
      // The choice runs as a signed call - the model never re-types the dates.
      const input: MetricsQuery = 'compare' in option
        ? { ...query, period: option.period, compare: option.compare }
        : { ...query, period: option.period };
      const followUp = signFollowUp(rt, { tool: 'query_metrics', input, label: option.label });
      // Without a token the choice is still sent as text and the model re-asks with it.
      return { label: option.label, value: option.label, ...(fits(followUp) ? { followUp } : {}) };
    }),
  };
}

function followUpsBlock(query: MetricsQuery, result: MetricsOk, rt: ToolRuntime): FollowUpsBlock | null {
  const calls = buildFollowUps(query, result, { today: rt.today, lang: rt.lang, scope: scopeKind(rt.ctx) });
  if (calls.length === 0) return null;
  const chips = calls.map((call) => ({ label: call.label, followUp: signFollowUp(rt, call) })).filter((chip) => fits(chip.followUp));
  return chips.length > 0 ? { type: 'followups', question: followUpQuestion(rt.lang), chips } : null;
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
    'compare: for "vs / w porównaniu z / o ile więcej / czy poprawiliśmy się" questions - "previous_period", "same_period_last_year" or a period object; the result holds both values and the change ("comparison.deltas[].text"). Never compute a difference yourself. Not together with group_by. ' +
    'filters.people / filters.clients take ids from find_people / find_clients. group_by + sort + limit give rankings and breakdowns (month / week / quarter = a trend, drawn as a chart). ' +
    'The app shows the tables, a chart, a footer (definitions, period, scope, offer count, analytics panel link, Excel) and follow-up buttons under your text - do not repeat them; quote numbers exactly as given in "text".',
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
      const what = result.question === 'comparison'
        ? pick(rt.lang, 'Okres jeszcze trwa, więc porównanie można rozumieć na kilka sposobów.', 'The period is still running, so the comparison can be meant several ways.')
        : pick(rt.lang, 'Okres jest niejednoznaczny.', 'The period is ambiguous.');
      return {
        result: {
          status: 'needs_clarification',
          options: result.options.map((o) => o.label),
          message: `${what} ${pick(rt.lang, 'Zapytaj jednym zdaniem, o który wariant chodzi - przyciski są już pokazane. Nie wybieraj samodzielnie i nie podawaj liczb.', 'Ask in one sentence which one is meant - buttons are already shown. Do not choose yourself and give no figures.')}`,
        },
        blocks: [clarifyBlock(query, result, rt)],
      };
    }
    if (result.status === 'future_period') {
      return { result: { status: 'future_period', message: pick(rt.lang, `Okres ${result.label} jeszcze nie nastąpił - nie ma danych i nie wolno prognozować.`, `The period ${result.label} has not started yet - there is no data and no forecasting.`) } };
    }
    if (result.status === 'invalid') return { result: { status: 'invalid', message: result.message } };

    const names = await scopedNames(rt, result.applied.filters.people ?? [], result.applied.filters.clients ?? []);
    const { links, note } = footerLinks(query, result, rt);
    const footer = buildMetricsFooter(result, scopeKind(rt.ctx), names, rt.lang, note);
    const graph = chart(result);
    const followUps = followUpsBlock(query, result, rt);

    const blocks: AnswerBlock[] = [
      ...tables(result, rt),
      ...(graph ? [graph] : []),
      { type: 'footer', lines: footer.lines, links },
      ...(followUps ? [followUps] : []),
    ];

    const { applied: _applied, offers: _offers, ...forModel } = result;
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
