import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Wyślij ofertę do weryfikacji (TYLKO junior, własną).
// Senior nie potrzebuje weryfikacji — może bezpośrednio zatwierdzać/wysyłać.
// draft/rejected -> pending_review
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireRole(['junior']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = parseInt(id);

    const result = await pool.query(
      `UPDATE offers
       SET status = 'pending_review', rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status IN ('draft', 'rejected')
       RETURNING id, status`,
      [offerId, session.userId]
    );

    if (result.rows.length === 0) {
      // Nie właściciel / nie istnieje / zły status wyjściowy.
      return NextResponse.json(
        { error: 'Nie można wysłać tej oferty do weryfikacji' },
        { status: 409 }
      );
    }

    return NextResponse.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error submitting offer:', error);
    return NextResponse.json({ error: 'Failed to submit offer' }, { status: 500 });
  }
}
