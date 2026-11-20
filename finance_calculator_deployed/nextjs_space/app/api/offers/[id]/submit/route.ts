import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/access/context';
import { submitOffer, inTransaction } from '@/lib/offers/service';
import { toResponse } from '@/lib/offers/http';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - submit an own draft/rejected offer to validation (or an approved one back to it when
// its approval no longer holds). Rules: lib/offers/transitions.ts submitOffer.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { id } = await params;
    const result = await inTransaction((tx) => submitOffer(tx, auth.ctx, Number.parseInt(id, 10)));
    return toResponse(result);
  } catch (error) {
    console.error('Error submitting offer:', error);
    return NextResponse.json({ error: 'Failed to submit offer' }, { status: 500 });
  }
}
