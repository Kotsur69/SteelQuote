import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { forbidden, isApproverAnywhere, requireAccess } from '@/lib/access/context';
import { awaitingMyReviewSql } from '@/lib/access/scope';
import { escapeLikePattern } from '@/lib/search';

export const dynamic = 'force-dynamic';

const OFFER_COLUMNS = `o.id, o.offer_name, o.display_name, o.offer_data, o.status, o.user_id,
  o.created_at, o.updated_at, o.reviewed_by, o.reviewed_at, o.rejection_reason, o.sent_at,
  o.root_offer_id, o.version_number,
  u.full_name AS owner_name, u.email AS owner_email,
  r.full_name AS reviewer_name, f.name AS flow_name, o.validation_snapshot,
  ARRAY(SELECT l.code FROM offer_approval_steps ps JOIN hierarchy_levels l ON l.id = ps.level_id
        WHERE ps.offer_id = o.id AND ps.status = 'pending' ORDER BY ps.id) AS pending_levels`;

// Nazwa własna, nazwa zastępcza ("offer_30"), surowe ID oraz firma/SAP ID klienta
// (z offer_data->clientInfo) w jednym polu — patrz /api/offers.
const SEARCH_CLAUSE = `(
  o.display_name ILIKE '%' || $2 || '%'
  OR o.id::text = $2
  OR o.offer_data->'clientInfo'->>'company' ILIKE '%' || $2 || '%'
  OR o.offer_data->'clientInfo'->>'sapId' ILIKE '%' || $2 || '%'
)`;

// GET - the validation queue (review panel). Approvers only (anyone who may approve in some
// flow, or the superuser):
//   - offers with a pending approval step at a level the user holds in that offer's flow
//     (lib/access/scope.ts awaitingMyReviewSql) - flagged awaiting_me
//   - offers the user already decided (their review history)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const session = auth.ctx;
    if (!isApproverAnywhere(session)) return forbidden();

    // $1 = the user, $2 = the search phrase (SEARCH_CLAUSE is written against $2), so the
    // queue predicate appends its own parameters after them.
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    const params: unknown[] = [session.userId, q ? escapeLikePattern(q) : null];
    const awaiting = awaitingMyReviewSql(session, params, 'o');
    const history = `(o.reviewed_by = $1 OR EXISTS (SELECT 1 FROM offer_approval_steps hs WHERE hs.offer_id = o.id AND hs.decided_by = $1))`;
    const visibility = `(${awaiting} OR ${history})`;
    // $2 is always bound (NULL without a phrase) so the queue placeholders never shift.
    const where = `${visibility} AND ($2::text IS NULL OR ${SEARCH_CLAUSE})`;

    const result = await pool.query(
      `SELECT ${OFFER_COLUMNS}, ${awaiting} AS awaiting_me
       FROM offers o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN users r ON r.id = o.reviewed_by
       LEFT JOIN flows f ON f.id = o.flow_id
       WHERE ${where}
       ORDER BY
         CASE WHEN ${awaiting} THEN 0 ELSE 1 END,
         o.updated_at DESC`,
      params
    );

    return NextResponse.json({
      offers: result.rows,
      userId: session.userId,
    });
  } catch (error) {
    console.error('Error fetching senior offers:', error);
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}
