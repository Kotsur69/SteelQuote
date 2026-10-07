import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ACTIVE_FLOW_COOKIE, requireAccess } from '@/lib/access/context';

const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30;

// POST { flowId } - flow switcher. New offers are created in the active flow. Only a flow the
// user is a member of (any active flow for the superuser) is accepted; the choice is kept in a
// cookie for this browser and in users.last_flow_id as the default for the next login.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { ctx } = auth;

    const body = (await request.json().catch(() => ({}))) as { flowId?: unknown };
    const flowId = typeof body.flowId === 'number' ? body.flowId : Number.NaN;
    if (!Number.isInteger(flowId) || !ctx.flows.some((f) => f.id === flowId)) {
      return NextResponse.json({ error: 'Brak dostępu do tego flow' }, { status: 403 });
    }

    await pool.query(`UPDATE users SET last_flow_id = $1 WHERE id = $2`, [flowId, ctx.userId]);

    const response = NextResponse.json({ activeFlowId: flowId });
    response.cookies.set(ACTIVE_FLOW_COOKIE, String(flowId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_S,
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('Error switching flow:', error);
    return NextResponse.json({ error: 'Failed to switch flow' }, { status: 500 });
  }
}
