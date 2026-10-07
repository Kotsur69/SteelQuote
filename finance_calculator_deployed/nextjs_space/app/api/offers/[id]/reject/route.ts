import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAccess } from '@/lib/access/context';
import { loadVisibleOffer } from '@/lib/access/offerAccess';
import { decidableSteps, loadSteps } from '@/lib/access/workflow';
import { accessError } from '@/lib/access/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - reject with instructions for the seller (reason required). Allowed for whoever may
// decide a pending step (see approve). One rejection ends the whole round: the caller's steps
// become 'rejected', every other open step 'superseded', the offer goes back to the owner as
// 'rejected'; a resubmit starts a fresh set of steps. pending_review -> rejected.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { ctx } = auth;
    const { id } = await params;

    const { reason } = (await request.json().catch(() => ({}))) as { reason?: unknown };
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: 'Powód odrzucenia jest wymagany' }, { status: 400 });
    }

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const offer = await loadVisibleOffer(ctx, Number.parseInt(id, 10), db, true);
      if (!offer) {
        await db.query('ROLLBACK');
        return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
      }
      if (offer.status !== 'pending_review') {
        await db.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Oferta nie jest w statusie oczekującym na weryfikację' },
          { status: 409 }
        );
      }
      const mine = decidableSteps(ctx, await loadSteps(offer.id, db), offer.flow_id, offer.user_id);
      if (mine.length === 0) {
        await db.query('ROLLBACK');
        return accessError('cannot_review');
      }

      await db.query(
        `UPDATE offer_approval_steps
         SET status = 'rejected', decided_by = $2, decided_at = CURRENT_TIMESTAMP, comment = $3
         WHERE id = ANY($1::int[])`,
        [mine.map((s) => s.id), ctx.userId, reason.trim()]
      );
      await db.query(
        `UPDATE offer_approval_steps SET status = 'superseded' WHERE offer_id = $1 AND status = 'pending'`,
        [offer.id]
      );
      const result = await db.query(
        `UPDATE offers
         SET status = 'rejected', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
             rejection_reason = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, status, reviewed_by, reviewed_at, rejection_reason`,
        [offer.id, ctx.userId, reason.trim()]
      );
      await db.query('COMMIT');
      return NextResponse.json({ offer: result.rows[0] });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    console.error('Error rejecting offer:', error);
    return NextResponse.json({ error: 'Failed to reject offer' }, { status: 500 });
  }
}
