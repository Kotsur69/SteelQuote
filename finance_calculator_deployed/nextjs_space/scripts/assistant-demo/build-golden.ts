// Builds tests/assistant/golden.json - the golden question set of the AI assistant
// (docs/ai-assistant-plan.md section 12.5). Questions are written here by hand; every expected
// NUMBER is computed by oracle.ts from the demo spec, never typed in.
//
// Run: npx tsx scripts/assistant-demo/build-golden.ts
// Relative periods ("w zeszłym miesiącu") resolve against SPEC_TODAY = 2026-11-09; the eval
// must run the assistant with that date injected as "today".

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPEC_TODAY, type SteelType } from './spec';
import { grouped, lostReasons, personName, rows, select, totals, type Basis, type GroupBy, type OracleFilters, type Row, type Totals } from './oracle';
import { askerByKey } from './visibility';
import { nonNumericCases } from './golden-behaviour';
import type { GoldenCase, Group } from './golden-types';

// --- periods (resolved against SPEC_TODAY) ---------------------------------------------

const P = {
  lastMonth: { from: '2026-10-01', to: '2026-10-31', label: 'lastMonth' },
  thisMonth: { from: '2026-11-01', to: SPEC_TODAY, label: 'thisMonth' },
  sep2026: { from: '2026-09-01', to: '2026-09-30', label: '2026-09' },
  nov2025: { from: '2025-11-01', to: '2025-11-30', label: '2025-11' },
  oct2025: { from: '2025-10-01', to: '2025-10-31', label: '2025-10' },
  q3: { from: '2026-07-01', to: '2026-09-30', label: '2026-Q3' },
  q2: { from: '2026-04-01', to: '2026-06-30', label: '2026-Q2' },
  ytd: { from: '2026-01-01', to: SPEC_TODAY, label: 'thisYear' },
  y2025: { from: '2025-01-01', to: '2025-12-31', label: '2025' },
  last30: { from: '2026-10-11', to: SPEC_TODAY, label: 'last30days' },
} as const;
type Period = (typeof P)[keyof typeof P];

// --- metric -> numbers ---------------------------------------------------------------

type Metric =
  | 'offers_created' | 'offers_sent' | 'offers_won' | 'offers_lost' | 'tons_offered' | 'tons_won'
  | 'tons_lost' | 'value_offered' | 'value_won' | 'value_lost' | 'clients_offered'
  | 'win_rate_offers' | 'win_rate_tons' | 'margin' | 'avg_tons_per_offer' | 'lost_reasons';

const BASIS: Record<Metric, Basis | null> = {
  offers_created: 'created', offers_sent: 'sent', offers_won: 'decided', offers_lost: 'decided',
  tons_offered: null, tons_won: 'decided', tons_lost: 'decided', value_offered: null,
  value_won: 'decided', value_lost: 'decided', clients_offered: null, win_rate_offers: 'decided',
  win_rate_tons: 'decided', margin: null, avg_tons_per_offer: null, lost_reasons: 'decided',
};

function numbersOf(metric: Metric, t: Totals): Record<string, number | null> {
  switch (metric) {
    case 'offers_created': case 'offers_sent': return { offers: t.offers };
    case 'offers_won': return { won: t.won };
    case 'offers_lost': return { lost: t.lost };
    case 'tons_offered': return { tons: t.tons };
    case 'tons_won': return { tonsWon: t.tonsWon };
    case 'tons_lost': return { tonsLost: t.tonsLost };
    case 'value_offered': return { valueEur: t.valueEur, valuePln: t.valuePln };
    case 'value_won': return { valueWonEur: t.valueWonEur, valueWonPln: t.valueWonPln };
    case 'value_lost': return { valueLostEur: t.valueLostEur, valueLostPln: t.valueLostPln };
    case 'clients_offered': return { clients: t.clients };
    case 'win_rate_offers': return { winRateOffers: t.winRateOffers };
    case 'win_rate_tons': return { winRateTons: t.winRateTons };
    case 'margin': return { marginWeighted: t.marginWeighted, marginSimple: t.marginSimple, offersWithMargin: t.offersWithMargin, offers: t.offers };
    case 'avg_tons_per_offer': return { avgTons: t.offers > 0 ? Math.round((t.tons / t.offers) * 1000) / 1000 : null };
    case 'lost_reasons': return { lost: t.lost };
  }
}

