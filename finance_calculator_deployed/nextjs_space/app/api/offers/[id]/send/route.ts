import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { normalizeClientInfo, hasRequiredCompanyDetails } from '@/lib/pdfGenerator';
import { requireAccess } from '@/lib/access/context';
import { describeOffer, loadVisibleOffer } from '@/lib/access/offerAccess';
import { replacePendingSteps, snapshotOf } from '@/lib/access/workflow';
import { accessError } from '@/lib/access/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - send the offer to the client -> 'sent' (read-only from then on). Who may send is
// offerActions().canSend, recomputed here on the server:
//   - the owner, from draft/rejected, when the flow's rules require no validation for them
//     (no rule fired, or their own level covers it, or they validate their own offers)
//   - an 'approved' offer: its owner, the superuser, or a reviewer who approved it - the
//     reviewer sends on the owner's behalf; offers.sent_by records who actually sent it
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { ctx } = auth;
    const { id } = await params;

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const offer = await loadVisibleOffer(ctx, Number.parseInt(id, 10), db, true);
      if (!offer) {
        await db.query('ROLLBACK');
        return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
      }

      // An offer can be saved without client data, but it must not leave the building without
      // it: company name + NIP are the minimum that identifies who the quote is for.
      if (!hasRequiredCompanyDetails(normalizeClientInfo(offer.offer_data?.clientInfo))) {
        await db.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Nie można wysłać oferty bez danych firmy klienta (nazwa firmy i NIP).' },
          { status: 422 }
        );
      }

      const { actions, assessment } = await describeOffer(ctx, offer, db);
      if (!actions.canSend) {
        await db.query('ROLLBACK');
        return accessError(actions.needsValidation ? 'needs_validation' : 'cannot_send');
      }

      // A direct send from draft keeps the evaluation that allowed it (audit).
      if (assessment && offer.status !== 'approved') {
        await replacePendingSteps(offer.id, assessment.plan, db, true);
      }
      const result = await db.query(
        `UPDATE offers
         SET status = 'sent', sent_at = CURRENT_TIMESTAMP, sent_by = $2,
             validation_snapshot = COALESCE($3::jsonb, validation_snapshot),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = $4
         RETURNING id, status, sent_at, sent_by`,
        [offer.id, ctx.userId, assessment ? JSON.stringify(snapshotOf(assessment)) : null, offer.status]
      );
      await db.query('COMMIT');

      if (result.rows.length === 0) return accessError('cannot_send');
      return NextResponse.json({ offer: result.rows[0] });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    console.error('Error sending offer:', error);
    return NextResponse.json({ error: 'Failed to send offer' }, { status: 500 });
  }
}
