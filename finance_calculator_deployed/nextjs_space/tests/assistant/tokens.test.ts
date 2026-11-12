// Signed button / export tokens (lib/assistant/tokens.ts): bound to one purpose, one user and
// 24 hours; anything else is refused with a reason.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MAX_TOKEN_CHARS, TOKEN_TTL_MS, signToken, verifyToken } from '@/lib/assistant/tokens';

const NOW = Date.UTC(2026, 10, 9, 12);
const DATA = { tool: 'query_metrics', input: { metrics: ['offers_sent'] }, label: 'Porównaj' };

describe('assistant tokens', () => {
  beforeEach(() => vi.stubEnv('JWT_SECRET', 'test-secret-for-tokens'));
  afterEach(() => vi.unstubAllEnvs());

  test('round trip returns the payload', () => {
    const token = signToken('followup', 7, DATA, NOW);
    expect(verifyToken('followup', token, 7, NOW + 1000)).toEqual({ ok: true, data: DATA });
  });

  test('another user cannot use it', () => {
    const token = signToken('followup', 7, DATA, NOW);
    expect(verifyToken('followup', token, 8, NOW)).toEqual({ ok: false, reason: 'wrong_user' });
  });

  test('it expires after the TTL', () => {
    const token = signToken('export', 7, DATA, NOW);
    expect(verifyToken('export', token, 7, NOW + TOKEN_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' });
  });

  test('a follow-up token is not an export token', () => {
    const token = signToken('followup', 7, DATA, NOW);
    expect(verifyToken('export', token, 7, NOW)).toEqual({ ok: false, reason: 'signature' });
  });

  test('an edited payload fails the signature', () => {
    const [body, signature] = signToken('followup', 7, DATA, NOW).split('.');
    const envelope = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const forged = Buffer.from(JSON.stringify({ ...envelope, u: 8 })).toString('base64url');
    expect(verifyToken('followup', `${forged}.${signature}`, 8, NOW)).toEqual({ ok: false, reason: 'signature' });
  });

  test('a different secret fails the signature', () => {
    const token = signToken('followup', 7, DATA, NOW);
    vi.stubEnv('JWT_SECRET', 'rotated-secret');
    expect(verifyToken('followup', token, 7, NOW)).toEqual({ ok: false, reason: 'signature' });
  });

  test('garbage and oversized input are malformed, never thrown', () => {
    expect(verifyToken('followup', 'not-a-token', 7, NOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyToken('followup', 'a.b.c', 7, NOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyToken('followup', 'x'.repeat(MAX_TOKEN_CHARS + 1), 7, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });

  test('no secret configured is an error, not an unsigned token', () => {
    vi.stubEnv('JWT_SECRET', '');
    expect(() => signToken('followup', 7, DATA, NOW)).toThrow(/JWT_SECRET/);
  });
});
