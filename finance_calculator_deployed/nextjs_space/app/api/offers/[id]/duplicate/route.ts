import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Duplicate offer (junior/senior, tylko własną). Kopia startuje jako 'draft'.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Admin też duplikuje własne oferty — na własnych ofertach ma prawa seniora.
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = parseInt(id);

    // Get the original offer
    const originalResult = await pool.query(
      `SELECT display_name, offer_data FROM offers WHERE id = $1 AND user_id = $2`,
      [offerId, session.userId]
    );

    if (originalResult.rows.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const original = originalResult.rows[0];
    // display_name, nie offer_name: oferta bez nazwy własnej dałaby "Kopia null".
    // Kopia dostaje nazwę WŁASNĄ (np. "Kopia offer_30") - to nowy rekord z nowym ID,
    // więc jego własna nazwa zastępcza brzmiałaby "offer_31" i gubiłaby ślad oryginału.
    const newName = `Kopia ${original.display_name}`;

    // Create duplicate
    const result = await pool.query(
      `INSERT INTO offers (user_id, offer_name, offer_data)
       VALUES ($1, $2, $3)
       RETURNING id, offer_name, display_name, offer_data, created_at, updated_at`,
      [session.userId, newName, original.offer_data]
    );

    return NextResponse.json({ offer: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Error duplicating offer:', error);
    return NextResponse.json({ error: 'Failed to duplicate offer' }, { status: 500 });
  }
}
