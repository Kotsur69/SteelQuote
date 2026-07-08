import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Odrzuć ofertę (senior lub admin). Body: { reason }. pending_review -> rejected.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireRole(['senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = parseInt(id);

    const { reason } = await request.json();
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Powód odrzucenia jest wymagany' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE offers
       SET status = 'rejected',
           reviewed_by = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           rejection_reason = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending_review'
       RETURNING id, status, reviewed_by, reviewed_at, rejection_reason`,
      [offerId, session.userId, reason.trim()]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Oferta nie jest w statusie oczekującym na weryfikację' },
        { status: 409 }
      );
    }

    return NextResponse.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error rejecting offer:', error);
    return NextResponse.json({ error: 'Failed to reject offer' }, { status: 500 });
  }
}
