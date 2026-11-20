import { NextResponse } from 'next/server';
import { cancelAction } from '@/lib/assistant/actions/confirm';
import { readCardRequest } from '@/lib/assistant/actions/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST - the user clicked "Anuluj" on an assistant confirmation card: the pending action can no
// longer run. Body: { lang? }.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  try {
    const req = await readCardRequest(request, params.token);
    if (!req.ok) return req.response;
    const outcome = await cancelAction(req.ctx, params.token, req.lang);
    if (!outcome.ok) return NextResponse.json({ error: outcome.message, code: outcome.code }, { status: outcome.status });
    return NextResponse.json({ cancelled: true });
  } catch (error) {
    console.error('[assistant] action cancel failed:', error);
    return NextResponse.json({ error: 'Nie udało się anulować akcji.' }, { status: 500 });
  }
}
