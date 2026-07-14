import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { escapeLikePattern } from '@/lib/search';

export const dynamic = 'force-dynamic';

const OFFER_COLUMNS = `o.id, o.offer_name, o.display_name, o.offer_data, o.status, o.user_id,
  o.created_at, o.updated_at, o.reviewed_by, o.reviewed_at, o.rejection_reason, o.sent_at,
  u.full_name AS owner_name, u.email AS owner_email,
  r.full_name AS reviewer_name`;

// Nazwa własna, nazwa zastępcza ("offer_30") i surowe ID w jednym polu — patrz /api/offers.
const SEARCH_CLAUSE = `(o.display_name ILIKE '%' || $2 || '%' OR o.id::text = $2)`;

// GET — oferty widoczne dla seniora w panelu recenzji:
//   - wszystkie cudze w pending_review
//   - wszystkie, które senior sam zrecenzował (approved/rejected reviewed_by = userId)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const visibility = `((o.status = 'pending_review' AND o.user_id <> $1) OR (o.reviewed_by = $1))`;

    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    const params: unknown[] = [session.userId];
    let where = visibility;
    if (q) {
      params.push(escapeLikePattern(q));
      where = `${visibility} AND ${SEARCH_CLAUSE}`;
    }

    const result = await pool.query(
      `SELECT ${OFFER_COLUMNS}
       FROM offers o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN users r ON r.id = o.reviewed_by
       WHERE ${where}
       ORDER BY
         CASE WHEN o.status = 'pending_review' THEN 0 ELSE 1 END,
         o.updated_at DESC`,
      params
    );

    return NextResponse.json({
      offers: result.rows,
      role: session.role,
      userId: session.userId,
    });
  } catch (error) {
    console.error('Error fetching senior offers:', error);
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}
