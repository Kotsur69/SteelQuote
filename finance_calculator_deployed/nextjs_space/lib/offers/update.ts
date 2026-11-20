// Saving an edited offer (PUT /api/offers/[id]). Moved out of the route unchanged so the
// assistant's confirmation endpoint saves an edit through the same versioning rules.
//
// Who may edit is offerActions().canEdit: the owner before submit (and an approved offer), a
// reviewer holding a pending step's level, the superuser. A 'sent' offer is read-only for
// everyone, except a lost one, which may be renegotiated as a new draft version.
//
// Versioning: when the name or offer_data DIFFER from the stored row, the save does not
// overwrite it - it inserts a new version row (root_offer_id / version_number) and the original
// stays untouched and visible in the list. A save without changes is a plain UPDATE.
//
// A changed version is re-assessed for its OWNER (also when a reviewer edits it), so the new
// version may need a different - possibly higher - level than the one being edited.

import type { PoolClient } from 'pg';
import { upsertClientFromOffer } from '../clientDirectory';
import { normalizeClientInfo } from '../pdfGenerator';
import { describeOffer, loadVisibleOffer } from '../access/offerAccess';
import { assessOffer, needsValidation, replacePendingSteps, snapshotOf } from '../access/workflow';
import { fieldViolation } from '../access/fieldGuards';
import { loadBaseResolver, loadDefaultMarginPct } from '../access/config';
import type { AccessContext } from '../access/types';
import { validateOfferItems } from '../offerItemValidation';
import { offerNameOf, type OfferData } from './create';
import { accessFail, httpFail, notFound, ok, type ServiceResult } from './result';

// Order-insensitive comparison: offer_data comes back from Postgres (jsonb) as a plain object,
// but JSONB does not keep the key order of the write, so comparing JSON strings would report
// identical data as "changed".
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((k) => Object.prototype.hasOwnProperty.call(bObj, k) && deepEqual(aObj[k], bObj[k]))
  );
}

export interface UpdateInput {
  name: unknown;
  offerData: unknown;
}

const READ_ONLY_SENT = 'Oferta została wysłana do klienta i jest tylko do odczytu';

export async function updateOffer(
  tx: PoolClient,
  ctx: AccessContext,
  offerId: number,
  input: UpdateInput
): Promise<ServiceResult<{ offer: Record<string, unknown> }>> {
  const offerData = input.offerData;
  if (!offerData || typeof offerData !== 'object' || !Number.isInteger(offerId)) {
    return httpFail(400, 'Missing required fields');
  }
  const data = offerData as OfferData;
  const itemsError = validateOfferItems(data);
  if (itemsError) return httpFail(400, itemsError);
  const name = offerNameOf(input.name);

  // Row lock first (FOR UPDATE) - the same data is read below for the comparison and the next
  // version number, so a parallel save must not slip in between.
  const existing = await loadVisibleOffer(ctx, offerId, tx, true);
  if (!existing) return notFound();
  const { actions } = await describeOffer(ctx, existing, tx);
  // A sent offer stays read-only, except the newest version of a LOST one: editing it is the
  // next renegotiation round of the same offer (see isRenegotiable).
  if (existing.status === 'sent' && !actions.canEdit) return httpFail(409, READ_ONLY_SENT);
  if (!actions.canEdit) return accessFail('cannot_edit');

  const editorPerms = ctx.memberships.find((m) => m.flowId === existing.flow_id)?.permissions;
  const violation = fieldViolation(
    ctx.isSuperuser || !editorPerms ? 'all' : editorPerms,
    data,
    existing.offer_data,
    await loadBaseResolver(data.validFrom, tx),
    await loadDefaultMarginPct(tx)
  );
  if (violation) return accessFail(violation);

  // As in createOffer: the client lands in the `clients` directory in the same transaction.
  const clientId = await upsertClientFromOffer(tx, normalizeClientInfo(data.clientInfo), ctx.userId);
  const unchanged = existing.offer_name === name && deepEqual(existing.offer_data, data);

  // What went to the client is never rewritten in place - saving a lost offer without changes
  // simply returns it.
  if (unchanged && existing.status === 'sent') return ok({ offer: existing });

  if (unchanged) {
    const result = await tx.query(
      `UPDATE offers
       SET offer_name = $1, offer_data = $2, client_id = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, offer_name, display_name, offer_data, status, flow_id, created_at, updated_at,
                 root_offer_id, version_number`,
      [name, JSON.stringify(data), clientId, offerId]
    );
    return ok({ offer: result.rows[0] });
  }

  // Family root: when the edited row is already a version, its own root_offer_id stays the
  // root. Postgres does not combine FOR UPDATE with MAX - lock the family rows, take the max in JS.
  const rootId = existing.root_offer_id ?? existing.id;
  // Serialize version numbering per family: FOR UPDATE below cannot see a version a parallel
  // transaction is inserting right now, so two saves could otherwise pick the same number.
  await tx.query(`SELECT pg_advisory_xact_lock(hashtext('offer_family'), $1)`, [rootId]);
  const versionResult = await tx.query(
    `SELECT version_number FROM offers WHERE id = $1 OR root_offer_id = $1 FOR UPDATE`,
    [rootId]
  );
  const nextVersion =
    Math.max(0, ...versionResult.rows.map((r: { version_number: unknown }) => Number(r.version_number))) + 1;

  const assessment = await assessOffer({ flowId: existing.flow_id, ownerId: existing.user_id, offerData: data }, tx);

  // Owner and flow of the version = those of the edited row, never the editor's: a reviewer
  // correcting someone's offer must not take it over. The editor goes to created_by
  // (migration 033). A version of an offer in review (or an approved one) is re-assessed:
  // still needs an approval -> review continues on the new version with fresh steps; nothing
  // left to approve -> approved. Draft / rejected versions keep their status. A renegotiated
  // lost offer starts the new round as a draft.
  let versionStatus = existing.status === 'sent' ? 'draft' : existing.status;
  if (existing.status === 'pending_review' || existing.status === 'approved') {
    if (assessment.plan.blocked) return accessFail('level_conflict', { validation: snapshotOf(assessment) });
    versionStatus = needsValidation(assessment.plan) ? 'pending_review' : 'approved';
  }

  const inserted = await tx.query(
    `INSERT INTO offers (user_id, offer_name, offer_data, client_id, status, root_offer_id,
                         version_number, flow_id, validation_snapshot, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, offer_name, display_name, offer_data, status, flow_id, created_at, updated_at,
               root_offer_id, version_number`,
    [existing.user_id, name, JSON.stringify(data), clientId, versionStatus, rootId,
      nextVersion, existing.flow_id, JSON.stringify(snapshotOf(assessment)), ctx.userId]
  );
  const row = inserted.rows[0];

  if (versionStatus === 'pending_review') await replacePendingSteps(row.id, assessment.plan, tx);
  // The edited version no longer waits for anyone - its open steps moved to the new version.
  await tx.query(
    `UPDATE offer_approval_steps SET status = 'superseded' WHERE offer_id = $1 AND status = 'pending'`,
    [existing.id]
  );
  return ok({ offer: row });
}
