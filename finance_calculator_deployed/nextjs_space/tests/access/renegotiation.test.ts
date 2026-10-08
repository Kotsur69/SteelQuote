// Renegotiating a lost offer: the newest version of a sent offer the client turned down may be
// edited (the save becomes a new draft version of the same family); anything else sent stays
// read-only, and only the newest version may carry the client's decision.
import { describe, expect, it } from 'vitest';
import { isRenegotiable, offerActions, type OfferForActions } from '@/lib/access/workflow';
import type { AccessContext, Membership } from '@/lib/access/types';

const FLOW = 1;
const OWNER = 10;
const OTHER = 20;

const membership: Membership = {
  flowId: FLOW,
  roleId: 1,
  roleCode: 'IFO',
  roleName: 'IFO',
  level: { id: 1, code: 'N0', name: 'N0', kind: 'chain', chainRank: 0, sortOrder: 10 },
  permissions: {
    canCreateOffer: true,
    canEditOwnBeforeSubmit: true,
    canSubmitToValidation: true,
    canApproveReject: false,
    canChangePglBase: false,
    canChangePriceMargin: true,
  },
  flowCode: 'F1',
  flowName: 'Flow 1',
  visibility: {} as Membership['visibility'],
};

function ctx(userId: number, isSuperuser = false): AccessContext {
  return {
    userId,
    email: `u${userId}@example.com`,
    fullName: null,
    isSuperuser,
    memberships: isSuperuser ? [] : [membership],
    activeFlowId: FLOW,
    flows: [],
    teamUserIds: [],
    orgScopeFallback: 'team',
  };
}

function sent(clientDecision: OfferForActions['clientDecision'], isLatest = true): OfferForActions {
  return { userId: OWNER, flowId: FLOW, status: 'sent', isLatest, clientDecision };
}

describe('isRenegotiable', () => {
  it('is true only for the newest version of a lost sent offer', () => {
    expect(isRenegotiable(sent('lost'))).toBe(true);
    expect(isRenegotiable(sent('lost', false))).toBe(false);
    expect(isRenegotiable(sent('won'))).toBe(false);
    expect(isRenegotiable(sent('pending'))).toBe(false);
    expect(isRenegotiable({ status: 'draft', isLatest: true, clientDecision: 'lost' })).toBe(false);
  });
});

describe('offerActions on sent offers', () => {
  it('lets the owner edit a lost offer to renegotiate it', () => {
    expect(offerActions(ctx(OWNER), sent('lost'), [], null).canEdit).toBe(true);
  });

  it('lets the superuser renegotiate a lost offer', () => {
    expect(offerActions(ctx(OTHER, true), sent('lost'), [], null).canEdit).toBe(true);
  });

  it('keeps won, undecided and superseded lost offers read-only', () => {
    expect(offerActions(ctx(OWNER), sent('won'), [], null).canEdit).toBe(false);
    expect(offerActions(ctx(OWNER), sent('pending'), [], null).canEdit).toBe(false);
    expect(offerActions(ctx(OWNER), sent('lost', false), [], null).canEdit).toBe(false);
  });

  it("does not let someone else's lost offer be edited", () => {
    expect(offerActions(ctx(OTHER), sent('lost'), [], null).canEdit).toBe(false);
  });

  it('records the decision only on the newest version', () => {
    expect(offerActions(ctx(OWNER), sent('lost'), [], null).canRecordDecision).toBe(true);
    expect(offerActions(ctx(OWNER), sent('lost', false), [], null).canRecordDecision).toBe(false);
  });
});
