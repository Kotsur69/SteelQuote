import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { requireAccess } from '@/lib/access/context';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    turnId: z.number().int().positive(),
    rating: z.union([z.literal(1), z.literal(-1)]),
    comment: z.string().trim().max(500).optional(),
  })
  .strict();

// POST - thumbs up / down on one assistant answer. Body: { turnId, rating: 1 | -1, comment? }.
// A user can rate only their own turns; rating again replaces the earlier rating.
export async function POST(request: NextRequest) {
  const auth = await requireAccess();
  if ('error' in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { turnId, rating, comment } = parsed.data;

  try {
    const result = await pool.query(
      `INSERT INTO ai_feedback (turn_id, user_id, rating, comment)
       SELECT t.id, $2, $3, $4 FROM ai_turns t WHERE t.id = $1 AND t.user_id = $2
       ON CONFLICT (turn_id, user_id) DO UPDATE
         SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = CURRENT_TIMESTAMP`,
      [turnId, auth.ctx.userId, rating, comment || null]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving assistant feedback:', error);
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}
