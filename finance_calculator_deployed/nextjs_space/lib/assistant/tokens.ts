// Signed, user-bound tokens for the assistant's buttons (docs/ai-assistant-plan.md 6.2, D8).
//
// A follow-up chip, a D12 comparison choice or an Excel link carries a fully specified tool call
// the SERVER built. The browser only hands the token back; it can neither put a different query
// into it nor reuse someone else's token: the payload is HMAC-signed, bound to the user and
// expires. The signed call is still re-validated against the tool's schema and executed with the
// clicking user's own access context, so a token never grants more than the user has.
//
// Server-only (node:crypto, JWT_SECRET).

import { createHmac, timingSafeEqual } from 'node:crypto';

export type TokenPurpose = 'followup' | 'export';

/** Cached answers live up to 24 h and keep their buttons, so the tokens live as long. */
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export const MAX_TOKEN_CHARS = 4000;

interface Envelope<T> {
  p: TokenPurpose;
  u: number;
  x: number;
  d: T;
}

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET environment variable is not set');
  return value;
}

function mac(purpose: TokenPurpose, body: string): Buffer {
  // Domain-separated from the session JWT, which is signed with the same secret.
  return createHmac('sha256', secret()).update(`steelquote-assistant:${purpose}:${body}`).digest();
}

export function signToken<T>(purpose: TokenPurpose, userId: number, data: T, now = Date.now()): string {
  const envelope: Envelope<T> = { p: purpose, u: userId, x: now + TOKEN_TTL_MS, d: data };
  const body = Buffer.from(JSON.stringify(envelope)).toString('base64url');
  return `${body}.${mac(purpose, body).toString('base64url')}`;
}

export type TokenCheck<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'malformed' | 'signature' | 'expired' | 'wrong_user' };

/** Signature, purpose, owner and expiry. The payload still needs schema validation by the caller. */
export function verifyToken<T = unknown>(purpose: TokenPurpose, token: string, userId: number, now = Date.now()): TokenCheck<T> {
  if (token.length > MAX_TOKEN_CHARS) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, signature] = parts;

  const expected = mac(purpose, body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'signature' };

  let envelope: Envelope<T>;
  try {
    envelope = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Envelope<T>;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (envelope.p !== purpose) return { ok: false, reason: 'signature' };
  if (envelope.u !== userId) return { ok: false, reason: 'wrong_user' };
  if (typeof envelope.x !== 'number' || envelope.x < now) return { ok: false, reason: 'expired' };
  return { ok: true, data: envelope.d };
}
