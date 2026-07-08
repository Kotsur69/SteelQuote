import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Wszystkie oferty danego handlowca (tylko admin).
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const { id } = await params;
    const userId = parseInt(id);

    const result = await pool.query(
      `SELECT id, offer_name, offer_data, status, created_at, updated_at,
              reviewed_at, rejection_reason, sent_at
       FROM offers
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return NextResponse.json({ offers: result.rows });
  } catch (error) {
    console.error('Error fetching user offers:', error);
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}
