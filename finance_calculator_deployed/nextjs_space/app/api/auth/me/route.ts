import { NextResponse } from 'next/server';
import { requireAccess, toAccessSummary } from '@/lib/access/context';

// Per-request (reads the session cookie); never prerendered at build time.
export const dynamic = 'force-dynamic';

// GET - the signed-in user plus a FRESH access summary (memberships, active flow, permissions
// in it). The UI renders actions and links from this; every API route re-checks on its own.
export async function GET() {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const access = toAccessSummary(auth.ctx);
    return NextResponse.json({
      user: { id: access.userId, email: access.email, fullName: access.fullName },
      access,
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}