interface AggSpec {
  asker: string;
  q: string;
  lang?: 'pl' | 'en';
  metrics: Metric[];
  period: Period;
  /** Required when no metric fixes the basis (tons / value / clients / margin). */
  basis?: Basis;
  filters?: OracleFilters;
  note?: string;
}

function basisOf(spec: AggSpec): Basis {
  const fixed = spec.metrics.map((m) => BASIS[m]).find((b) => b !== null);
  const basis = spec.basis ?? fixed;
  if (!basis) throw new Error(`No basis for "${spec.q}"`);
  return basis;
}

const params = (spec: AggSpec, basis: Basis, extra: Record<string, unknown> = {}) => ({
  metrics: spec.metrics, period: spec.period.label, basis, filters: spec.filters ?? {}, ...extra,
});

function aggregate(id: string, spec: AggSpec): GoldenCase {
  const basis = basisOf(spec);
  const selected = select(askerByKey(spec.asker), { basis, from: spec.period.from, to: spec.period.to, filters: spec.filters });
  const t = totals(selected);
  const numbers: Record<string, number | null> = Object.assign({}, ...spec.metrics.map((m) => numbersOf(m, t)));
  if (spec.metrics.includes('lost_reasons')) {
    for (const r of lostReasons(selected)) {
      numbers[`reason.${r.reason}.offers`] = r.offers;
      numbers[`reason.${r.reason}.sharePct`] = r.sharePct;
    }
  }
  return {
    id, group: 'aggregate', lang: spec.lang ?? 'pl', asker: spec.asker, question: spec.q,
    expect: { behavior: 'answer', tool: 'query_metrics', params: params(spec, basis), numbers, note: spec.note },
  };
}

function comparison(id: string, spec: AggSpec & { against: Period; field: keyof Totals }): GoldenCase {
  const basis = basisOf(spec);
  const asker = askerByKey(spec.asker);
  const value = (p: Period) => totals(select(asker, { basis, from: p.from, to: p.to, filters: spec.filters }))[spec.field] as number | null;
  const cur = value(spec.period);
  const prev = value(spec.against);
  const deltaAbs = cur !== null && prev !== null ? Math.round((cur - prev) * 1000) / 1000 : null;
  // null when the base is 0 - never "infinity %" (plan 3.3).
  const deltaPct = cur !== null && prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;
  return {
    id, group: 'comparison', lang: spec.lang ?? 'pl', asker: spec.asker, question: spec.q,
    expect: {
      behavior: 'answer', tool: 'query_metrics', params: params(spec, basis, { compare: spec.against.label }),
      numbers: { current: cur, previous: prev, deltaAbs, deltaPct }, note: spec.note,
    },
  };
}

function ranking(id: string, spec: AggSpec & { by: GroupBy; field: keyof Totals; top: number }): GoldenCase {
  const basis = basisOf(spec);
  const selected = select(askerByKey(spec.asker), { basis, from: spec.period.from, to: spec.period.to, filters: spec.filters });
  const ranked = grouped(selected, spec.by, basis)
    .map((g) => ({ key: g.key, value: g.totals[spec.field] as number | null }))
    .filter((g) => g.value !== null)
    .sort((a, b) => (b.value as number) - (a.value as number) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, spec.top);
  const label = (k: string) => (spec.by === 'person' ? personName(k) : k);
  return {
    id, group: 'ranking', lang: spec.lang ?? 'pl', asker: spec.asker, question: spec.q,
    expect: {
      behavior: 'answer', tool: 'query_metrics',
      params: params(spec, basis, { group_by: spec.by, sort: 'desc', limit: spec.top }),
      numbers: Object.fromEntries(ranked.map((r, i) => [`${i + 1}.${label(r.key)}`, r.value])),
    },
  };
}

const idOf = (key: string): number => {
  const row = rows().find((r) => r.key === key);
  if (!row) throw new Error(`Unknown offer key ${key}`);
  return row.id;
};
const idsWhere = (asker: string, pred: (r: Row) => boolean) =>
  select(askerByKey(asker), { basis: 'created', from: '2000-01-01', to: SPEC_TODAY }).filter(pred).map((r) => r.id);
