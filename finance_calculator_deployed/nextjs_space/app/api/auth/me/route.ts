import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET - Informacje o zalogowanym użytkowniku (świeża rola + is_active z bazy).
// Front używa tego do warunkowego renderowania akcji/linków.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query(
      'SELECT id, email, full_name, role, is_active FROM users WHERE id = $1',
      [session.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return NextResponse.json({ error: 'Konto nieaktywne' }, { status: 403 });
    }

    const u = result.rows[0];
    return NextResponse.json({
      user: { id: u.id, email: u.email, fullName: u.full_name, role: u.role },
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}
