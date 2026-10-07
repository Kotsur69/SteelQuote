import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/access/context';
import { loadAdminConfig } from '@/lib/access/adminConfig';

export const dynamic = 'force-dynamic';

// GET - the whole access configuration (levels, flows, roles, roles in flows with permissions
// and visibility, rules, policies, users with memberships) for the admin panels.
export async function GET() {
  const auth = await requireSuperuser();
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json(await loadAdminConfig());
  } catch (error) {
    console.error('Error loading access configuration:', error);
    return NextResponse.json({ error: 'Failed to load access configuration' }, { status: 500 });
  }
}
