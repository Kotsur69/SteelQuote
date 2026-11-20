// Status changes of one offer: submit for approval, send to the client, approve, reject, and the
// client's decision. Moved out of the /api/offers/[id]/* routes unchanged, so the assistant's
// confirmation endpoint runs exactly the same rules (docs/ai-assistant-plan.md 7.1).
//
// Every function expects an open transaction (lib/offers/result.ts inTransaction) and takes
// the row lock itself.

import type { PoolClient } from 'pg';
import { hasRequiredCompanyDetails, normalizeClientInfo } from '../pdfGenerator';
import { describeOffer, loadOfferAccess, loadVisibleOffer } from '../access/offerAccess';
import {
  decidableSteps, loadSteps, replacePendingSteps, rerouteIfOutgrown, snapshotOf,
} from '../access/workflow';
import type { AccessContext } from '../access/types';
import { CLIENT_DECISIONS, type ClientDecision } from '../analytics';
import { activeLostReasons, cleanNote, lostReasonUi, validateLostChoice } from '../lostReasons';
import { loadLostReasons } from '../lostReasonsDb';
import { accessFail, httpFail, notFound, ok, type ServiceResult } from './result';

type Row = Record<string, unknown>;

export const MAX_APPROVE_COMMENT_LENGTH = 1000;
const NOT_IN_REVIEW = 'Oferta nie jest w statusie oczekującym na weryfikację';

/**
 * Submit an own draft/rejected offer to validation, or send an approved one back to it when its
 * approval expired or the rules now need more (ApprovalState.needsRevalidation). One approval
 * step per level that must approve; the offer goes to pending_review. When no step is needed
 * the offer is approved straight away. A level the flow has no approver for is resolved by the
 * conflict policy; under 'block' the submit fails with 'level_conflict'.
 */
export async function submitOffer(
  tx: PoolClient,
  ctx: AccessContext,
  offerId: number
): Promise<ServiceResult<{ offer: Row; validation: Record<string, unknown> }>> {
  const offer = await loadVisibleOffer(ctx, offerId, tx, true);
  if (!offer || offer.user_id !== ctx.userId) return notFound();
  const { assessment, actions } = await describeOffer(ctx, offer, tx);
  const revalidation = offer.status === 'approved' && actions.approval?.needsRevalidation === true;
  if (offer.status !== 'draft' && offer.status !== 'rejected' && !revalidation) return accessFail('wrong_status');
  if (!assessment) return accessFail('wrong_status');

  const { plan } = assessment;
  const snapshot = snapshotOf(assessment);
  if (plan.blocked) return accessFail('level_conflict', { validation: snapshot });

  // Same gates as the buttons (offerActions): with steps the caller must be allowed to submit,
  // without any the offer is approved only if the owner could send it directly.
  const mayValidateDirectly = plan.steps.length === 0;
  if (mayValidateDirectly ? !actions.canSend : !actions.canSubmit) {
    return accessFail(mayValidateDirectly ? 'cannot_send' : 'cannot_submit');
  }

  const status = mayValidateDirectly ? 'approved' : 'pending_review';
  const result = await tx.query(
    `UPDATE offers
     SET status = $2, rejection_reason = NULL, validation_snapshot = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, status`,
    [offer.id, status, JSON.stringify(snapshot)]
  );
  await replacePendingSteps(offer.id, plan, tx, true);
  return ok({ offer: result.rows[0], validation: snapshot });
}

/**
 * Send the offer to the client -> 'sent' (read-only from then on). Who may send is
 * offerActions().canSend: the owner, directly from draft/rejected when no validation is needed,
 * or an approved offer while its approval is valid. An approver never sends.
 */
