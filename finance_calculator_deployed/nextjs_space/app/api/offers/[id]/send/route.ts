import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/access/context';
import { sendOffer, inTransaction } from '@/lib/offers/service';
import { toResponse } from '@/lib/offers/http';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - send the offer to the client -> 'sent' (read-only from then on). Only the owner sends.
// Rules: lib/offers/transitions.ts sendOffer.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { id } = await params;
    const result = await inTransaction((tx) => sendOffer(tx, auth.ctx, Number.parseInt(id, 10)));
    return toResponse(result);
  } catch (error) {
    console.error('Error sending offer:', error);
    return NextResponse.json({ error: 'Failed to send offer' }, { status: 500 });
  }
}
