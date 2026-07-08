import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Zatwierdź ofertę (senior lub admin). pending_review -> approved.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireRole(['senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = parseInt(id);

    const result = await pool.query(
      `UPDATE offers
       SET status = 'approved',
           reviewed_by = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           rejection_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending_review'
       RETURNING id, status, reviewed_by, reviewed_at`,
      [offerId, session.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Oferta nie jest w statusie oczekującym na weryfikację' },
        { status: 409 }
      );
    }

    return NextResponse.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error approving offer:', error);
    return NextResponse.json({ error: 'Failed to approve offer' }, { status: 500 });
  }
}
