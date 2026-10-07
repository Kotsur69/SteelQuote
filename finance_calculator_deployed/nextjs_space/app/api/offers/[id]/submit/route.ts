import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAccess } from '@/lib/access/context';
import { describeOffer, loadVisibleOffer } from '@/lib/access/offerAccess';
import { replacePendingSteps, snapshotOf } from '@/lib/access/workflow';
import { accessError } from '@/lib/access/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - submit an own draft/rejected offer to validation. The flow's rules are evaluated for
// the owner (lib/access/ruleEngine + routing) and one approval step is written per level that
// must approve; the offer goes to pending_review. When no step is needed (no rule fired, or
// the owner's level covers it) the offer is approved straight away and can be sent. A level
// the flow has no approver for is resolved by the conflict policy; under 'block' the submit
// fails with code 'level_conflict'.
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
      if (!offer || offer.user_id !== ctx.userId) {
        await db.query('ROLLBACK');
        return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
      }
      if (offer.status !== 'draft' && offer.status !== 'rejected') {
        await db.query('ROLLBACK');
        return accessError('wrong_status');
      }

      const { assessment } = await describeOffer(ctx, offer, db);
      if (!assessment) {
        await db.query('ROLLBACK');
        return accessError('wrong_status');
      }
      const { plan } = assessment;
      const snapshot = snapshotOf(assessment);
      if (plan.blocked) {
        await db.query('ROLLBACK');
        return accessError('level_conflict', { validation: snapshot });
      }

      const membership = ctx.memberships.find((m) => m.flowId === offer.flow_id);
      const mayValidateDirectly = plan.steps.length === 0;
      if (!mayValidateDirectly && !ctx.isSuperuser && !membership?.permissions.canSubmitToValidation) {
        await db.query('ROLLBACK');
        return accessError('cannot_submit');
      }

      const status = mayValidateDirectly ? 'approved' : 'pending_review';
      const result = await db.query(
        `UPDATE offers
         SET status = $2, rejection_reason = NULL, validation_snapshot = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, status`,
        [offer.id, status, JSON.stringify(snapshot)]
      );
      await replacePendingSteps(offer.id, plan, db);
      await db.query('COMMIT');

      return NextResponse.json({ offer: result.rows[0], validation: snapshot });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    console.error('Error submitting offer:', error);
    return NextResponse.json({ error: 'Failed to submit offer' }, { status: 500 });
  }
}
