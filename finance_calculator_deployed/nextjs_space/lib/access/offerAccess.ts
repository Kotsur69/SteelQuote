// Loading ONE offer for a request, with everything the route needs to authorize an action:
// the visibility check, its live approval steps, a fresh rule assessment and the derived
// actions. Every /api/offers/[id]/* route goes through here so they all decide alike.

import pool from '../db';
import type { Db } from './config';
import { offerVisibilitySql } from './scope';
import type { AccessContext } from './types';
import {
  assessOffer,
  loadSteps,
  offerActions,
  type OfferActions,
  type OfferAssessment,
  type OfferStatus,
  type StepRow,
} from './workflow';
import type { OfferDataInput } from './ruleEngine';

export interface OfferRow {
  id: number;
  user_id: number | null;
  flow_id: number;
  status: OfferStatus;
  offer_name: string | null;
  offer_data: (OfferDataInput & Record<string, unknown>) | null;
  root_offer_id: number | null;
  version_number: number;
  [key: string]: unknown;
}

export interface OfferAccess {
  offer: OfferRow;
  steps: StepRow[];
  assessment: OfferAssessment | null;
  actions: OfferActions;
}

/**
 * The offer if the caller may SEE it (visibility matrix), else null. `lock` takes a row lock
 * (FOR UPDATE OF o) for read-modify-write routes; pass a transaction client then.
 */
export async function loadVisibleOffer(
  ctx: AccessContext,
  offerId: number,
  db: Db = pool,
  lock = false
): Promise<OfferRow | null> {
  if (!Number.isInteger(offerId) || offerId <= 0) return null;
  const params: unknown[] = [offerId];
  const visible = offerVisibilitySql(ctx, params, 'o');
  const result = await db.query(
    `SELECT o.* FROM offers o WHERE o.id = $1 AND ${visible} ${lock ? 'FOR UPDATE OF o' : ''}`,
    params
  );
  return (result.rows[0] as OfferRow | undefined) ?? null;
}

/** Steps + fresh assessment + actions for an offer row the caller can see. */
export async function describeOffer(ctx: AccessContext, offer: OfferRow, db: Db = pool): Promise<OfferAccess> {
  const steps = await loadSteps(offer.id, db);
  const assessment =
    offer.status === 'sent'
      ? null
      : await assessOffer({ flowId: offer.flow_id, ownerId: offer.user_id, offerData: offer.offer_data }, db);
  const latest = await db.query(
    `SELECT NOT EXISTS (
       SELECT 1 FROM offers n
       WHERE COALESCE(n.root_offer_id, n.id) = COALESCE($2::int, $1::int) AND n.version_number > $3
     ) AS is_latest`,
    [offer.id, offer.root_offer_id, offer.version_number]
  );
  const actions = offerActions(
    ctx,
    { userId: offer.user_id, flowId: offer.flow_id, status: offer.status, isLatest: latest.rows[0].is_latest === true },
    steps,
    assessment?.plan ?? null
  );
  return { offer, steps, assessment, actions };
}

export async function loadOfferAccess(
  ctx: AccessContext,
  offerId: number,
  db: Db = pool,
  lock = false
): Promise<OfferAccess | null> {
  const offer = await loadVisibleOffer(ctx, offerId, db, lock);
  return offer ? describeOffer(ctx, offer, db) : null;
}
