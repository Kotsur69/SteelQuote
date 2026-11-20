import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/access/context';
import { rejectOffer, inTransaction } from '@/lib/offers/service';
import { toResponse } from '@/lib/offers/http';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - reject with instructions for the seller; body { reason } (required).
// Rules: lib/offers/transitions.ts rejectOffer.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { id } = await params;
    const { reason } = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const result = await inTransaction((tx) => rejectOffer(tx, auth.ctx, Number.parseInt(id, 10), reason));
    return toResponse(result);
  } catch (error) {
    console.error('Error rejecting offer:', error);
    return NextResponse.json({ error: 'Failed to reject offer' }, { status: 500 });
  }
}
