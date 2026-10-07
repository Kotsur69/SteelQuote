import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAccess } from '@/lib/access/context';
import { loadOfferAccess } from '@/lib/access/offerAccess';
import { accessError } from '@/lib/access/errors';
import { CLIENT_DECISIONS, type ClientDecision } from '@/lib/analytics';
import { DEFAULT_LOST_REASON, isLostReason, type LostReason } from '@/lib/lostReasons';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Longest reason we store. Long enough for a real sentence, short enough that the column
// cannot be used as free storage.
const MAX_NOTE_LENGTH = 500;

// POST - record what the client answered on a sent offer: won, lost, or back to pending.
//
// This is deliberately NOT part of offers.status. The status workflow (draft ->
// pending_review -> approved/rejected -> sent) is our internal review; 'approved' means a
// senior signed it off, never that the client bought it. Win and loss live on their own axis
// so the analytics panel can report a win rate without conflating the two.
//
// Only a 'sent' offer can carry a decision - the client has not seen anything else yet.
// The owner records their own; an approver of the offer's flow and the superuser may record
// it on others' offers they can see. Setting 'pending' clears the decision
// entirely, so a mis-click is undoable rather than permanent.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const session = auth.ctx;

    const { id } = await params;
    const offerId = Number.parseInt(id, 10);
    if (!Number.isInteger(offerId)) {
      return NextResponse.json({ error: 'Nieprawidłowy numer oferty' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      decision?: unknown;
      note?: unknown;
      reason?: unknown;
    };

    const decision = body.decision;
    if (!CLIENT_DECISIONS.includes(decision as ClientDecision)) {
      return NextResponse.json({ error: 'Nieprawidłowa decyzja klienta' }, { status: 400 });
    }
    const value = decision as ClientDecision;

    const rawNote = typeof body.note === 'string' ? body.note.trim() : '';
    const note = value === 'pending' || rawNote.length === 0
      ? null
      : rawNote.slice(0, MAX_NOTE_LENGTH);

    // Structured reason, only meaningful for a loss. Picking nothing is allowed and lands in
    // 'other' (the catch-all, whose custom text is the note); an unknown code is a client bug
    // and is rejected rather than silently remapped.
    if (value === 'lost' && body.reason !== undefined && body.reason !== null && body.reason !== '' && !isLostReason(body.reason)) {
      return NextResponse.json({ error: 'Nieprawidłowy powód odrzucenia' }, { status: 400 });
    }
    const reason: LostReason | null =
      value !== 'lost' ? null : isLostReason(body.reason) ? body.reason : DEFAULT_LOST_REASON;

    // Who may record it is offerActions().canRecordDecision: the owner, an approver of the
    // offer's flow, the superuser - and only on an offer they can see. The status check stays in
    // the UPDATE, so a status change racing this request makes the write miss.
    const access = await loadOfferAccess(session, offerId);
    if (!access) return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    if (access.offer.status === 'sent' && !access.actions.canRecordDecision) return accessError('cannot_edit');
    const values: unknown[] = [offerId, value, session.userId, note, reason];

    // $2 is cast to text at every use. Without it Postgres deduces the type twice - `character
    // varying` from `client_decision = $2` and `text` from `$2 = 'pending'` - and refuses the
    // statement (42P08, "inconsistent types deduced for parameter $2"). Assigning text into the
    // VARCHAR(20) column is an implicit widening, so the CHECK constraint still applies.
    const result = await pool.query(
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
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Decyzję klienta można zapisać tylko na ofercie wysłanej do klienta' },
        { status: 409 }
      );
    }

    return NextResponse.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error recording client decision:', error);
    return NextResponse.json({ error: 'Failed to record client decision' }, { status: 500 });
  }
}
