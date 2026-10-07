import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAccess } from '@/lib/access/context';
import { loadVisibleOffer } from '@/lib/access/offerAccess';
import { decidableSteps, loadSteps } from '@/lib/access/workflow';
import { accessError } from '@/lib/access/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_COMMENT_LENGTH = 1000;

// POST - approve the pending step(s) the caller may decide: a role at exactly that step's
// level with the approve permission in the offer's flow (the superuser: any). The offer becomes
// 'approved' once no step is pending - with an NPR step next to a chain step, both approvers
// must approve, in any order. pending_review -> approved.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { ctx } = auth;
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { comment?: unknown };
    const comment = typeof body.comment === 'string' && body.comment.trim()
      ? body.comment.trim().slice(0, MAX_COMMENT_LENGTH)
      : null;

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
         SET status = 'approved', decided_by = $2, decided_at = CURRENT_TIMESTAMP, comment = $3
         WHERE id = ANY($1::int[])`,
        [mine.map((s) => s.id), ctx.userId, comment]
      );
      const left = await db.query(
        `SELECT 1 FROM offer_approval_steps WHERE offer_id = $1 AND status = 'pending' LIMIT 1`,
        [offer.id]
      );
      const done = left.rows.length === 0;
      const result = await db.query(
        `UPDATE offers
         SET status = CASE WHEN $3 THEN 'approved' ELSE status END,
             reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
             rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, status, reviewed_by, reviewed_at`,
        [offer.id, ctx.userId, done]
      );
      await db.query('COMMIT');
      return NextResponse.json({ offer: result.rows[0], fullyApproved: done });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    console.error('Error approving offer:', error);
    return NextResponse.json({ error: 'Failed to approve offer' }, { status: 500 });
  }
}
