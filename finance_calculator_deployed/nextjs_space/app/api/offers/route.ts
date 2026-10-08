import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { escapeLikePattern } from '@/lib/search';
import { upsertClientFromOffer } from '@/lib/clientDirectory';
import { normalizeClientInfo } from '@/lib/pdfGenerator';
import { can, requireAccess } from '@/lib/access/context';
import { offerVisibilitySql } from '@/lib/access/scope';
import { createAssessor, loadStepsForOffers, offerActions, type OfferStatus } from '@/lib/access/workflow';
import { fieldViolation } from '@/lib/access/fieldGuards';
import { loadBaseResolver, loadDefaultMarginPct } from '@/lib/access/config';
import { accessError } from '@/lib/access/errors';
import { validateOfferItems } from '@/lib/offerItemValidation';

const OFFER_COLUMNS = `o.id, o.offer_name, o.display_name, o.offer_data, o.status, o.user_id,
  o.created_at, o.updated_at, o.reviewed_by, o.reviewed_at, o.rejection_reason, o.sent_at,
  o.root_offer_id, o.version_number, o.flow_id, f.name AS flow_name,
  NOT EXISTS (SELECT 1 FROM offers n
              WHERE COALESCE(n.root_offer_id, n.id) = COALESCE(o.root_offer_id, o.id)
                AND n.version_number > o.version_number) AS is_latest,
  o.client_decision, o.client_decision_at, o.client_decision_note, o.client_decision_reason,
  u.full_name AS owner_name, u.email AS owner_email`;

// Wyszukiwarka: jedno pole `q` przeszukuje nazwę własną handlowca, nazwę zastępczą
// ("offer_30"), surowe ID ORAZ firmę/SAP ID klienta zapisane w samej ofercie.
// display_name jest kolumną generowaną, więc pokrywa dwa pierwsze przypadki jednym
// ILIKE. o.id::text (a nie o.id = $n) pozwala porównać ID z dowolnym tekstem bez
// wywalania zapytania na niepoprawnej liczbie. Firma/SAP ID czytane z
// offer_data->clientInfo (nie z tabeli clients) celowo — to dokładnie ten tekst,
// który handlowiec widzi w wierszu listy (clientCompanyLine we froncie), więc
// wynik wyszukiwania zawsze wizualnie pasuje do wpisanej frazy.
function searchClause(p: string): string {
  return `(
    o.display_name ILIKE '%' || ${p} || '%'
    OR o.id::text = ${p}
    OR o.offer_data->'clientInfo'->>'company' ILIKE '%' || ${p} || '%'
    OR o.offer_data->'clientInfo'->>'sapId' ILIKE '%' || ${p} || '%'
  )`;
}

// GET - offers the caller may see under the visibility matrix (lib/access/scope.ts), each
// with the actions the caller may take on it (lib/access/workflow.ts offerActions), so the
// list renders buttons from the same rules the mutating routes enforce.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { ctx } = auth;

    const params: unknown[] = [];
    let where = offerVisibilitySql(ctx, params, 'o');
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    if (q) {
      params.push(escapeLikePattern(q));
      where = `${where} AND ${searchClause(`$${params.length}`)}`;
    }

    const result = await pool.query(
      `SELECT ${OFFER_COLUMNS}
       FROM offers o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN flows f ON f.id = o.flow_id
       WHERE ${where}
       ORDER BY o.created_at DESC`,
      params
    );

    const stepsByOffer = await loadStepsForOffers(result.rows.map((r) => Number(r.id)));
    const assess = createAssessor();
    const offers = await Promise.all(
      result.rows.map(async (row) => {
        const status = row.status as OfferStatus;
        const steps = stepsByOffer.get(Number(row.id)) ?? [];
        const plan = status === 'sent'
          ? null
          : (await assess({ flowId: row.flow_id, ownerId: row.user_id, offerData: row.offer_data })).plan;
        const actions = offerActions(
          ctx,
          {
            userId: row.user_id,
            flowId: row.flow_id,
            status,
            isLatest: row.is_latest === true,
            clientDecision: row.client_decision,
          },
          steps,
          plan
        );
        return { ...row, actions, pending_levels: steps.filter((s) => s.status === 'pending').map((s) => s.levelCode) };
      })
    );

    return NextResponse.json({ offers, userId: ctx.userId });
  } catch (error) {
    console.error('Error fetching offers:', error);
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}

// POST - Create a new offer in the caller's ACTIVE flow (flow switcher). Requires
// can_create_offer there. Starts as 'draft' (DB default).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { ctx } = auth;

    const flowId = ctx.activeFlowId;
    if (flowId === null) return accessError('no_flow');
    if (!can(ctx, flowId, 'canCreateOffer')) return accessError('cannot_create');

    const { offer_name, offer_data } = ((await request.json().catch(() => null)) ?? {}) as {
      offer_name?: unknown;
      offer_data?: Record<string, unknown>;
    };

    // Nazwa jest opcjonalna. Pusta => zapisujemy NULL, a baza (kolumna generowana
    // display_name) sama nada "offer_<ID>" w tym samym INSERCIE.
    if (!offer_data || typeof offer_data !== 'object') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const itemsError = validateOfferItems(offer_data);
    if (itemsError) {
      return NextResponse.json({ error: itemsError }, { status: 400 });
    }

    const membership = ctx.memberships.find((m) => m.flowId === flowId);
    const violation = fieldViolation(
      ctx.isSuperuser || !membership ? 'all' : membership.permissions,
      offer_data,
      null,
      await loadBaseResolver(offer_data.validFrom),
      await loadDefaultMarginPct()
    );
    if (violation) return accessError(violation);

    const name = typeof offer_name === 'string' && offer_name.trim() ? offer_name.trim() : null;

    // Dane klienta z oferty trafiają też do katalogu `clients`, żeby wyszukiwarka
    // firmy/NIP-u w kalkulatorze uczyła się nowych klientów (patrz lib/clientDirectory.ts).
    // Klient i oferta zapisują się w JEDNEJ transakcji — nieudany INSERT oferty nie ma
    // zostawiać w katalogu firmy bez ani jednej oferty.
    const clientInfo = normalizeClientInfo(offer_data.clientInfo);

    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      const clientId = await upsertClientFromOffer(db, clientInfo, ctx.userId);

      const result = await db.query(
        `INSERT INTO offers (user_id, offer_name, offer_data, client_id, flow_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, offer_name, display_name, offer_data, status, flow_id, created_at, updated_at`,
        [ctx.userId, name, JSON.stringify(offer_data), clientId, flowId]
      );

      await db.query('COMMIT');
      return NextResponse.json({ offer: result.rows[0] }, { status: 201 });
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    console.error('Error creating offer:', error);
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 });
  }
}
