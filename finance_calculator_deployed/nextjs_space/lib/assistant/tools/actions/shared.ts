// Shared parts of the propose_* tools (docs/ai-assistant-plan.md section 7): the offer summary on
// a card, the priced-lines table, and turning a checked proposal into a stored pending action +
// confirmation card. A propose tool NEVER changes offer data - it only writes ai_pending_actions.

import type { OfferAccess } from '../../../access/offerAccess';
import { offerRate, type OfferCurrencyMeta } from '../../../currency';
import type { ActionCardBlock, TableBlock } from '../../blocks';
import type { ClientDecision } from '../../../analytics';
import { formatMoney, formatNumber, formatPercent, formatTons, type Lang } from '../../format';
import type { AnyAction } from '../../actions/kinds';
import { ActionsNotConfiguredError, createPendingAction } from '../../actions/pending';
import { decisionLabel, statusLabel } from '../offers';
import { pick, type ToolOutput, type ToolRuntime } from '../types';

type Item = {
  type?: unknown; grade?: unknown; thickness?: unknown; width?: unknown; length?: unknown; isCoil?: unknown;
  tons?: unknown; finalPrice?: unknown; totalValue?: unknown; inputs?: { marginPct?: unknown } | null;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number.parseFloat(String(v)) || 0);

export const offerHref = (id: number): string => `/calculator?edit=${id}&from=offers`;

export function itemsOf(offerData: unknown): Item[] {
  const list = (offerData as { zestawienie?: unknown } | null)?.zestawienie;
  return Array.isArray(list) ? (list as Item[]) : [];
}

export function itemLabel(it: Item, lang: Lang): string {
  const length = num(it.length);
  const dims = `${formatNumber(num(it.thickness), 2, lang)} x ${formatNumber(num(it.width), 0, lang)}` +
    (it.isCoil === true || length === 0 ? pick(lang, ' krąg', ' coil') : ` x ${formatNumber(length, 0, lang)}`);
  // One unbreakable group: a narrow cell must not wrap "1 500" into "1" / "500".
  return `${String(it.type ?? '')} ${String(it.grade ?? '')} ${dims.replace(/ /g, '\u00a0')}`;
}

/** Tons, value EUR and value PLN at the offer's frozen rate - summed from the stored lines. */
export function offerTotals(offerData: unknown, lang: Lang): { tons: string; value: string } {
  const items = itemsOf(offerData);
  const tons = items.reduce((s, it) => s + num(it.tons), 0);
  const eur = items.reduce((s, it) => s + num(it.totalValue), 0);
  const rate = offerRate(offerData as OfferCurrencyMeta | null);
  return { tons: formatTons(tons, lang), value: `${formatMoney(eur, 'EUR', lang)} (${formatMoney(eur * rate, 'PLN', lang)})` };
}

/** Lines of an offer as the card shows them: what, tons, price per ton, margin, value. */
export function linesTable(offerData: unknown, lang: Lang, title?: string): TableBlock {
  return {
    type: 'table',
    ...(title ? { title } : {}),
    columns: [pick(lang, 'Pozycja', 'Line'), pick(lang, 'Tony', 'Tons'), pick(lang, 'Cena', 'Price'), pick(lang, 'Marża', 'Margin'), pick(lang, 'Wartość', 'Value')],
    rows: itemsOf(offerData).map((it) => [
      itemLabel(it, lang),
      formatTons(num(it.tons), lang),
      `${formatMoney(num(it.finalPrice), 'EUR', lang)}/t`,
      typeof it.inputs?.marginPct === 'number' ? formatPercent(it.inputs.marginPct, 2, lang) : '-',
      formatMoney(num(it.totalValue), 'EUR', lang),
    ]),
  };
}

export interface OfferMeta {
  name: string;
  owner: string | null;
  client: string | null;
}

export async function offerMeta(rt: ToolRuntime, offerId: number): Promise<OfferMeta> {
  const result = await rt.db.query(
    `SELECT o.display_name, COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) AS owner_name,
            COALESCE(NULLIF(TRIM(o.offer_data->'clientInfo'->>'company'), ''), c.company) AS client_company
     FROM offers o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.id = $1`,
    [offerId]
  );
  const row = result.rows[0] ?? {};
  return { name: String(row.display_name ?? `offer_${offerId}`), owner: row.owner_name ?? null, client: row.client_company ?? null };
}

/** Card rows every offer action shows: who, for whom, how much. */
export function summaryRows(access: OfferAccess, meta: OfferMeta, lang: Lang): [string, string][] {
  const totals = offerTotals(access.offer.offer_data, lang);
  const decision = (access.offer.client_decision ?? 'pending') as ClientDecision;
  return [
    [pick(lang, 'Klient', 'Client'), meta.client ?? '-'],
    [pick(lang, 'Handlowiec', 'Salesperson'), meta.owner ?? '-'],
    [pick(lang, 'Tonaż', 'Tons'), totals.tons],
    [pick(lang, 'Wartość', 'Value'), totals.value],
    [pick(lang, 'Status', 'Status'), `${statusLabel(access.offer.status, lang)}${access.offer.status === 'sent' ? ` · ${decisionLabel(decision, lang)}` : ''}`],
  ];
}

export function refuse(lang: Lang, pl: string, en: string): ToolOutput {
  return { result: { status: 'not_allowed', message: pick(lang, `${pl} Powiedz to użytkownikowi wprost i nie proponuj obejścia.`, `${en} Tell the user plainly and do not suggest a workaround.`) } };
}

export function notFound(lang: Lang): ToolOutput {
  return { result: { status: 'not_found', message: pick(lang, 'Nie ma takiej oferty w zakresie widoczności użytkownika.', "No such offer in the user's visibility scope.") } };
}

type CardContent = Omit<ActionCardBlock, 'type' | 'kind' | 'token' | 'expiresAt'>;

/**
 * Stores the checked action and returns the confirmation card. `forModel` = the facts the model
 * may repeat (pre-formatted); the model is told nothing has happened yet.
 */
export async function proposeCard(
  rt: ToolRuntime,
  action: AnyAction,
  cardVersion: string | null,
  card: CardContent,
  forModel: Record<string, unknown> = {}
): Promise<ToolOutput> {
  try {
    const created = await createPendingAction(rt.db, rt.ctx.userId, action, cardVersion);
    const block: ActionCardBlock = { type: 'action', kind: action.kind, ...card, token: created.token, expiresAt: created.expiresAt };
    return {
      result: {
        status: 'proposed',
        ...forModel,
        message: pick(rt.lang,
          'Karta potwierdzenia jest już pokazana użytkownikowi. NIC nie zostało jeszcze zmienione - zmiana nastąpi dopiero, gdy użytkownik kliknie przycisk na karcie (karta jest ważna 10 minut). Napisz jednym zdaniem, co zrobi kliknięcie. Nigdy nie pisz, że akcja została wykonana.',
          'The confirmation card is already shown to the user. NOTHING has changed yet - the change happens only when the user clicks the button on the card (the card is valid for 10 minutes). Say in one sentence what the click will do. Never say the action was done.'),
      },
      blocks: [block],
    };
  } catch (error) {
    if (error instanceof ActionsNotConfiguredError) {
      return { result: { status: 'not_configured', message: pick(rt.lang,
        'Akcje asystenta nie są jeszcze włączone w tej instalacji. Powiedz to i wskaż miejsce w aplikacji, gdzie użytkownik może to zrobić sam.',
        'Assistant actions are not enabled in this installation yet. Say so and point to the place in the app where the user can do it.') } };
    }
    throw error;
  }
}
