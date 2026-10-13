import { NextRequest, NextResponse } from 'next/server';
import { forbidden, isApproverAnywhere, requireAccess } from '@/lib/access/context';
import type { AccessContext } from '@/lib/access/types';
import {
  addTeamMember,
  isEligibleLeader,
  listAssignableMembers,
  listTeam,
  removeTeamMember,
} from '@/lib/teams';

export const dynamic = 'force-dynamic';

// Team management for the analytics scope.
//
// An approver (anyone who may approve in some flow) manages their OWN team and nothing else:
// whatever seniorId (= leader id) the request carries is ignored, the session id wins. The
// superuser manages ANY eligible leader's team and must name one. Every response returns
// the freshly re-read team + the still-assignable juniors, so the client never has to guess.

interface TeamResponse {
  seniorId: number;
  team: Awaited<ReturnType<typeof listTeam>>;
  assignable: Awaited<ReturnType<typeof listAssignableMembers>>;
}

async function payloadFor(seniorId: number): Promise<TeamResponse> {
  const [team, assignable] = await Promise.all([
    listTeam(seniorId),
    listAssignableMembers(seniorId),
  ]);
  return { seniorId, team, assignable };
}

// An approver is pinned to their own id; the superuser must pass a valid leader id.
async function resolveSeniorId(
  ctx: AccessContext,
  raw: string | null
): Promise<{ seniorId: number } | { error: NextResponse }> {
  if (!ctx.isSuperuser) {
    return { seniorId: ctx.userId };
  }
  const seniorId = Number.parseInt(raw ?? '', 10);
  if (!Number.isInteger(seniorId) || seniorId <= 0) {
    return { error: NextResponse.json({ error: 'Brak identyfikatora seniora' }, { status: 400 }) };
  }
  if (!(await isEligibleLeader(seniorId))) {
    return {
      error: NextResponse.json(
        { error: 'Wskazane konto nie może prowadzić zespołu (brak uprawnienia do zatwierdzania)' },
        { status: 400 }
      ),
    };
  }
  return { seniorId };
}

export async function GET(request: NextRequest) {
  const auth = await requireAccess();
  if ('error' in auth) return auth.error;
  if (!isApproverAnywhere(auth.ctx)) return forbidden();

  try {
    const resolved = await resolveSeniorId(
      auth.ctx,
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
  const auth = await requireAccess();
  if ('error' in auth) return auth.error;
  if (!isApproverAnywhere(auth.ctx)) return forbidden();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      seniorId?: unknown;
      juniorId?: unknown;
    };

    const resolved = await resolveSeniorId(
      auth.ctx,
      body.seniorId === undefined ? null : String(body.seniorId)
    );
    if ('error' in resolved) return resolved.error;

    const juniorId = Number.parseInt(String(body.juniorId ?? ''), 10);
    if (!Number.isInteger(juniorId) || juniorId <= 0) {
      return NextResponse.json({ error: 'Nieprawidłowy identyfikator handlowca' }, { status: 400 });
    }

    const outcome = await addTeamMember(resolved.seniorId, juniorId);
    if (outcome === 'not_assignable') {
      return NextResponse.json(
        { error: 'Do zespołu można dodać tylko aktywne konto (nie administratora ani lidera)' },
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
  const auth = await requireAccess();
  if ('error' in auth) return auth.error;
  if (!isApproverAnywhere(auth.ctx)) return forbidden();

  try {
    const sp = request.nextUrl.searchParams;
    const resolved = await resolveSeniorId(auth.ctx, sp.get('seniorId'));
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
