import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Wyślij ofertę do klienta -> sent (staje się read-only).
// Senior: własna oferta w draft LUB approved (może wysłać bez weryfikacji) ORAZ
//   cudza oferta approved (np. ta, którą sam zrecenzował).
// Admin: dowolna oferta approved (admin nie posiada własnych ofert).
// Junior: własna oferta tylko w approved (po zatwierdzeniu przez seniora/admina).
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = parseInt(id);

    let result;
    if (session.role === 'admin') {
      // Admin: dowolna cudza oferta approved ORAZ własna draft/approved (jak senior).
      // Bez drugiego warunku admin nie mógł wysłać oferty, którą sam przed chwilą stworzył.
      result = await pool.query(
        `UPDATE offers
         SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND ((user_id = $2 AND status = ANY(ARRAY['draft','approved']::text[]))
                OR (user_id IS DISTINCT FROM $2 AND status = 'approved'))
         RETURNING id, status, sent_at`,
        [offerId, session.userId]
      );
    } else if (session.role === 'senior') {
      // Senior: własna oferta draft/approved, LUB cudza approved (zrecenzowana).
      result = await pool.query(
        `UPDATE offers
         SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND ((user_id = $2 AND status = ANY(ARRAY['draft','approved']::text[]))
                OR (user_id IS DISTINCT FROM $2 AND status = 'approved'))
         RETURNING id, status, sent_at`,
        [offerId, session.userId]
      );
    } else {
      // Junior: tylko własna oferta approved.
      result = await pool.query(
        `UPDATE offers
         SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2 AND status = 'approved'
         RETURNING id, status, sent_at`,
        [offerId, session.userId]
      );
    }

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
