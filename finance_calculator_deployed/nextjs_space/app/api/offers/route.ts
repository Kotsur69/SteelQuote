import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { escapeLikePattern } from '@/lib/search';
import { requireAccess } from '@/lib/access/context';
import { offerVisibilitySql } from '@/lib/access/scope';
import { createAssessor, loadStepsForOffers, offerActions, type OfferStatus } from '@/lib/access/workflow';
import { loadPolicies } from '@/lib/access/config';
import { createOffer, inTransaction } from '@/lib/offers/service';
import { toResponse } from '@/lib/offers/http';
import { PREDECESSOR_COLUMNS, PREDECESSOR_JOIN } from '@/lib/offerVersions';
import { withChangeSummary } from '@/lib/offerVersionDiff';

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
      `SELECT ${OFFER_COLUMNS}, ${PREDECESSOR_COLUMNS}
       FROM offers o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN flows f ON f.id = o.flow_id
       ${PREDECESSOR_JOIN}
       WHERE ${where}
       ORDER BY o.created_at DESC`,
      params
    );

    const stepsByOffer = await loadStepsForOffers(result.rows.map((r) => Number(r.id)));
    const assess = createAssessor();
    const policy = { validityHours: (await loadPolicies()).approvalValidityHours, now: new Date() };
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
          plan,
          policy
        );
        return {
          ...withChangeSummary(row),
          actions,
          pending_levels: steps.filter((s) => s.status === 'pending').map((s) => s.levelCode),
        };
      })
    );

    return NextResponse.json({ offers, userId: ctx.userId });
  } catch (error) {
    console.error('Error fetching offers:', error);
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}

// POST - Create a new offer in the caller's ACTIVE flow (flow switcher). Rules: lib/offers/create.ts.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;

    const body = ((await request.json().catch(() => null)) ?? {}) as { offer_name?: unknown; offer_data?: unknown };
    const result = await inTransaction((tx) => createOffer(tx, auth.ctx, { name: body.offer_name, offerData: body.offer_data }));
    return toResponse(result, 201);
  } catch (error) {
    console.error('Error creating offer:', error);
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 });
  }
}
