import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { upsertClientFromOffer } from '@/lib/clientDirectory';
import { normalizeClientInfo } from '@/lib/pdfGenerator';
import { requireAccess } from '@/lib/access/context';
import { describeOffer, loadOfferAccess, loadVisibleOffer } from '@/lib/access/offerAccess';
import { assessOffer, needsValidation, replacePendingSteps, snapshotOf } from '@/lib/access/workflow';
import { fieldViolation } from '@/lib/access/fieldGuards';
import { loadBaseResolver, loadDefaultMarginPct } from '@/lib/access/config';
import { accessError } from '@/lib/access/errors';
import type { AccessContext } from '@/lib/access/types';
import { validateOfferItems } from '@/lib/offerItemValidation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Porownanie bez wzgledu na kolejnosc kluczy - offer_data wraca z Postgresa (jsonb) jako
// zwykly obiekt JS, ale JSONB nie gwarantuje tej samej kolejnosci kluczy co przy zapisie,
// wiec JSON.stringify(a) === JSON.stringify(b) daloby falszywe "zmienione" przy identycznych
// danych.
function deepEqual(a: unknown, b: unknown): boolean {
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

// GET single offer - only when the visibility matrix lets the caller see it. Returns the
// actions the caller may take, the approval steps and a fresh rule evaluation (what the
// reviewer bar explains). can_review is kept for the calculator's approve/reject bar.
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { ctx } = auth;

    const { id } = await params;
    const access = await loadOfferAccess(ctx, Number.parseInt(id, 10));
    if (!access) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const names = await pool.query(
      `SELECT u.full_name AS owner_name, u.email AS owner_email, f.name AS flow_name
       FROM offers o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN flows f ON f.id = o.flow_id
       WHERE o.id = $1`,
      [access.offer.id]
    );

    return NextResponse.json({
      offer: {
        ...access.offer,
        ...names.rows[0],
        can_review: access.actions.canReview,
        actions: access.actions,
        steps: access.steps,
        validation: access.assessment ? snapshotOf(access.assessment) : access.offer.validation_snapshot ?? null,
      },
    });
  } catch (error) {
    console.error('Error fetching offer:', error);
    return NextResponse.json({ error: 'Failed to fetch offer' }, { status: 500 });
  }
}

type PutOutcome =
  | { kind: 'ok'; row: Record<string, unknown> }
  | { kind: 'error'; response: NextResponse };

// PUT - Update offer. Who may edit is offerActions().canEdit: the owner before submit (and an
// approved offer), a reviewer holding a pending step's level, the superuser. A 'sent' offer is
// read-only for everyone.
//
// Wersjonowanie: gdy przesłane dane (nazwa lub offer_data) RÓŻNIĄ się od tego, co jest
// w bazie, zapis NIE nadpisuje wiersza w miejscu — wstawia nowy wiersz-wersję
// (root_offer_id/version_number), a oryginał zostaje nietknięty i nadal widoczny na
// liście ofert. Zapis bez żadnej zmiany robi zwykły UPDATE, żeby nie mnożyć wersji.
//
// A changed version is re-assessed for its OWNER (also when a reviewer edits it), so the new
// version may need a different - possibly higher - level than the one being edited.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { ctx } = auth;

    const { id } = await params;
    const offerId = Number.parseInt(id, 10);
    const { offer_name, offer_data } = ((await request.json().catch(() => null)) ?? {}) as {
      offer_name?: unknown;
      offer_data?: Record<string, unknown>;
    };

    // Nazwa opcjonalna - wyczyszczenie jej przywraca nazwę zastępczą "offer_<ID>"
    // (display_name to kolumna generowana, przelicza się sama przy UPDATE/INSERT).
    if (!offer_data || typeof offer_data !== 'object' || !Number.isInteger(offerId)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const itemsError = validateOfferItems(offer_data);
    if (itemsError) {
      return NextResponse.json({ error: itemsError }, { status: 400 });
    }
    const name = typeof offer_name === 'string' && offer_name.trim() ? offer_name.trim() : null;

    const db = await pool.connect();
    let outcome: PutOutcome;
    try {
      await db.query('BEGIN');
      outcome = await updateInTransaction(db, ctx, offerId, name, offer_data);
      await db.query(outcome.kind === 'ok' ? 'COMMIT' : 'ROLLBACK');
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      db.release();
    }

    if (outcome.kind === 'error') return outcome.response;
    return NextResponse.json({ offer: outcome.row });
  } catch (error) {
    console.error('Error updating offer:', error);
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 });
  }
}

type Tx = PoolClient;

function readOnlySent(): PutOutcome {
  return {
    kind: 'error',
    response: NextResponse.json(
      { error: 'Oferta została wysłana do klienta i jest tylko do odczytu' },
      { status: 409 }
    ),
  };
}

