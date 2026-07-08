import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Wyślij ofertę do klienta -> sent (staje się read-only).
// Senior: własna oferta w draft LUB approved (może wysłać bez weryfikacji).
// Junior: własna oferta tylko w approved (po zatwierdzeniu przez seniora).
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireRole(['junior', 'senior']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = parseInt(id);

    // Senior może wysłać z draft lub approved; junior tylko z approved.
    const allowedStatuses =
      session.role === 'senior' ? ['draft', 'approved'] : ['approved'];

    const result = await pool.query(
      `UPDATE offers
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status = ANY($3::text[])
       RETURNING id, status, sent_at`,
      [offerId, session.userId, allowedStatuses]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Nie można wysłać tej oferty do klienta w obecnym statusie' },
        { status: 409 }
      );
    }

    return NextResponse.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error sending offer:', error);
    return NextResponse.json({ error: 'Failed to send offer' }, { status: 500 });
  }
}