export async function sendOffer(tx: PoolClient, ctx: AccessContext, offerId: number): Promise<ServiceResult<{ offer: Row }>> {
  const offer = await loadVisibleOffer(ctx, offerId, tx, true);
  if (!offer) return notFound();

  // An offer can be saved without client data, but it must not leave the building without it:
  // company name + NIP are the minimum that identifies who the quote is for.
  if (!hasRequiredCompanyDetails(normalizeClientInfo(offer.offer_data?.clientInfo))) {
    return httpFail(422, 'Nie można wysłać oferty bez danych firmy klienta (nazwa firmy i NIP).');
  }

  const { actions, assessment } = await describeOffer(ctx, offer, tx);
  if (!actions.canSend) return accessFail(actions.needsValidation ? 'needs_validation' : 'cannot_send');

  // A direct send from draft keeps the evaluation that allowed it (audit).
  if (assessment && offer.status !== 'approved') await replacePendingSteps(offer.id, assessment.plan, tx, true);
  const result = await tx.query(
    `UPDATE offers
     SET status = 'sent', sent_at = CURRENT_TIMESTAMP, sent_by = $2,
         validation_snapshot = COALESCE($3::jsonb, validation_snapshot),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = $4
     RETURNING id, status, sent_at, sent_by`,
    [offer.id, ctx.userId, assessment ? JSON.stringify(snapshotOf(assessment)) : null, offer.status]
  );
  if (result.rows.length === 0) return accessFail('cannot_send');
  return ok({ offer: result.rows[0] });
}

/** Comment of an approval: optional, trimmed, capped. */
export function approveComment(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, MAX_APPROVE_COMMENT_LENGTH) : null;
}

/**
 * Approve the pending step(s) the caller may decide (workflow.decidableSteps). The offer becomes
 * 'approved' once no step is pending. When the current rules need a level the stored steps do
 * not cover, nothing is approved: the steps are re-planned and that re-plan is committed
 * (error 'rerouted', commit: true).
 */
export async function approveOffer(
  tx: PoolClient,
  ctx: AccessContext,
  offerId: number,
  comment: string | null
): Promise<ServiceResult<{ offer: Row; fullyApproved: boolean }>> {
  const offer = await loadVisibleOffer(ctx, offerId, tx, true);
  if (!offer) return notFound();
  if (offer.status !== 'pending_review') return httpFail(409, NOT_IN_REVIEW);

  const steps = await loadSteps(offer.id, tx);
  if (decidableSteps(ctx, steps, offer.flow_id, offer.user_id).length === 0) return accessFail('cannot_review');
  // Steps were planned at submit; if the rules now need a higher level, re-route instead.
  const reroute = await rerouteIfOutgrown(offer, steps, tx);
  if (reroute.kind === 'blocked') return accessFail('level_conflict', { validation: snapshotOf(reroute.assessment) });
  if (reroute.kind === 'rerouted') {
    return {
      ok: false,
      error: { kind: 'access', code: 'rerouted', extra: { levels: reroute.levels, validation: snapshotOf(reroute.assessment) } },
      commit: true,
    };
  }
  const mine = decidableSteps(ctx, steps, offer.flow_id, offer.user_id);

  await tx.query(
    `UPDATE offer_approval_steps
     SET status = 'approved', decided_by = $2, decided_at = CURRENT_TIMESTAMP, comment = $3
     WHERE id = ANY($1::int[])`,
    [mine.map((s) => s.id), ctx.userId, comment]
  );
  const left = await tx.query(
    `SELECT 1 FROM offer_approval_steps WHERE offer_id = $1 AND status = 'pending' LIMIT 1`,
    [offer.id]
  );
  const done = left.rows.length === 0;
  const result = await tx.query(
    `UPDATE offers
     SET status = CASE WHEN $3 THEN 'approved' ELSE status END,
         reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
         rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, status, reviewed_by, reviewed_at`,
    [offer.id, ctx.userId, done]
  );
  return ok({ offer: result.rows[0], fullyApproved: done });
}

/**
 * Reject with instructions for the seller (reason required). One rejection ends the whole
 * round: the caller's steps become 'rejected', every other open step 'superseded', the offer
 * goes back to the owner as 'rejected'.
 */
