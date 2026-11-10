import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAccess } from '@/lib/access/context';
import { checkGate } from '@/lib/assistant/budget';
import { createAnthropicProvider } from '@/lib/assistant/anthropicProvider';
import { chatRequestSchema, handleChat, type ChatEvent } from '@/lib/assistant/chatService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// The agent loop may take several model calls; the platform default would cut it short.
export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;

// GET - whether the assistant exists for this user at all (feature switch, migration, per-user
// switch). The panel uses it to decide whether to draw the bubble; limits and budget do not
// hide it - they answer in the chat with the reason.
export async function GET() {
  const auth = await requireAccess();
  if ('error' in auth) return auth.error;
  try {
    const gate = await checkGate(auth.ctx, pool);
    const hidden = !gate.ok && (gate.reason === 'disabled' || gate.reason === 'not_configured' || gate.reason === 'user_disabled');
    return NextResponse.json({ available: !hidden });
  } catch (error) {
    console.error('[assistant] availability check failed:', error);
    return NextResponse.json({ available: false });
  }
}

// POST - one question to the assistant, answered as a Server-Sent Events stream.
//
// Body: { message, history?: [{role, text}], lang?: 'pl' | 'en', page?: { path, offerId? } }
// Events (each `data: <json>`): text {delta} | reset | tool {name} | final {text, blocks,
// turnId, cached} | error {message}.
//
// Everything the assistant reads runs with the caller's own access context (requireAccess),
// so it can never show more than the same user sees in the app.
export async function POST(request: NextRequest) {
  const auth = await requireAccess();
  if ('error' in auth) return auth.error;

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: ChatEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The browser went away mid-answer.
          open = false;
        }
      };
      try {
        await handleChat(auth.ctx, parsed.data, emit, { createProvider: createAnthropicProvider, signal: request.signal });
      } catch (error) {
        console.error('[assistant] unhandled chat error:', error);
        emit({ type: 'error', message: parsed.data.lang === 'pl' ? 'Coś poszło nie tak. Spróbuj ponownie.' : 'Something went wrong. Try again.' });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
