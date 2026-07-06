import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Duplicate offer
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const offerId = parseInt(id);

    // Get the original offer
    const originalResult = await pool.query(
      `SELECT offer_name, offer_data FROM offers WHERE id = $1 AND user_id = $2`,
      [offerId, session.userId]
    );

    if (originalResult.rows.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const original = originalResult.rows[0];
    const newName = `Kopia ${original.offer_name}`;

    // Create duplicate
    const result = await pool.query(
      `INSERT INTO offers (user_id, offer_name, offer_data) 
       VALUES ($1, $2, $3) 
       RETURNING id, offer_name, offer_data, created_at, updated_at`,
      [session.userId, newName, original.offer_data]
    );

    return NextResponse.json({ offer: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Error duplicating offer:', error);
    return NextResponse.json({ error: 'Failed to duplicate offer' }, { status: 500 });
  }
}