const decidedIn = (r: Row, from: string, to: string) => !!r.decided && r.decided >= from && r.decided <= to;

const HDG: SteelType[] = ['HDG'];

function build(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  const nextId = (prefix: string) => `${prefix}-${String(cases.length + 1).padStart(3, '0')}`;
  const agg = (spec: AggSpec) => cases.push(aggregate(nextId('agg'), spec));
  const cmp = (spec: Parameters<typeof comparison>[1]) => cases.push(comparison(nextId('cmp'), spec));
  const rank = (spec: Parameters<typeof ranking>[1]) => cases.push(ranking(nextId('rank'), spec));
  const lk = (asker: string, q: string, tool: string, p: Record<string, unknown>, ids: number[], lang: 'pl' | 'en' = 'pl') =>
    cases.push({ id: nextId('look'), group: 'lookup' as Group, lang, asker, question: q, expect: { behavior: 'answer', tool, params: p, offerIds: ids } });

  // --- 30 aggregates
  agg({ asker: 'admin', q: 'Ile ofert wysłaliśmy w listopadzie 2025?', metrics: ['offers_sent'], period: P.nov2025 });
  agg({ asker: 'admin', q: 'ile ofert wyslalismy w zeszlym miesiacu', metrics: ['offers_sent'], period: P.lastMonth, note: 'no diacritics' });
  agg({ asker: 'admin', q: 'Ile ton sprzedał Marek Nowak w październiku?', metrics: ['tons_won'], period: P.lastMonth, filters: { people: ['marekN'] } });
  agg({ asker: 'admin', q: 'Ilu klientów dostało ofertę od Anny Kowalskiej w zeszłym miesiącu?', metrics: ['clients_offered'], basis: 'sent', period: P.lastMonth, filters: { people: ['anna'] }, note: 'declined name "Anny Kowalskiej"' });
  agg({ asker: 'admin', q: 'Jaka jest średnia marża Marka Nowaka w tym roku?', metrics: ['margin'], basis: 'sent', period: P.ytd, filters: { people: ['marekN'] }, note: 'D4: weighted headline + simple average' });
  agg({ asker: 'admin', q: 'Ile ofert przegraliśmy w październiku i dlaczego?', metrics: ['offers_lost', 'tons_lost', 'value_lost', 'lost_reasons'], period: P.lastMonth, note: 'plan 6.1 worked example; includes a02 lost at 00:10 on 1 Nov -> November, not October' });
  agg({ asker: 'admin', q: 'Jaka jest wartość sprzedaży w III kwartale?', metrics: ['value_won'], period: P.q3 });
  agg({ asker: 'admin', q: 'Ile ofert zrobiliśmy od początku roku?', metrics: ['offers_created'], period: P.ytd, note: 'created basis uses the latest version date (a03 counts once)' });
  agg({ asker: 'admin', q: 'Jaki mamy współczynnik wygranych w 2025?', metrics: ['win_rate_offers', 'win_rate_tons'], period: P.y2025 });
  agg({ asker: 'admin', q: 'Ile ton ocynku sprzedaliśmy w tym roku?', metrics: ['tons_won'], period: P.ytd, filters: { steelTypes: HDG }, note: 'HDG item-level filter on mixed offers' });
  agg({ asker: 'admin', q: 'Ile ofert wygraliśmy we wrześniu 2026?', metrics: ['offers_won'], period: P.sep2026 });
  agg({ asker: 'admin', q: 'Jaka była wartość ofert wysłanych w październiku 2025?', metrics: ['value_offered'], basis: 'sent', period: P.oct2025 });
  agg({ asker: 'admin', q: 'Ile ton zaoferowaliśmy klientowi Profilex w tym roku?', metrics: ['tons_offered'], basis: 'sent', period: P.ytd, filters: { clients: ['profilex'] }, note: 'client name without legal suffix' });
  agg({ asker: 'admin', q: 'Ile ofert dla Żurawca wygraliśmy w tym roku?', metrics: ['offers_won'], period: P.ytd, filters: { clients: ['zurawiec'] }, note: 'declined client name; a03 = 3 versions counted once' });
  agg({ asker: 'admin', q: 'Ile ton przegraliśmy w ostatnich 30 dniach?', metrics: ['tons_lost'], period: P.last30 });
  agg({ asker: 'admin', q: 'Średnia wielkość oferty w III kwartale?', metrics: ['avg_tons_per_offer'], basis: 'created', period: P.q3 });
  agg({ asker: 'admin', q: 'Ile ofert stworzył Łukasz Żak w tym roku?', metrics: ['offers_created'], period: P.ytd, filters: { people: ['lukasz'] } });
  agg({ asker: 'admin', q: 'ile ofert wyslal lukasz zak w tym roku', metrics: ['offers_sent'], period: P.ytd, filters: { people: ['lukasz'] }, note: 'no diacritics in a person name' });
  agg({ asker: 'admin', q: 'Ile Katarzyna Wąsik sprzedała w tym roku?', metrics: ['tons_won', 'value_won', 'offers_won'], period: P.ytd, filters: { people: ['kasia'] }, note: '3.8: no unit -> tons + value + count' });
  agg({ asker: 'admin', q: 'Ile ofert wysłaliśmy w tym miesiącu?', metrics: ['offers_sent'], period: P.thisMonth, note: 'month to date, single period -> no clarification' });
  agg({ asker: 'marekN', q: 'Ile ofert wysłałem w zeszłym miesiącu?', metrics: ['offers_sent'], period: P.lastMonth, filters: { people: ['marekN'] }, note: '"ja" = asker' });
  agg({ asker: 'marekN', q: 'Moja średnia marża w III kwartale?', metrics: ['margin'], basis: 'sent', period: P.q3, filters: { people: ['marekN'] } });
  agg({ asker: 'marekN', q: 'Ile ofert wysłała cała firma w październiku?', metrics: ['offers_sent'], period: P.lastMonth, note: 'answer = visible scope (team), footer must say it is not a company total' });
  agg({ asker: 'adam', q: 'Ile ton sprzedał mój zespół w tym roku?', metrics: ['tons_won'], period: P.ytd });
  agg({ asker: 'adam', q: 'Jaki jest win rate zespołu w III kwartale?', metrics: ['win_rate_offers'], period: P.q3 });
  agg({ asker: 'hanna', q: 'Ile ofert przegraliśmy w tym roku i z jakich powodów?', metrics: ['offers_lost', 'lost_reasons'], period: P.ytd, note: 'HoC scope = all of Flow 1' });
  agg({ asker: 'kasia', q: 'Ile ton zaoferowałam w II kwartale?', metrics: ['tons_offered'], basis: 'sent', period: P.q2 });
  agg({ asker: 'celina', lang: 'en', q: 'How many offers did we win last month?', metrics: ['offers_won'], period: P.lastMonth });
  agg({ asker: 'celina', lang: 'en', q: 'What was the total value of offers sent in Q3?', metrics: ['value_offered'], basis: 'sent', period: P.q3 });
  agg({ asker: 'celina', lang: 'en', q: "What's the weighted average margin this year?", metrics: ['margin'], basis: 'sent', period: P.ytd });

  // --- 15 comparisons (11 answered, 4 must ask: incomplete current period, D12)
  cmp({ asker: 'admin', q: 'O ile więcej ofert wysłaliśmy w październiku niż we wrześniu?', metrics: ['offers_sent'], period: P.lastMonth, against: P.sep2026, field: 'offers' });
  cmp({ asker: 'admin', q: 'Porównaj sprzedaż ton w październiku z wrześniem.', metrics: ['tons_won'], period: P.lastMonth, against: P.sep2026, field: 'tonsWon' });
  cmp({ asker: 'admin', q: 'Czy w październiku 2026 wysłaliśmy więcej ofert niż w październiku 2025?', metrics: ['offers_sent'], period: P.lastMonth, against: P.oct2025, field: 'offers' });
  cmp({ asker: 'admin', q: 'Jak zmieniła się wartość wygranych ofert: III kwartał vs II kwartał?', metrics: ['value_won'], period: P.q3, against: P.q2, field: 'valueWonEur' });
  cmp({ asker: 'admin', q: 'Marża ważona w III kwartale w porównaniu z II kwartałem?', metrics: ['margin'], basis: 'sent', period: P.q3, against: P.q2, field: 'marginWeighted' });
  cmp({ asker: 'admin', q: 'Win rate w październiku vs wrzesień?', metrics: ['win_rate_offers'], period: P.lastMonth, against: P.sep2026, field: 'winRateOffers' });
  cmp({ asker: 'marekN', q: 'O ile poprawiłem się w październiku względem września pod względem wysłanych ofert?', metrics: ['offers_sent'], period: P.lastMonth, against: P.sep2026, field: 'offers', filters: { people: ['marekN'] } });
  cmp({ asker: 'adam', q: 'Tonaż wygrany przez zespół: październik vs wrzesień.', metrics: ['tons_won'], period: P.lastMonth, against: P.sep2026, field: 'tonsWon' });
  cmp({ asker: 'admin', q: 'Ile ofert stworzyliśmy w listopadzie 2025 w porównaniu z październikiem 2025?', metrics: ['offers_created'], period: P.nov2025, against: P.oct2025, field: 'offers' });
  cmp({ asker: 'celina', lang: 'en', q: 'Compare tons won in Q3 with Q2.', metrics: ['tons_won'], period: P.q3, against: P.q2, field: 'tonsWon' });
  cmp({ asker: 'admin', q: 'Przegrane oferty: październik 2026 vs październik 2025.', metrics: ['offers_lost'], period: P.lastMonth, against: P.oct2025, field: 'lost' });
  for (const [q, lang] of [
    ['O ile poprawiliśmy się względem poprzedniego miesiąca?', 'pl'],
    ['Porównaj ten miesiąc z zeszłym pod względem wysłanych ofert.', 'pl'],
    ['Czy w tym miesiącu sprzedajemy więcej niż w październiku?', 'pl'],
    ['How are we doing this month compared to last month?', 'en'],
  ] as const) {
    cases.push({
      id: nextId('cmp'), group: 'comparison', lang, asker: 'admin', question: q,
      expect: {
        behavior: 'clarify', tool: 'query_metrics',
        options: ['1-9 lis vs 1-9 paź', 'listopad do dziś vs cały październik', 'październik vs wrzesień'],
        note: 'D12: current period incomplete on 2026-11-09 -> always ask',
      },
    });
  }

  // --- 10 rankings
  rank({ asker: 'admin', q: 'Kto sprzedał najwięcej ton w październiku?', metrics: ['tons_won'], period: P.lastMonth, by: 'person', field: 'tonsWon', top: 3 });
  rank({ asker: 'admin', q: 'Top 5 klientów po wygranym tonażu w tym roku.', metrics: ['tons_won'], period: P.ytd, by: 'client', field: 'tonsWon', top: 5 });
  rank({ asker: 'admin', q: 'Który handlowiec wysłał najwięcej ofert w III kwartale?', metrics: ['offers_sent'], period: P.q3, by: 'person', field: 'offers', top: 3 });
  rank({ asker: 'admin', q: 'Ranking handlowców po wartości sprzedaży w 2025.', metrics: ['value_won'], period: P.y2025, by: 'person', field: 'valueWonEur', top: 6 });
  rank({ asker: 'admin', q: 'Który typ stali sprzedaje się najlepiej w tym roku (tony)?', metrics: ['tons_won'], period: P.ytd, by: 'steel_type', field: 'tonsWon', top: 6 });
  rank({ asker: 'admin', q: 'Którzy klienci dostali od nas najwięcej ofert w tym roku?', metrics: ['offers_sent'], period: P.ytd, by: 'client', field: 'offers', top: 3 });
  rank({ asker: 'adam', q: 'Kto w moim zespole ma najwyższą marżę w tym roku?', metrics: ['margin'], basis: 'sent', period: P.ytd, by: 'person', field: 'marginWeighted', top: 3 });
  rank({ asker: 'adam', q: 'Kto z zespołu przegrał najwięcej ofert w tym roku?', metrics: ['offers_lost'], period: P.ytd, by: 'person', field: 'lost', top: 3 });
  rank({ asker: 'hanna', q: 'Tonaż wygrany miesiąc po miesiącu w 2026 - który miesiąc był najlepszy?', metrics: ['tons_won'], period: P.ytd, by: 'month', field: 'tonsWon', top: 3, note: 'group_by month on the decided date' });
  rank({ asker: 'celina', lang: 'en', q: 'Who are our top 3 salespeople by tons won this year?', metrics: ['tons_won'], period: P.ytd, by: 'person', field: 'tonsWon', top: 3 });

  // --- 15 lookups / single offer / queues
  lk('admin', 'Pokaż oferty dla Wąsik Metal czekające na akceptację.', 'search_offers', { clients: ['wasikMetal'], status: ['pending_review'] }, idsWhere('admin', (r) => r.client === 'wasikMetal' && r.status === 'pending_review'));
  lk('admin', `Jaki jest status offer_${idOf('a03')}?`, 'get_offer', { offer_id: idOf('a03') }, [idOf('a03')]);
  lk('admin', `Dlaczego offer_${idOf('a02')} została przegrana?`, 'get_offer', { offer_id: idOf('a02') }, [idOf('a02')]);
  lk('marekN', 'Co mam do wysłania?', 'my_queue', { kind: 'to_send' }, idsWhere('marekN', (r) => r.owner === 'marekN' && r.status === 'approved'));
  lk('marekN', 'Które moje oferty czekają na akceptację?', 'my_queue', { kind: 'waiting_for_approval' }, idsWhere('marekN', (r) => r.owner === 'marekN' && r.status === 'pending_review'));
  lk('marekN', 'Które moje oferty zostały odrzucone i trzeba je poprawić?', 'my_queue', { kind: 'rejected_to_fix' }, idsWhere('marekN', (r) => r.owner === 'marekN' && r.status === 'rejected'));
  lk('adam', 'Co czeka na moją decyzję?', 'my_queue', { kind: 'awaiting_my_decision' }, [idOf('a04')]);
  lk('admin', 'Pokaż wygrane oferty Anny z października.', 'search_offers', { people: ['anna'], decision: ['won'], period: 'lastMonth', basis: 'decided' }, idsWhere('admin', (r) => r.owner === 'anna' && r.decision === 'won' && decidedIn(r, '2026-10-01', '2026-10-31')));
  lk('admin', 'Oferty dla Profilexu z tego miesiąca.', 'search_offers', { clients: ['profilex'], period: 'thisMonth', basis: 'created' }, idsWhere('admin', (r) => r.client === 'profilex' && r.created >= '2026-11-01'));
  lk('admin', 'Pokaż oferty Kęty-Blach.', 'search_offers', { clients: ['kety'] }, idsWhere('admin', (r) => r.client === 'kety').slice(0, 20));
  lk('admin', 'pokaz oferty dla slezy stal', 'search_offers', { clients: ['sleza'] }, idsWhere('admin', (r) => r.client === 'sleza').slice(0, 20));
  lk('admin', `Ile wersji ma offer_${idOf('a03')} i co się zmieniało?`, 'get_offer', { offer_id: idOf('a03') }, [idOf('a03')]);
  lk('kasia', 'Kto blokuje moją ofertę dla Wąsik Metal?', 'my_queue', { kind: 'waiting_for_approval' }, [idOf('a05')]);
  lk('admin', 'Oferty Marka Wiśniewskiego dla Marek-Stal.', 'search_offers', { people: ['marekW'], clients: ['marekStal'] }, idsWhere('admin', (r) => r.owner === 'marekW' && r.client === 'marekStal'));
  lk('celina', 'Show me the lost offers from October.', 'search_offers', { decision: ['lost'], period: 'lastMonth', basis: 'decided' }, idsWhere('celina', (r) => r.decision === 'lost' && decidedIn(r, '2026-10-01', '2026-10-31')), 'en');

  // --- knowledge, ambiguity, out of scope, permission, injection, actions
  for (const c of nonNumericCases(idOf)) cases.push({ ...c, id: nextId(c.id) });
  return cases;
}

const cases = build();
const outDir = join(__dirname, '..', '..', 'tests', 'assistant');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'golden.json'),
  `${JSON.stringify({ today: SPEC_TODAY, generatedBy: 'scripts/assistant-demo/build-golden.ts', cases }, null, 2)}\n`
);
const byGroup = cases.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.group]: (acc[c.group] ?? 0) + 1 }), {});
const pl = cases.filter((c) => c.lang === 'pl').length;
process.stdout.write(`golden.json: ${cases.length} cases, ${Math.round((pl / cases.length) * 100)}% PL, ${JSON.stringify(byGroup)}\n`);
