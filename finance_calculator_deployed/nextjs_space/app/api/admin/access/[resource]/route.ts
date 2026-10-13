import { NextRequest, NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/access/context';
import { MutationError, runAdminMutation, type MutationMethod } from '@/lib/access/adminMutations';

interface RouteParams {
  params: Promise<{ resource: string }>;
}

// Superuser-only edits of the access configuration. The URL segment names the resource
// (flows, levels, roles, flow-roles, memberships, rules, visibility, policies), the HTTP verb
// the operation; lib/access/adminMutations.ts validates the JSON body and writes it.
async function handle(request: NextRequest, { params }: RouteParams, method: MutationMethod) {
  const auth = await requireSuperuser();
  if ('error' in auth) return auth.error;
  const { resource } = await params;
  try {
    const body = await request.json().catch(() => null);
    const result = await runAdminMutation(resource, method, body, auth.ctx.userId);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof MutationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(`Error in admin access ${method} ${resource}:`, error);
    return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 });
  }
}

export const POST = (request: NextRequest, ctx: RouteParams) => handle(request, ctx, 'POST');
export const PATCH = (request: NextRequest, ctx: RouteParams) => handle(request, ctx, 'PATCH');
export const PUT = (request: NextRequest, ctx: RouteParams) => handle(request, ctx, 'PUT');
export const DELETE = (request: NextRequest, ctx: RouteParams) => handle(request, ctx, 'DELETE');
