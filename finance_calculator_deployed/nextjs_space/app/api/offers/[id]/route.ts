import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAccess } from '@/lib/access/context';
import { loadOfferAccess } from '@/lib/access/offerAccess';
import { snapshotOf } from '@/lib/access/workflow';
import { assistantActionsFor } from '@/lib/assistant/actions/pending';
import { inTransaction, updateOffer } from '@/lib/offers/service';
import { toResponse } from '@/lib/offers/http';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET single offer - only when the visibility matrix lets the caller see it. Returns the
// actions the caller may take, the approval steps and a fresh rule evaluation (what the
// reviewer bar explains). can_review is kept for the calculator's approve/reject bar.
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { ctx } = auth;

    const { id } = await params;
    const access = await loadOfferAccess(ctx, Number.parseInt(id, 10));
    if (!access) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const names = await pool.query(
      `SELECT u.full_name AS owner_name, u.email AS owner_email, f.name AS flow_name
       FROM offers o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN flows f ON f.id = o.flow_id
       WHERE o.id = $1`,
      [access.offer.id]
    );

    return NextResponse.json({
      offer: {
        ...access.offer,
        ...names.rows[0],
        can_review: access.actions.canReview,
        actions: access.actions,
        steps: access.steps,
        validation: access.assessment ? snapshotOf(access.assessment) : access.offer.validation_snapshot ?? null,
        // Confirmed assistant actions on this row - the "przez asystenta" badge (plan D25).
        assistant_actions: await assistantActionsFor(pool, access.offer.id),
      },
    });
  } catch (error) {
    console.error('Error fetching offer:', error);
    return NextResponse.json({ error: 'Failed to fetch offer' }, { status: 500 });
  }
}

// PUT - Update offer: plain save or a new version. Rules and versioning: lib/offers/update.ts.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;

    const { id } = await params;
    const body = ((await request.json().catch(() => null)) ?? {}) as { offer_name?: unknown; offer_data?: unknown };
    const result = await inTransaction((tx) =>
      updateOffer(tx, auth.ctx, Number.parseInt(id, 10), { name: body.offer_name, offerData: body.offer_data })
    );
    return toResponse(result);
  } catch (error) {
    console.error('Error updating offer:', error);
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 });
  }
}

// DELETE - Delete an own draft/rejected offer. An offer in review, approved or sent keeps its
// approval trail and cannot be deleted.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const session = auth.ctx;

    const { id } = await params;
    const offerId = Number.parseInt(id, 10);
    if (!Number.isInteger(offerId)) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const result = await pool.query(
      `DELETE FROM offers WHERE id = $1 AND user_id = $2 AND status IN ('draft', 'rejected') RETURNING id`,
      [offerId, session.userId]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query(
        `SELECT status FROM offers WHERE id = $1 AND user_id = $2`,
        [offerId, session.userId]
      );
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: 'Usunąć można tylko szkic lub odrzuconą ofertę' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting offer:', error);
    return NextResponse.json({ error: 'Failed to delete offer' }, { status: 500 });
  }
}
