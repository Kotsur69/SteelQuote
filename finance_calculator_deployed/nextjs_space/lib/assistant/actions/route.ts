// Shared request handling of the two card routes (confirm / cancel): auth, the assistant's
// on/off switches, a JSON-only body (a cross-site form cannot send application/json without a
// CORS preflight, so a forged POST from another site never reaches the action) and the
// language of the result text.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '../../db';
import { requireAccess } from '../../access/context';
import type { AccessContext } from '../../access/types';
import { checkGate } from '../budget';
import type { Lang } from '../format';
import { MAX_TOKEN_CHARS } from '../tokens';

const bodySchema = z.object({ lang: z.enum(['pl', 'en']).default('pl') }).strict();

// Switches that make the assistant not exist for this user. Limits and budget do not apply:
// a confirmation calls no model.
const HIDDEN = new Set(['disabled', 'not_configured', 'user_disabled']);

export type CardRequest = { ok: true; ctx: AccessContext; lang: Lang } | { ok: false; response: NextResponse };

export async function readCardRequest(request: Request, token: string): Promise<CardRequest> {
  const auth = await requireAccess();
  if ('error' in auth) return { ok: false, response: auth.error };

  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return { ok: false, response: NextResponse.json({ error: 'Expected application/json' }, { status: 415 }) };
  }
  if (token.length > MAX_TOKEN_CHARS) return { ok: false, response: NextResponse.json({ error: 'Invalid card' }, { status: 400 }) };

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return { ok: false, response: NextResponse.json({ error: 'Invalid request' }, { status: 400 }) };

  const gate = await checkGate(auth.ctx, pool);
  if (!gate.ok && HIDDEN.has(gate.reason)) {
    return { ok: false, response: NextResponse.json({ error: 'Asystent jest wyłączony.', code: gate.reason }, { status: 403 }) };
  }
  return { ok: true, ctx: auth.ctx, lang: body.data.lang };
}
