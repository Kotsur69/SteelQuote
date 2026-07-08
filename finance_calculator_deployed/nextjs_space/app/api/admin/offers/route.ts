import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

const VALID_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'sent'];

// GET - Wszystkie oferty wszystkich handlowców z filtrami (tylko admin).
// Query params: status, user_id, date_from (YYYY-MM-DD), date_to (YYYY-MM-DD).
export async function GET(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const sp = request.nextUrl.searchParams;
    const status = sp.get('status');
    const userId = sp.get('user_id');
    const dateFrom = sp.get('date_from');
    const dateTo = sp.get('date_to');

    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (status && VALID_STATUSES.includes(status)) {
      conditions.push(`o.status = $${i++}`);
      values.push(status);
    }
    if (userId) {
      conditions.push(`o.user_id = $${i++}`);
      values.push(parseInt(userId));
    }
    if (dateFrom) {
      conditions.push(`o.created_at >= $${i++}`);
      values.push(dateFrom);
    }
    if (dateTo) {
      // Włącznie z całym dniem date_to.
      conditions.push(`o.created_at < ($${i++}::date + interval '1 day')`);
      values.push(dateTo);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT o.id, o.offer_name, o.offer_data, o.status, o.user_id,
              o.created_at, o.updated_at, o.reviewed_by, o.reviewed_at,
              o.rejection_reason, o.sent_at,
              u.full_name AS owner_name, u.email AS owner_email,
              r.full_name AS reviewer_name, r.email AS reviewer_email
       FROM offers o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN users r ON r.id = o.reviewed_by
       ${where}
       ORDER BY o.created_at DESC`,
      values
    );

    return NextResponse.json({ offers: result.rows });
  } catch (error) {
    console.error('Error fetching admin offers:', error);
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}
