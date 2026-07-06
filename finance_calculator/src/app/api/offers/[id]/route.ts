import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET single offer
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const offerId = parseInt(id);

    const result = await pool.query(
      `SELECT id, offer_name, offer_data, created_at, updated_at 
       FROM offers 
       WHERE id = $1 AND user_id = $2`,
      [offerId, session.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    return NextResponse.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error fetching offer:', error);
    return NextResponse.json({ error: 'Failed to fetch offer' }, { status: 500 });
  }
}

// PUT - Update offer
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const offerId = parseInt(id);
    const { offer_name, offer_data } = await request.json();

    if (!offer_name || !offer_data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE offers 
       SET offer_name = $1, offer_data = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 AND user_id = $4
       RETURNING id, offer_name, offer_data, created_at, updated_at`,
      [offer_name, JSON.stringify(offer_data), offerId, session.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    return NextResponse.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error updating offer:', error);
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 });
  }
}

// DELETE - Delete offer
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const offerId = parseInt(id);

    const result = await pool.query(
      `DELETE FROM offers WHERE id = $1 AND user_id = $2 RETURNING id`,
      [offerId, session.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting offer:', error);
    return NextResponse.json({ error: 'Failed to delete offer' }, { status: 500 });
  }
}
