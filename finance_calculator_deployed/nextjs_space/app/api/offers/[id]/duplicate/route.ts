import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { can, requireAccess } from '@/lib/access/context';
import { accessError } from '@/lib/access/errors';
import { fieldViolation } from '@/lib/access/fieldGuards';
import { loadBaseResolver, loadDefaultMarginPct } from '@/lib/access/config';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Duplicate an own offer. The copy starts as 'draft' in the original's flow when the
// caller may still create offers there, otherwise in their active flow.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { ctx } = auth;

    const { id } = await params;
    const offerId = Number.parseInt(id, 10);
    if (!Number.isInteger(offerId)) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const originalResult = await pool.query(
      `SELECT display_name, offer_data, flow_id FROM offers WHERE id = $1 AND user_id = $2`,
      [offerId, ctx.userId]
    );
    if (originalResult.rows.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }
    const original = originalResult.rows[0];

    const flowId = can(ctx, original.flow_id, 'canCreateOffer')
      ? original.flow_id
      : ctx.activeFlowId !== null && can(ctx, ctx.activeFlowId, 'canCreateOffer')
        ? ctx.activeFlowId
        : null;
    if (flowId === null) return accessError('cannot_create');

    // Copying into another flow is a new offer there: the PGL / price permissions of THAT
    // flow apply to the copied content.
    if (flowId !== original.flow_id) {
      const perms = ctx.memberships.find((m) => m.flowId === flowId)?.permissions;
      const violation = fieldViolation(
        ctx.isSuperuser || !perms ? 'all' : perms,
        original.offer_data,
        null,
        await loadBaseResolver(original.offer_data?.validFrom),
        await loadDefaultMarginPct()
      );
      if (violation) return accessError(violation);
    }

    // display_name, nie offer_name: oferta bez nazwy własnej dałaby "Kopia null".
    // Kopia dostaje nazwę WŁASNĄ (np. "Kopia offer_30") - to nowy rekord z nowym ID,
    // więc jego własna nazwa zastępcza brzmiałaby "offer_31" i gubiłaby ślad oryginału.
    const newName = `Kopia ${original.display_name}`;

    const result = await pool.query(
      `INSERT INTO offers (user_id, offer_name, offer_data, flow_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, offer_name, display_name, offer_data, flow_id, created_at, updated_at`,
      [ctx.userId, newName, original.offer_data, flowId]
    );

    return NextResponse.json({ offer: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Error duplicating offer:', error);
    return NextResponse.json({ error: 'Failed to duplicate offer' }, { status: 500 });
  }
}
