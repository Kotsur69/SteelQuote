import { NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { requireAccess } from '@/lib/access/context';
import { fetchAnalyticsRows } from '@/lib/analyticsQuery';
import { loadLostReasons } from '@/lib/lostReasonsDb';
import { checkGate } from '@/lib/assistant/budget';
import { resolveToday } from '@/lib/assistant/chatService';
import { buildAnswerWorkbook, exportFileName } from '@/lib/assistant/exportWorkbook';
import { buildMetricsFooter, scopeKind } from '@/lib/assistant/footer';
import { metricsQuerySchema, runMetricsQuery } from '@/lib/assistant/metrics';
import { scopedNames } from '@/lib/assistant/tools/directory';
import { verifyToken } from '@/lib/assistant/tokens';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const payloadSchema = z.object({ query: metricsQuerySchema, lang: z.enum(['pl', 'en']) }).strict();

// An export calls no model, so the LLM limits do not apply - but each one is a full row query
// and a workbook build. A small per-user window keeps one user from looping on a link.
const EXPORT_WINDOW_MS = 60_000;
const MAX_EXPORTS_PER_WINDOW = 10;
const recentExports = new Map<number, number[]>();

function exportAllowed(userId: number, now = Date.now()): boolean {
  const recent = (recentExports.get(userId) ?? []).filter((t) => now - t < EXPORT_WINDOW_MS);
  if (recent.length >= MAX_EXPORTS_PER_WINDOW) {
    recentExports.set(userId, recent);
    return false;
  }
  recentExports.set(userId, [...recent, now]);
  return true;
}

// Switches that make the assistant not exist for this user. Limits and budget do not apply:
// an export calls no model.
const HIDDEN = new Set(['disabled', 'not_configured', 'user_disabled']);

// GET - the Excel file behind an assistant answer (docs/ai-assistant-plan.md D8).
//
// The token is the signed query the answer was computed with (lib/assistant/tokens.ts), bound to
// the user who asked. The query is RE-RUN here with the caller's own access context, so the
// file never holds more than the user sees in the app today - even from an old link.
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const auth = await requireAccess();
  if ('error' in auth) return auth.error;
  const ctx = auth.ctx;

  try {
    const check = verifyToken('export', params.token, ctx.userId);
    if (!check.ok) {
      const expired = check.reason === 'expired';
      return NextResponse.json({ error: expired ? 'Link expired' : 'Invalid link' }, { status: expired ? 410 : 403 });
    }
    const payload = payloadSchema.safeParse(check.data);
    if (!payload.success) return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
    const { query, lang } = payload.data;
    if (!exportAllowed(ctx.userId)) return NextResponse.json({ error: 'Too many exports, try again in a minute' }, { status: 429 });

    const gate = await checkGate(ctx, pool);
    if (!gate.ok && HIDDEN.has(gate.reason)) return NextResponse.json({ error: 'Assistant not available' }, { status: 403 });

    const today = await resolveToday();
    const result = await runMetricsQuery(query, {
      today,
      lang,
      selfId: ctx.userId,
      teamUserIds: ctx.teamUserIds,
      fetchRows: (filters, window) => fetchAnalyticsRows(ctx, filters, window, pool),
      loadLostReasons: async () => (await loadLostReasons(pool)).reasons,
      includeOffers: true,
    });
    // The token holds pinned dates, so this only fails if the query itself became invalid.
    if (result.status !== 'ok') return NextResponse.json({ error: 'Query cannot be exported' }, { status: 422 });

    const names = await scopedNames({ ctx, today, lang, db: pool }, result.applied.filters.people ?? [], result.applied.filters.clients ?? []);
    const footer = buildMetricsFooter(result, scopeKind(ctx), names, lang);
    const file = buildAnswerWorkbook(result, footer.lines, lang);

    return new Response(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${exportFileName(result)}"`,
        'Cache-Control': 'private, no-store',
        // The token is in the path: never pass it on as a Referer.
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    console.error('[assistant] export failed:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
