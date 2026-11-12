// The assistant's metric catalog and query schema (docs/ai-assistant-plan.md 3.2): every metric
// the model may ask for, with its ONE definition, date basis and unit. A leaf module - the engine
// that computes the figures is lib/assistant/metrics.ts, which re-exports all of this.

import { z } from 'zod';
import {
  CLIENT_DECISIONS,
  DATE_BASES,
  OFFER_STATUSES,
  STEEL_TYPE_SERIES_ORDER,
  type AnalyticsKpi,
  type ClientDecision,
  type DateBasis,
  type Granularity,
  type OfferStatus,
} from '../analytics';
import type { SteelType } from '../calculatorData';
import { compareInputSchema } from './compare';
import type { Lang } from './format';
import { periodInputSchema } from './periods';

// --- catalog --------------------------------------------------------------------------

export type Unit = 'count' | 'tons' | 'money' | 'money_eur' | 'percent1' | 'percent2' | 'table';

export interface MetricDef {
  /** Fixed date basis, or 'param' when the question's verb decides (plan 3.2). */
  basis: DateBasis | 'param';
  unit: Unit;
  label: Record<Lang, string>;
  /** One-sentence definition for the server-written footer. */
  definition: Record<Lang, string>;
  pick: (kpi: AnalyticsKpi) => { value: number | null; valuePln?: number | null };
}

const def = (
  basis: MetricDef['basis'],
  unit: Unit,
  label: [string, string],
  definition: [string, string],
  pick: MetricDef['pick']
): MetricDef => ({ basis, unit, label: { pl: label[0], en: label[1] }, definition: { pl: definition[0], en: definition[1] }, pick });

export const METRICS = {
  offers_created: def('created', 'count', ['Utworzone oferty', 'Offers created'],
    ['oferty wg daty utworzenia (najnowsza wersja)', 'offers by creation date (latest version)'], (k) => ({ value: k.offers })),
  offers_sent: def('sent', 'count', ['Wysłane oferty', 'Offers sent'],
    ['oferty wysłane do klienta, wg daty wysłania', 'offers sent to the client, by sent date'], (k) => ({ value: k.offers })),
  offers_won: def('decided', 'count', ['Wygrane oferty', 'Offers won'],
    ['oferty wygrane, wg daty decyzji klienta', 'offers won, by client decision date'], (k) => ({ value: k.offersWon })),
  offers_lost: def('decided', 'count', ['Przegrane oferty', 'Offers lost'],
    ['oferty przegrane, wg daty decyzji klienta', 'offers lost, by client decision date'], (k) => ({ value: k.offersLost })),
  offers_pending: def('created', 'count', ['Oferty bez decyzji', 'Offers without a decision'],
    ['oferty bez decyzji klienta (także jeszcze niewysłane), wg daty utworzenia', 'offers with no client decision yet (incl. not yet sent), by creation date'],
    (k) => ({ value: k.offersPending })),
  tons_offered: def('param', 'tons', ['Tonaż ofert', 'Tons offered'],
    ['suma ton z ofert', 'total tonnage of offers'], (k) => ({ value: k.tonsOffered })),
  tons_won: def('decided', 'tons', ['Sprzedany tonaż', 'Tons won'],
    ['tonaż ofert wygranych ("sprzedane"), wg daty decyzji klienta', 'tonnage of won offers ("sold"), by client decision date'], (k) => ({ value: k.tonsWon })),
  tons_lost: def('decided', 'tons', ['Przegrany tonaż', 'Tons lost'],
    ['tonaż ofert przegranych, wg daty decyzji klienta', 'tonnage of lost offers, by client decision date'], (k) => ({ value: k.tonsLost })),
  value_offered: def('param', 'money', ['Wartość ofert', 'Value offered'],
    ['wartość ofert; EUR to źródło, PLN wg zamrożonego kursu każdej oferty', "value of offers; EUR is the source, PLN by each offer's frozen rate"],
    (k) => ({ value: k.valueOfferedEur, valuePln: k.valueOfferedPln })),
  value_won: def('decided', 'money', ['Wartość sprzedaży', 'Value won'],
    ['wartość ofert wygranych, wg daty decyzji klienta; PLN wg zamrożonego kursu oferty', "value of won offers, by client decision date; PLN by the offer's frozen rate"],
    (k) => ({ value: k.valueWonEur, valuePln: k.valueWonPln })),
  value_lost: def('decided', 'money', ['Wartość przegranych ofert', 'Value lost'],
    ['wartość ofert przegranych, wg daty decyzji klienta; PLN wg zamrożonego kursu oferty', "value of lost offers, by client decision date; PLN by the offer's frozen rate"],
    (k) => ({ value: k.valueLostEur, valuePln: k.valueLostPln })),
  clients_offered: def('param', 'count', ['Klienci z ofertą', 'Clients offered'],
    ['liczba różnych klientów z co najmniej jedną ofertą', 'distinct clients with at least one offer'], (k) => ({ value: k.clients })),
  clients_won: def('decided', 'count', ['Klienci z wygraną ofertą', 'Clients won'],
    ['liczba różnych klientów z wygraną ofertą, wg daty decyzji', 'distinct clients with a won offer, by decision date'], (k) => ({ value: k.clientsWon })),
  clients_lost: def('decided', 'count', ['Klienci z przegraną ofertą', 'Clients lost'],
    ['liczba różnych klientów z przegraną ofertą, wg daty decyzji', 'distinct clients with a lost offer, by decision date'], (k) => ({ value: k.clientsLost })),
  win_rate_offers: def('decided', 'percent1', ['Skuteczność (oferty)', 'Win rate (offers)'],
    ['wygrane / (wygrane + przegrane) oferty, wg daty decyzji', 'won / (won + lost) offers, by decision date'], (k) => ({ value: k.winRateOffers })),
  win_rate_tons: def('decided', 'percent1', ['Skuteczność (tony)', 'Win rate (tons)'],
    ['wygrane / (wygrane + przegrane) tony, wg daty decyzji', 'won / (won + lost) tons, by decision date'], (k) => ({ value: k.winRateTons })),
  margin_weighted: def('param', 'percent2', ['Marża ważona tonażem', 'Tonnage-weighted margin'],
    ['średnia marża ważona tonażem (jak w panelu analizy)', 'tonnage-weighted average margin (as in the analytics panel)'], (k) => ({ value: k.avgMarginPct })),
  margin_simple: def('param', 'percent2', ['Marża średnia na ofertę', 'Simple average margin'],
    ['zwykła średnia marż ofert (każda oferta waży tyle samo)', 'plain average of per-offer margins (every offer weighs the same)'],
    (k) => ({ value: k.avgMarginSimplePct })),
  avg_tons_per_offer: def('param', 'tons', ['Średni tonaż oferty', 'Average tons per offer'],
    ['tonaż ofert / liczba ofert', 'tonnage of offers / number of offers'], (k) => ({ value: k.avgTonsPerOffer })),
  avg_value_per_offer: def('param', 'money_eur', ['Średnia wartość oferty', 'Average value per offer'],
    ['wartość ofert w EUR / liczba ofert', 'value of offers in EUR / number of offers'], (k) => ({ value: k.avgValuePerOfferEur })),
  lost_reasons: def('decided', 'table', ['Powody przegranej', 'Lost reasons'],
    ['przegrane oferty wg powodu z listy aplikacji, udział = % przegranych ofert', "lost offers by the reason from the app's list, share = % of lost offers"],
    () => ({ value: null })),
} as const satisfies Record<string, MetricDef>;

