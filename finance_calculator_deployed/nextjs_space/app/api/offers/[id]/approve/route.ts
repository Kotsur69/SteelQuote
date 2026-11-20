import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/access/context';
import { approveComment, approveOffer, inTransaction } from '@/lib/offers/service';
import { toResponse } from '@/lib/offers/http';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - approve the pending step(s) the caller may decide; body { comment? }.
// Rules: lib/offers/transitions.ts approveOffer.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { comment?: unknown };
    const result = await inTransaction((tx) =>
      approveOffer(tx, auth.ctx, Number.parseInt(id, 10), approveComment(body.comment))
    );
    return toResponse(result);
  } catch (error) {
    console.error('Error approving offer:', error);
    return NextResponse.json({ error: 'Failed to approve offer' }, { status: 500 });
  }
}
