import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/access/context';
import { duplicateOffer, inTransaction } from '@/lib/offers/service';
import { toResponse } from '@/lib/offers/http';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Duplicate an own offer as a new draft. Rules: lib/offers/create.ts duplicateOffer.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) return auth.error;
    const { id } = await params;
    const result = await inTransaction((tx) => duplicateOffer(tx, auth.ctx, Number.parseInt(id, 10)));
    return toResponse(result, 201);
  } catch (error) {
    console.error('Error duplicating offer:', error);
    return NextResponse.json({ error: 'Failed to duplicate offer' }, { status: 500 });
  }
}
