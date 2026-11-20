import { NextResponse } from 'next/server';
import { confirmAction } from '@/lib/assistant/actions/confirm';
import { readCardRequest } from '@/lib/assistant/actions/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST - the user clicked "Potwierdź" on an assistant confirmation card (docs/ai-assistant-plan.md
// section 7). Body: { lang? }. The token only names the pending action; lib/assistant/actions/confirm.ts
// checks the row (owner, single use, expiry, offer unchanged) and runs it through the shared
// offer service with the caller's own access context.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  try {
    const req = await readCardRequest(request, params.token);
    if (!req.ok) return req.response;
    const outcome = await confirmAction(req.ctx, params.token, req.lang);
    if (!outcome.ok) return NextResponse.json({ error: outcome.message, code: outcome.code }, { status: outcome.status });
    return NextResponse.json(outcome.result);
  } catch (error) {
    console.error('[assistant] action confirm failed:', error);
    return NextResponse.json({ error: 'Nie udało się wykonać akcji. Spróbuj ponownie.' }, { status: 500 });
  }
}