export type MetricId = keyof typeof METRICS;
export const METRIC_IDS = Object.keys(METRICS) as [MetricId, ...MetricId[]];

export const MARGIN_METRICS: readonly MetricId[] = ['margin_weighted', 'margin_simple'];
/** Basis of a 'param' metric when the model gives none: the offer went out to a client. */
export const DEFAULT_PARAM_BASIS: DateBasis = 'sent';

// --- query schema ---------------------------------------------------------------------

export const GROUP_DIMENSIONS = ['person', 'client', 'steel_type', 'status', 'decision', 'month', 'week', 'quarter'] as const;
export type GroupDimension = (typeof GROUP_DIMENSIONS)[number];

export const TIME_GRANULARITY: Partial<Record<GroupDimension, Granularity>> = { month: 'month', week: 'week', quarter: 'quarter' };

const idList = z.array(z.number().int().positive()).max(50);

export const metricsFiltersSchema = z
  .object({
    people: idList.optional(),
    /** The asking user plus everyone sharing a team with them. */
    my_team: z.boolean().optional(),
    clients: idList.optional(),
    steel_types: z.array(z.enum(STEEL_TYPE_SERIES_ORDER as [SteelType, ...SteelType[]])).optional(),
    status: z.array(z.enum(OFFER_STATUSES as [OfferStatus, ...OfferStatus[]])).optional(),
    decision: z.array(z.enum(CLIENT_DECISIONS as [ClientDecision, ...ClientDecision[]])).optional(),
  })
  .strict();

export type MetricsFilters = z.infer<typeof metricsFiltersSchema>;

export const metricsQuerySchema = z
  .object({
    metrics: z.array(z.enum(METRIC_IDS)).min(1).max(8),
    period: periodInputSchema,
    basis: z.enum(DATE_BASES as [DateBasis, ...DateBasis[]]).optional(),
    filters: metricsFiltersSchema.optional(),
    group_by: z.enum(GROUP_DIMENSIONS).optional(),
    /** Second window; the server computes the change (plan 3.3). Not combined with group_by. */
    compare: compareInputSchema.optional(),
    sort: z.enum(['desc', 'asc']).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export type MetricsQuery = z.infer<typeof metricsQuerySchema>;
