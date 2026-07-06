import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET all offers for current user
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT id, offer_name, offer_data, created_at, updated_at 
       FROM offers 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [session.userId]
    );

    return NextResponse.json({ offers: result.rows });
  } catch (error) {
    console.error('Error fetching offers:', error);
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}

// POST - Create new offer
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { offer_name, offer_data } = await request.json();

    if (!offer_name || !offer_data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO offers (user_id, offer_name, offer_data) 
       VALUES ($1, $2, $3) 
       RETURNING id, offer_name, offer_data, created_at, updated_at`,
      [session.userId, offer_name, JSON.stringify(offer_data)]
    );

    return NextResponse.json({ offer: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Error creating offer:', error);
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 });
  }
}