async function updateInTransaction(
  db: Tx,
  ctx: AccessContext,
  offerId: number,
  name: string | null,
  offerData: Record<string, unknown>
): Promise<PutOutcome> {
  // Row lock first (FOR UPDATE) - the same data is read below for the comparison and the next
  // version number, so a parallel save must not slip in between.
  const existing = await loadVisibleOffer(ctx, offerId, db, true);
  if (!existing) {
    return { kind: 'error', response: NextResponse.json({ error: 'Offer not found' }, { status: 404 }) };
  }
  if (existing.status === 'sent') return readOnlySent();

  const { actions } = await describeOffer(ctx, existing, db);
  if (!actions.canEdit) return { kind: 'error', response: accessError('cannot_edit') };

  const editorPerms = ctx.memberships.find((m) => m.flowId === existing.flow_id)?.permissions;
  const violation = fieldViolation(
    ctx.isSuperuser || !editorPerms ? 'all' : editorPerms,
    offerData,
    existing.offer_data,
    await loadBaseResolver(offerData.validFrom, db),
    await loadDefaultMarginPct(db)
  );
  if (violation) return { kind: 'error', response: accessError(violation) };

  // Jak w POST /api/offers: dane klienta lądują też w katalogu `clients`, w tej samej
  // transakcji co zapis oferty.
  const clientInfo = normalizeClientInfo(offerData.clientInfo);
  const clientId = await upsertClientFromOffer(db, clientInfo, ctx.userId);
  const unchanged = existing.offer_name === name && deepEqual(existing.offer_data, offerData);

  if (unchanged) {
    const result = await db.query(
      `UPDATE offers
       SET offer_name = $1, offer_data = $2, client_id = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, offer_name, display_name, offer_data, status, flow_id, created_at, updated_at,
                 root_offer_id, version_number`,
      [name, JSON.stringify(offerData), clientId, offerId]
    );
    return { kind: 'ok', row: result.rows[0] };
  }

  // Korzen rodziny: jesli edytowany wiersz to juz wersja, korzeniem zostaje jego wlasny
  // root_offer_id. Postgres nie pozwala łączyć FOR UPDATE z MAX - blokujemy wiersze rodziny,
  // a maksimum liczymy w JS.
  const rootId = existing.root_offer_id ?? existing.id;
  // Serialize version numbering per family: FOR UPDATE below cannot see a version a parallel
  // transaction is inserting right now, so two saves could otherwise pick the same number.
  await db.query(`SELECT pg_advisory_xact_lock(hashtext('offer_family'), $1)`, [rootId]);
  const versionResult = await db.query(
    `SELECT version_number FROM offers WHERE id = $1 OR root_offer_id = $1 FOR UPDATE`,
    [rootId]
  );
  const nextVersion = Math.max(0, ...versionResult.rows.map((r: { version_number: unknown }) => Number(r.version_number))) + 1;

  const assessment = await assessOffer({ flowId: existing.flow_id, ownerId: existing.user_id, offerData }, db);

  // Owner and flow of the version = those of the edited row, never the editor's: a reviewer
  // correcting someone's offer must not take it over. A version of an offer in review (or an
  // approved one) is re-assessed: still needs an approval -> review continues on the new
  // version with fresh steps; nothing left to approve (e.g. the reviewer fixed the margin) ->
  // approved. Draft / rejected versions keep their status.
  let versionStatus = existing.status;
  if (existing.status === 'pending_review' || existing.status === 'approved') {
    if (assessment.plan.blocked) {
      return { kind: 'error', response: accessError('level_conflict', { validation: snapshotOf(assessment) }) };
    }
    versionStatus = needsValidation(assessment.plan) ? 'pending_review' : 'approved';
  }

  const inserted = await db.query(
    `INSERT INTO offers (user_id, offer_name, offer_data, client_id, status, root_offer_id,
                         version_number, flow_id, validation_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, offer_name, display_name, offer_data, status, flow_id, created_at, updated_at,
               root_offer_id, version_number`,
    [existing.user_id, name, JSON.stringify(offerData), clientId, versionStatus, rootId,
      nextVersion, existing.flow_id, JSON.stringify(snapshotOf(assessment))]
  );
  const row = inserted.rows[0];

  if (versionStatus === 'pending_review') {
    await replacePendingSteps(row.id, assessment.plan, db);
  }
  // The edited version no longer waits for anyone - its open steps moved to the new version.
  await db.query(
    `UPDATE offer_approval_steps SET status = 'superseded' WHERE offer_id = $1 AND status = 'pending'`,
    [existing.id]
  );
  return { kind: 'ok', row };
}

// DELETE - Delete an own draft/rejected offer. An offer in review, approved or sent keeps its
// approval trail and cannot be deleted.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const session = auth.ctx;

    const { id } = await params;
    const offerId = Number.parseInt(id, 10);
    if (!Number.isInteger(offerId)) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const result = await pool.query(
      `DELETE FROM offers WHERE id = $1 AND user_id = $2 AND status IN ('draft', 'rejected') RETURNING id`,
      [offerId, session.userId]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query(
        `SELECT status FROM offers WHERE id = $1 AND user_id = $2`,
        [offerId, session.userId]
      );
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: 'Usunąć można tylko szkic lub odrzuconą ofertę' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting offer:', error);
    return NextResponse.json({ error: 'Failed to delete offer' }, { status: 500 });
  }
}
