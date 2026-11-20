import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/access/context';
import { recordDecision, inTransaction } from '@/lib/offers/service';
import { toResponse } from '@/lib/offers/http';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - record what the client answered on a sent offer; body { decision, reason?, note? }.
// Rules: lib/offers/transitions.ts recordDecision.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { decision?: unknown; note?: unknown; reason?: unknown };
    const result = await inTransaction((tx) =>
      recordDecision(tx, auth.ctx, Number.parseInt(id, 10), { decision: body.decision, note: body.note, reason: body.reason })
    );
    return toResponse(result);
  } catch (error) {
    console.error('Error recording client decision:', error);
    return NextResponse.json({ error: 'Failed to record client decision' }, { status: 500 });
  }
}
