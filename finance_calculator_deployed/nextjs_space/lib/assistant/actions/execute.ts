// Executes a confirmed assistant action through the shared offer service - the same functions
// behind the app's buttons (lib/offers/service.ts), with the CONFIRMING user's access context.
// Nothing here re-implements a rule: permissions, statuses, field guards and versioning are all
// decided by the service at the moment of the click.

import type { PoolClient } from 'pg';
import type { AccessContext } from '../../access/types';
import {
  approveOffer, createOffer, duplicateOffer, recordDecision, rejectOffer, sendOffer, submitOffer, updateOffer,
  type ServiceResult,
} from '../../offers/service';
import type { Lang } from '../format';
import type { AnyAction } from './kinds';

export interface ExecutedAction {
  /** The offer the action created or changed (a new version / draft / copy has a new id). */
  offerId: number;
  /** Server-written result line for the card. */
  message: string;
  /** Where to open the result in the app. */
  href: string;
}

type Row = Record<string, unknown>;

const offerHref = (id: number) => `/calculator?edit=${id}&from=offers`;

function done(result: ServiceResult<{ offer: Row }>, fallbackId: number, message: (offer: Row) => string): ServiceResult<ExecutedAction> {
  if (!result.ok) return result;
  const offer = result.value.offer;
  const id = Number(offer.id ?? fallbackId);
  return { ok: true, value: { offerId: id, message: message(offer), href: offerHref(id) } };
}

const name = (offer: Row, id: number) => String(offer.display_name ?? `offer_${id}`);

export async function executeAction(tx: PoolClient, ctx: AccessContext, action: AnyAction, lang: Lang): Promise<ServiceResult<ExecutedAction>> {
  const pl = lang === 'pl';
  switch (action.kind) {
    case 'draft': {
      const { offerName, offerData, flowId } = action.payload;
      if (ctx.activeFlowId !== flowId) {
        return { ok: false, error: { kind: 'http', status: 409, error: pl
          ? 'Aktywne flow zmieniło się od czasu przygotowania karty. Poproś asystenta ponownie.'
          : 'The active flow changed since the card was prepared. Ask the assistant again.', code: 'flow_changed' } };
      }
      const result = await createOffer(tx, ctx, { name: offerName, offerData });
      return done(result, 0, (o) => (pl ? `Zapisano szkic ${name(o, Number(o.id))}. Sprawdź go w kalkulatorze.` : `Draft ${name(o, Number(o.id))} saved. Review it in the calculator.`));
    }
    case 'edit': {
      const { offerId, offerName, offerData } = action.payload;
      const result = await updateOffer(tx, ctx, offerId, { name: offerName, offerData });
      return done(result, offerId, (o) => (Number(o.id) === offerId
        ? (pl ? 'Zapisano zmiany oferty.' : 'Offer changes saved.')
        : (pl ? `Zapisano nową wersję oferty (${name(o, Number(o.id))}).` : `Saved a new version of the offer (${name(o, Number(o.id))}).`)));
    }
    case 'duplicate': {
      const { offerId, overrides } = action.payload;
      const result = await duplicateOffer(tx, ctx, offerId, overrides);
      return done(result, 0, (o) => (pl ? `Utworzono kopię jako szkic: ${name(o, Number(o.id))}.` : `Copy created as a draft: ${name(o, Number(o.id))}.`));
    }
    case 'submit': {
      const result = await submitOffer(tx, ctx, action.payload.offerId);
      if (!result.ok) return result;
      const approved = result.value.offer.status === 'approved';
      return done({ ok: true, value: { offer: result.value.offer } }, action.payload.offerId, () => (approved
        ? (pl ? 'Oferta nie wymagała akceptacji - jest zatwierdzona i gotowa do wysłania.' : 'No approval was needed - the offer is approved and ready to send.')
        : (pl ? 'Oferta została przekazana do akceptacji.' : 'The offer was submitted for approval.')));
    }
    case 'send':
      return done(await sendOffer(tx, ctx, action.payload.offerId), action.payload.offerId, () => (pl
        ? 'Oferta oznaczona jako wysłana do klienta.'
        : 'The offer is marked as sent to the client.'));
    case 'approve': {
      const result = await approveOffer(tx, ctx, action.payload.offerId, action.payload.comment);
      if (!result.ok) return result;
      const full = result.value.fullyApproved;
      return done({ ok: true, value: { offer: result.value.offer } }, action.payload.offerId, () => (full
        ? (pl ? 'Oferta zatwierdzona.' : 'Offer approved.')
        : (pl ? 'Twoja akceptacja zapisana - oferta czeka jeszcze na pozostałe akceptacje.' : 'Your approval is saved - the offer still waits for the other approvals.')));
    }
    case 'reject':
      return done(await rejectOffer(tx, ctx, action.payload.offerId, action.payload.reason), action.payload.offerId, () => (pl
        ? 'Oferta odrzucona i zwrócona do handlowca.'
        : 'Offer rejected and returned to the salesperson.'));
    case 'decision': {
      const { offerId, decision, reason, note } = action.payload;
      return done(await recordDecision(tx, ctx, offerId, { decision, reason, note }), offerId, () => (decision === 'won'
        ? (pl ? 'Oferta oznaczona jako wygrana.' : 'Offer marked as won.')
        : (pl ? 'Oferta oznaczona jako przegrana.' : 'Offer marked as lost.')));
    }
  }
}
