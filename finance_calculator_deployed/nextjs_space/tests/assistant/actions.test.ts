// Assistant actions without a database: payload parsing, card tokens, action chips.

import { describe, expect, test } from 'vitest';
import type { OfferActions } from '@/lib/access/workflow';
import { offerActionCalls } from '@/lib/assistant/actionChips';
import { parseAction, targetOfferId } from '@/lib/assistant/actions/kinds';
import { actionIdOf } from '@/lib/assistant/actions/pending';
import { signToken } from '@/lib/assistant/tokens';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-actions';

const NONE: OfferActions = {
  canEdit: false, canSubmit: false, canSend: false, canReview: false, reviewAsStandIn: false, canDelete: false,
  canDuplicate: false, canRecordDecision: false, needsValidation: false, approval: null,
};

describe('parseAction', () => {
  test('accepts a well-formed payload and names its offer', () => {
    const action = parseAction('approve', { offerId: 141, comment: null });
    expect(action).toEqual({ kind: 'approve', payload: { offerId: 141, comment: null } });
    expect(action && targetOfferId(action)).toBe(141);
    expect(targetOfferId({ kind: 'draft', payload: { offerName: null, offerData: {}, flowId: 1 } })).toBeNull();
  });

  test('refuses unknown kinds, extra fields and missing required fields', () => {
    expect(parseAction('delete', { offerId: 1 })).toBeNull();
    expect(parseAction('draft', { offerName: null, offerData: {} })).toBeNull();
    expect(parseAction('approve', { offerId: 1, comment: null, extra: true })).toBeNull();
    expect(parseAction('reject', { offerId: 1 })).toBeNull();
    expect(parseAction('reject', { offerId: 1, reason: '' })).toBeNull();
    expect(parseAction('decision', { offerId: 1, decision: 'pending', reason: null, note: null })).toBeNull();
  });
});

describe('card tokens', () => {
  test('a card token names its action only for the user it was made for', () => {
    const token = signToken('action', 7, { id: 42 });
    expect(actionIdOf(token, 7)).toBe(42);
    expect(actionIdOf(token, 8)).toBeNull();
  });

  test('a follow-up or export token is never accepted as a card', () => {
    expect(actionIdOf(signToken('followup', 7, { id: 42 }), 7)).toBeNull();
    expect(actionIdOf(signToken('export', 7, { id: 42 }), 7)).toBeNull();
  });

  test('a tampered or malformed token is refused', () => {
    const token = signToken('action', 7, { id: 42 });
    const [body, mac] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), d: { id: 43 } })).toString('base64url');
    expect(actionIdOf(`${forged}.${mac}`, 7)).toBeNull();
    expect(actionIdOf('garbage', 7)).toBeNull();
    expect(actionIdOf(signToken('action', 7, { id: 'x' }), 7)).toBeNull();
  });
});

describe('offerActionCalls', () => {
  test('no permitted action, no chip', () => {
    expect(offerActionCalls(5, 'draft', NONE, null, 'pl')).toEqual([]);
  });

  test('a reviewer gets approve first, never reject (it needs their own reason)', () => {
    const calls = offerActionCalls(5, 'pending_review', { ...NONE, canReview: true, canDuplicate: true }, null, 'pl');
    expect(calls.map((c) => c.tool)).toEqual(['propose_approve', 'propose_duplicate']);
    expect(calls[0]).toEqual({ tool: 'propose_approve', input: { offer_id: 5 }, label: 'Zatwierdź' });
  });

  test('a sent offer without a decision offers won / lost, capped at three chips', () => {
    const calls = offerActionCalls(9, 'sent', { ...NONE, canRecordDecision: true, canDuplicate: true }, 'pending', 'en');
    expect(calls.map((c) => c.label)).toEqual(['Mark as won', 'Mark as lost', 'Copy the offer']);
    expect(offerActionCalls(9, 'sent', { ...NONE, canRecordDecision: true }, 'won', 'en')).toEqual([]);
  });
});
