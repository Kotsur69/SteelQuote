import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

const OFFER_COLUMNS = `o.id, o.offer_name, o.offer_data, o.status, o.user_id,
  o.created_at, o.updated_at, o.reviewed_by, o.reviewed_at, o.rejection_reason, o.sent_at,
  u.full_name AS owner_name, u.email AS owner_email`;

// GET offers widoczne dla bieżącego użytkownika:
//   junior  -> tylko własne
//   senior  -> własne + wszystkie cudze w pending_review (do recenzji)
//   admin   -> tylko własne (admin nie tworzy ofert; przegląd całości jest w /api/admin/offers)
// Zwraca też rolę bieżącego użytkownika, żeby front nie musiał osobno pytać /api/auth/me.
export async function GET() {
  try {
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const where =
      session.role === 'senior'
        ? `o.user_id = $1 OR o.status = 'pending_review'`
        : `o.user_id = $1`;

    const result = await pool.query(
      `SELECT ${OFFER_COLUMNS}
       FROM offers o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE ${where}
       ORDER BY o.created_at DESC`,
      [session.userId]
    );

    return NextResponse.json({ offers: result.rows, role: session.role, userId: session.userId });
  } catch (error) {
    console.error('Error fetching offers:', error);
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}

// POST - Create new offer (junior i senior; admin nie tworzy ofert).
// Nowa oferta startuje w statusie 'draft' (DEFAULT w bazie).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { offer_name, offer_data } = await request.json();

    if (!offer_name || !offer_data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO offers (user_id, offer_name, offer_data)
       VALUES ($1, $2, $3)
       RETURNING id, offer_name, offer_data, status, created_at, updated_at`,
      [session.userId, offer_name, JSON.stringify(offer_data)]
    );

    return NextResponse.json({ offer: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Error creating offer:', error);
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 });
  }
}