export async function rejectOffer(
  tx: PoolClient,
  ctx: AccessContext,
  offerId: number,
  reason: unknown
): Promise<ServiceResult<{ offer: Row }>> {
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return httpFail(400, 'Powód odrzucenia jest wymagany');
  }
  const text = reason.trim();
  const offer = await loadVisibleOffer(ctx, offerId, tx, true);
  if (!offer) return notFound();
  if (offer.status !== 'pending_review') return httpFail(409, NOT_IN_REVIEW);
  const mine = decidableSteps(ctx, await loadSteps(offer.id, tx), offer.flow_id, offer.user_id);
  if (mine.length === 0) return accessFail('cannot_review');

  await tx.query(
    `UPDATE offer_approval_steps
     SET status = 'rejected', decided_by = $2, decided_at = CURRENT_TIMESTAMP, comment = $3
     WHERE id = ANY($1::int[])`,
    [mine.map((s) => s.id), ctx.userId, text]
  );
  await tx.query(
    `UPDATE offer_approval_steps SET status = 'superseded' WHERE offer_id = $1 AND status = 'pending'`,
    [offer.id]
  );
  const result = await tx.query(
    `UPDATE offers
     SET status = 'rejected', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
         rejection_reason = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, status, reviewed_by, reviewed_at, rejection_reason`,
    [offer.id, ctx.userId, text]
  );
  return ok({ offer: result.rows[0] });
}

export interface DecisionInput {
  decision: unknown;
  note: unknown;
  reason: unknown;
}

/**
 * What the client answered on a sent offer: won, lost, or back to pending (clears it, so a
 * mis-click is undoable). Not part of offers.status - the internal review and the client's
 * answer are separate axes. The owner records their own; an approver of the offer and the
 * superuser may record it on offers they can see. A loss needs an active reason from the
 * admin's list; 'other' also needs the note.
 */
export async function recordDecision(
  tx: PoolClient,
  ctx: AccessContext,
  offerId: number,
  input: DecisionInput
): Promise<ServiceResult<{ offer: Row }>> {
  if (!Number.isInteger(offerId)) return httpFail(400, 'Nieprawidłowy numer oferty');
  if (!CLIENT_DECISIONS.includes(input.decision as ClientDecision)) {
    return httpFail(400, 'Nieprawidłowa decyzja klienta');
  }
  const value = input.decision as ClientDecision;

  // The status check stays in the UPDATE, so a status change racing this request makes the
  // write miss.
  const access = await loadOfferAccess(ctx, offerId, tx);
  if (!access) return notFound();
  if (access.offer.status === 'sent' && !access.actions.canRecordDecision) return accessFail('cannot_decide');

  let note: string | null = null;
  let reason: string | null = null;
  if (value === 'lost') {
    // Read on the pool, as the route always did: its missing-table fallback (before migration
    // 032) cannot work inside a transaction, which a failed statement aborts.
    const { reasons } = await loadLostReasons();
    const active = new Set(activeLostReasons(reasons).map((r) => r.code));
    const choice = validateLostChoice(input.reason, input.note, active);
    if (!choice.ok) return httpFail(400, lostReasonUi('pl').errors[choice.error], choice.error);
    reason = choice.reason;
    note = choice.note;
  } else if (value === 'won') {
    note = cleanNote(input.note);
  }

  // $2 is cast to text at every use. Without it Postgres deduces the type twice - `character
  // varying` from `client_decision = $2` and `text` from `$2 = 'pending'` - and refuses the
  // statement (42P08). Assigning text into the VARCHAR(20) column is an implicit widening, so
  // the CHECK constraint still applies.
  const result = await tx.query(
    `UPDATE offers o
     SET client_decision = $2::text,
         client_decision_at = CASE WHEN $2::text = 'pending' THEN NULL ELSE CURRENT_TIMESTAMP END,
         client_decision_by = CASE WHEN $2::text = 'pending' THEN NULL ELSE $3::int END,
         client_decision_note = CASE WHEN $2::text = 'pending' THEN NULL ELSE $4::text END,
         client_decision_reason = CASE WHEN $2::text = 'lost' THEN $5::text ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
     WHERE o.id = $1 AND o.status = 'sent'
     RETURNING o.id, o.client_decision, o.client_decision_at, o.client_decision_note,
               o.client_decision_reason`,
    [offerId, value, ctx.userId, note, reason]
  );
  if (result.rows.length === 0) {
    return httpFail(409, 'Decyzję klienta można zapisać tylko na ofercie wysłanej do klienta');
  }
  return ok({ offer: result.rows[0] });
}
