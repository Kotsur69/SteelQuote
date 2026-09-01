import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import type { FreshSession } from '@/lib/rbac';
import {
  addTeamMember,
  isActiveSenior,
  listAssignableJuniors,
  listTeam,
  removeTeamMember,
} from '@/lib/teams';

export const dynamic = 'force-dynamic';

// Team management for the analytics scope.
//
// A senior manages their OWN team and nothing else: whatever seniorId the request carries is
// ignored for a senior, the session id wins. An admin manages ANY senior's team and must name
// one - there is no "admin's own team" because admins do not own offers. Every response returns
// the freshly re-read team + the still-assignable juniors, so the client never has to guess.

interface TeamResponse {
  seniorId: number;
  team: Awaited<ReturnType<typeof listTeam>>;
  assignable: Awaited<ReturnType<typeof listAssignableJuniors>>;
}

async function payloadFor(seniorId: number): Promise<TeamResponse> {
  const [team, assignable] = await Promise.all([
    listTeam(seniorId),
    listAssignableJuniors(seniorId),
  ]);
  return { seniorId, team, assignable };
}

// A senior is pinned to their own id; an admin must pass a valid active senior id.
async function resolveSeniorId(
  session: FreshSession,
  raw: string | null
): Promise<{ seniorId: number } | { error: NextResponse }> {
  if (session.role === 'senior') {
    return { seniorId: session.userId };
  }
  const seniorId = Number.parseInt(raw ?? '', 10);
  if (!Number.isInteger(seniorId) || seniorId <= 0) {
    return { error: NextResponse.json({ error: 'Brak identyfikatora seniora' }, { status: 400 }) };
  }
  if (!(await isActiveSenior(seniorId))) {
    return {
      error: NextResponse.json(
        { error: 'Wskazane konto nie jest aktywnym seniorem' },
        { status: 400 }
      ),
    };
  }
  return { seniorId };
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(['senior', 'admin']);
  if ('error' in auth) return auth.error;

  try {
    const resolved = await resolveSeniorId(
      auth.session,
      request.nextUrl.searchParams.get('seniorId')
    );
    if ('error' in resolved) return resolved.error;
    return NextResponse.json(await payloadFor(resolved.seniorId));
  } catch (error) {
    console.error('Error loading team:', error);
    return NextResponse.json({ error: 'Failed to load team' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(['senior', 'admin']);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      seniorId?: unknown;
      juniorId?: unknown;
    };

    const resolved = await resolveSeniorId(
      auth.session,
      body.seniorId === undefined ? null : String(body.seniorId)
    );
    if ('error' in resolved) return resolved.error;

    const juniorId = Number.parseInt(String(body.juniorId ?? ''), 10);
    if (!Number.isInteger(juniorId) || juniorId <= 0) {
      return NextResponse.json({ error: 'Nieprawidłowy identyfikator handlowca' }, { status: 400 });
    }

    const outcome = await addTeamMember(resolved.seniorId, juniorId);
    if (outcome === 'not_a_junior') {
      return NextResponse.json(
        { error: 'Do zespołu można dodać tylko aktywnego juniora' },
        { status: 400 }
      );
    }

    return NextResponse.json(await payloadFor(resolved.seniorId));
  } catch (error) {
    console.error('Error adding team member:', error);
    return NextResponse.json({ error: 'Failed to add team member' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(['senior', 'admin']);
  if ('error' in auth) return auth.error;

  try {
    const sp = request.nextUrl.searchParams;
    const resolved = await resolveSeniorId(auth.session, sp.get('seniorId'));
    if ('error' in resolved) return resolved.error;

    const juniorId = Number.parseInt(sp.get('juniorId') ?? '', 10);
    if (!Number.isInteger(juniorId) || juniorId <= 0) {
      return NextResponse.json({ error: 'Nieprawidłowy identyfikator handlowca' }, { status: 400 });
    }

    // A no-op delete (pair was not there) is not an error - the end state is what the caller
    // asked for. The refreshed payload shows the truth either way.
    await removeTeamMember(resolved.seniorId, juniorId);
    return NextResponse.json(await payloadFor(resolved.seniorId));
  } catch (error) {
    console.error('Error removing team member:', error);
    return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 });
  }
}
