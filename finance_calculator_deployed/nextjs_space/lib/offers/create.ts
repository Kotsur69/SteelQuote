// Creating offers: a new draft (POST /api/offers) and a copy of an own offer
// (POST /api/offers/[id]/duplicate). Moved out of the route handlers unchanged, so the
// assistant's confirmation endpoint runs exactly the same rules (docs/ai-assistant-plan.md 7.1).

import type { PoolClient } from 'pg';
import { upsertClientFromOffer } from '../clientDirectory';
import { normalizeClientInfo, type ClientInfo } from '../pdfGenerator';
import { can } from '../access/context';
import { fieldViolation } from '../access/fieldGuards';
import { loadBaseResolver, loadDefaultMarginPct } from '../access/config';
import type { AccessContext } from '../access/types';
import { validateOfferItems } from '../offerItemValidation';
import { accessFail, httpFail, notFound, ok, type ServiceResult } from './result';

export type OfferData = Record<string, unknown>;

/** Optional name: empty -> NULL, and the generated display_name becomes "offer_<ID>". */
export function offerNameOf(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export interface CreateInput {
  name: unknown;
  offerData: unknown;
}

/**
 * New offer in the caller's ACTIVE flow (flow switcher). Requires can_create_offer there.
 * Starts as 'draft' (DB default).
 */
export async function createOffer(
  tx: PoolClient,
  ctx: AccessContext,
  input: CreateInput
): Promise<ServiceResult<{ offer: Record<string, unknown> }>> {
  const flowId = ctx.activeFlowId;
  if (flowId === null) return accessFail('no_flow');
  if (!can(ctx, flowId, 'canCreateOffer')) return accessFail('cannot_create');

  const offerData = input.offerData;
  if (!offerData || typeof offerData !== 'object') return httpFail(400, 'Missing required fields');
  const data = offerData as OfferData;
  const itemsError = validateOfferItems(data);
  if (itemsError) return httpFail(400, itemsError);

  const membership = ctx.memberships.find((m) => m.flowId === flowId);
  const violation = fieldViolation(
    ctx.isSuperuser || !membership ? 'all' : membership.permissions,
    data,
    null,
    await loadBaseResolver(data.validFrom, tx),
    await loadDefaultMarginPct(tx)
  );
  if (violation) return accessFail(violation);

  // The client goes to the `clients` directory too (lib/clientDirectory.ts), in the same
  // transaction - a failed offer insert must not leave a company without any offer.
  const clientId = await upsertClientFromOffer(tx, normalizeClientInfo(data.clientInfo), ctx.userId);
  const result = await tx.query(
    `INSERT INTO offers (user_id, offer_name, offer_data, client_id, flow_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $1)
     RETURNING id, offer_name, display_name, offer_data, status, flow_id, created_at, updated_at`,
    [ctx.userId, offerNameOf(input.name), JSON.stringify(data), clientId, flowId]
  );
  return ok({ offer: result.rows[0] });
}

/** What a copy may change against the original (the assistant's "duplicate for client X"). */
export interface DuplicateOverrides {
  clientInfo?: ClientInfo;
  paymentTermDays?: number;
}

/**
 * Copy of an own offer. The copy starts as 'draft' in the original's flow when the caller may
 * still create offers there, otherwise in their active flow.
 */
export async function duplicateOffer(
  tx: PoolClient,
  ctx: AccessContext,
  offerId: number,
  overrides: DuplicateOverrides = {}
): Promise<ServiceResult<{ offer: Record<string, unknown> }>> {
  if (!Number.isInteger(offerId)) return notFound();

  const originalResult = await tx.query(
    `SELECT display_name, offer_data, flow_id FROM offers WHERE id = $1 AND user_id = $2`,
    [offerId, ctx.userId]
  );
  if (originalResult.rows.length === 0) return notFound();
  const original = originalResult.rows[0];

  const flowId = can(ctx, original.flow_id, 'canCreateOffer')
    ? original.flow_id
    : ctx.activeFlowId !== null && can(ctx, ctx.activeFlowId, 'canCreateOffer')
      ? ctx.activeFlowId
      : null;
  if (flowId === null) return accessFail('cannot_create');

  const offerData: OfferData = { ...(original.offer_data ?? {}), ...overrides };

  // Copying into another flow is a new offer there: the PGL / price permissions of THAT flow
  // apply to the copied content.
  if (flowId !== original.flow_id) {
    const perms = ctx.memberships.find((m) => m.flowId === flowId)?.permissions;
    const violation = fieldViolation(
      ctx.isSuperuser || !perms ? 'all' : perms,
      offerData,
      null,
      await loadBaseResolver(offerData.validFrom, tx),
      await loadDefaultMarginPct(tx)
    );
    if (violation) return accessFail(violation);
  }

  // display_name, not offer_name: an unnamed offer would give "Kopia null". The copy gets an
  // OWN name ("Kopia offer_30") - it is a new row with a new ID, so its own placeholder name
  // ("offer_31") would lose the trace of the original.
  // A plain copy keeps the original behaviour (no client link until the copy is saved). A copy
  // for another client links it like a save does - and a new company joins the directory.
  const clientId = overrides.clientInfo
    ? await upsertClientFromOffer(tx, normalizeClientInfo(overrides.clientInfo), ctx.userId)
    : null;
  const result = await tx.query(
    `INSERT INTO offers (user_id, offer_name, offer_data, flow_id, created_by, client_id)
     VALUES ($1, $2, $3, $4, $1, $5)
     RETURNING id, offer_name, display_name, offer_data, flow_id, created_at, updated_at`,
    [ctx.userId, `Kopia ${original.display_name}`, offerData, flowId, clientId]
  );
  return ok({ offer: result.rows[0] });
}
