import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { CLIENT_DECISIONS, type ClientDecision } from '@/lib/analytics';

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
// The owner records their own; senior and admin may record on anyone's, the same way they
// already review and send other people's offers. Setting 'pending' clears the decision
// entirely, so a mis-click is undoable rather than permanent.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = Number.parseInt(id, 10);
    if (!Number.isInteger(offerId)) {
      return NextResponse.json({ error: 'Nieprawidłowy numer oferty' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      decision?: unknown;
      note?: unknown;
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

    // Senior and admin may decide on any sent offer; a junior only on their own. The check is
    // part of the UPDATE rather than a prior SELECT, so a status change racing this request
    // makes the write miss instead of landing on an offer that is no longer sent.
    // $1..$4 are always the same; the optional ownership check takes $5, so no placeholder
    // ever shifts position depending on the role.
    const values: unknown[] = [offerId, value, session.userId, note];
    let ownershipClause = '';
    if (session.role === 'junior') {
      values.push(session.userId);
      ownershipClause = `AND o.user_id = $${values.length}`;
    }

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
           updated_at = CURRENT_TIMESTAMP
       WHERE o.id = $1 AND o.status = 'sent' ${ownershipClause}
       RETURNING o.id, o.client_decision, o.client_decision_at, o.client_decision_note`,
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
