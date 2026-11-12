// Server-written footer of every data answer (docs/ai-assistant-plan.md rule 3.5): what was
// counted, for which period, on which date, in whose scope, with which filters and from how many
// offers. The model does not write a word of it, so the definition under a number is always the
// definition the number was computed with.

import type { DateBasis } from '../analytics';
import type { AccessContext } from '../access/types';
import { formatCount, formatDateRange, type Lang } from './format';
import { METRICS, type MetricsOk } from './metrics';

/** How much the asking user sees - the scope every number is limited to (rule 3.9). */
export type ScopeKind = 'all' | 'flow' | 'team' | 'own';

export function scopeKind(ctx: AccessContext): ScopeKind {
  if (ctx.isSuperuser || ctx.memberships.some((m) => m.visibility.seeAllFlows)) return 'all';
  const wholeFlow = ctx.memberships.some(
    (m) => m.visibility.seeAllInFlow || (ctx.orgScopeFallback === 'flow' && (m.visibility.seeBranch || m.visibility.seeRegion))
  );
  if (wholeFlow) return 'flow';
  const team = ctx.memberships.some((m) => m.visibility.seeTeam || m.visibility.seeBranch || m.visibility.seeRegion);
  return team && ctx.teamUserIds.length > 0 ? 'team' : 'own';
}

const SCOPE_TEXT: Record<Lang, Record<ScopeKind, string>> = {
  pl: {
    all: 'wszystkie oferty w aplikacji',
    flow: 'Twój zakres widoczności (cały Twój flow) - to nie jest suma całej firmy',
    team: 'Twój zakres widoczności (Ty i Twój zespół) - to nie jest suma całej firmy',
    own: 'Twój zakres widoczności (tylko Twoje oferty) - to nie jest suma całej firmy',
  },
  en: {
    all: 'all offers in the app',
    flow: 'your visibility scope (your whole flow) - not a company total',
    team: 'your visibility scope (you and your team) - not a company total',
    own: 'your visibility scope (your own offers only) - not a company total',
  },
};

const BASIS_TEXT: Record<Lang, Record<DateBasis, string>> = {
  pl: { created: 'wg daty utworzenia', sent: 'wg daty wysłania', decided: 'wg daty decyzji klienta' },
  en: { created: 'by creation date', sent: 'by sent date', decided: 'by client decision date' },
};

const T = {
  pl: {
    definitions: 'Definicje', period: 'Okres', inProgress: 'okres jeszcze trwa', scope: 'Zakres', filters: 'Filtry',
    offers: 'Uwzględnione oferty', people: 'handlowiec', team: 'mój zespół', clients: 'klient',
    steel: 'typ stali (liczone tylko pasujące pozycje)', status: 'status', decision: 'decyzja klienta',
    versions: 'Oferta z kilkoma wersjami liczy się raz (najnowsza wersja).',
    compared: 'Porównanie z',
    change: 'Zmiana = okres - okres porównawczy; zmiana % liczona od okresu porównawczego (brak, gdy jest w nim 0).',
    margin: (withM: string, all: string) => `marża liczona z ${withM} z ${all} ofert (pozostałe bez zapisanej marży)`,
  },
  en: {
    definitions: 'Definitions', period: 'Period', inProgress: 'period still in progress', scope: 'Scope', filters: 'Filters',
    offers: 'Offers included', people: 'salesperson', team: 'my team', clients: 'client',
    steel: 'steel type (matching line items only)', status: 'status', decision: 'client decision',
    versions: 'An offer with several versions counts once (latest version).',
    compared: 'Compared with',
    change: 'Change = period - comparison period; % change relative to the comparison period (none when it is 0).',
    margin: (withM: string, all: string) => `margin computed from ${withM} of ${all} offers (the rest carry no margin)`,
  },
} as const;

export interface FooterNames {
  /** Names of the people / clients filtered on, resolved inside the user's scope. */
  people: string[];
  clients: string[];
}

export interface AnswerFooter {
  lines: string[];
}

export function buildMetricsFooter(result: MetricsOk, scope: ScopeKind, names: FooterNames, lang: Lang, extraNote?: string | null): AnswerFooter {
  const t = T[lang];
  const lines: string[] = [];

  const metrics = Array.from(new Set([...result.values.map((v) => v.metric), ...(result.lost_reasons ? (['lost_reasons'] as const) : [])]));
  lines.push(`${t.definitions}: ${metrics.map((m) => `${METRICS[m].label[lang]} = ${METRICS[m].definition[lang]}`).join('; ')}.`);

  const range = formatDateRange(result.period.from, result.period.to, lang);
  const period = result.period.label === range ? range : `${result.period.label} (${range})`;
  lines.push(`${t.period}: ${period}${result.period.in_progress ? ` - ${t.inProgress}` : ''}.`);

  lines.push(`${t.scope}: ${SCOPE_TEXT[lang][scope]}.`);

  const f = result.applied.filters;
  const filters: string[] = [];
  if (names.people.length > 0) filters.push(`${t.people}: ${names.people.join(', ')}`);
  else if (f.my_team) filters.push(t.team);
  if (names.clients.length > 0) filters.push(`${t.clients}: ${names.clients.join(', ')}`);
  if (f.steel_types?.length) filters.push(`${t.steel}: ${f.steel_types.join(', ')}`);
  if (f.status?.length) filters.push(`${t.status}: ${f.status.join(', ')}`);
  if (f.decision?.length) filters.push(`${t.decision}: ${f.decision.join(', ')}`);
  if (filters.length > 0) lines.push(`${t.filters}: ${filters.join('; ')}.`);

  const coverage = (rows: MetricsOk['coverage']) =>
    rows
      .map((c) => {
        const base = `${formatCount(c.offers, lang)} (${BASIS_TEXT[lang][c.basis]})`;
        return c.offers_without_margin ? `${base}, ${t.margin(formatCount(c.offers_with_margin ?? 0, lang), formatCount(c.offers, lang))}` : base;
      })
      .join('; ');

  const cmp = result.comparison;
  if (cmp) {
    const cmpRange = formatDateRange(cmp.period.from, cmp.period.to, lang);
    const cmpPeriod = cmp.period.label === cmpRange ? cmpRange : `${cmp.period.label} (${cmpRange})`;
    lines.push(`${t.compared}: ${cmpPeriod}. ${t.change}`);
    lines.push(`${t.offers}: ${result.period.label}: ${coverage(result.coverage)}; ${cmp.period.label}: ${coverage(cmp.coverage)}. ${t.versions}`);
  } else {
    lines.push(`${t.offers}: ${coverage(result.coverage)}. ${t.versions}`);
  }
  if (extraNote) lines.push(extraNote);

  return { lines };
}
