import { NextRequest, NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/access/context';
import { loadLostReasons, readLostReasonUsage, readLostReasons, toLostReasonDef } from '@/lib/lostReasonsDb';
import { findDuplicateLabel, nextSortOrder, parseReasonLabels, parseReorder, SORT_STEP } from '@/lib/lostReasonValidation';
import { adminError, readJson, withReasonsLock } from '@/lib/lostReasonsAdminApi';

// Lost-reason list editor (/admin/powody-przegranej) - superuser only, re-checked fresh here
// like every /api/admin route.
//   GET  -> { reasons (archived included), usage: { code: lostOffers }, migrated }
//   POST -> add { labels: { pl, en, cs, de } }; the code is generated ('r<id>')
//   PUT  -> reorder { order: [code, ...] } listing every reason once

export async function GET() {
  const auth = await requireSuperuser();
  if ('error' in auth) return auth.error;
  try {
    const [{ reasons, migrated }, usage] = await Promise.all([loadLostReasons(), readLostReasonUsage()]);
    return NextResponse.json({ reasons, usage, migrated });
  } catch (error) {
    console.error('Error fetching lost reasons (admin):', error);
    return NextResponse.json({ error: 'Failed to fetch lost reasons' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperuser();
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (!body) return adminError('invalid_json', 400);

  const parsed = parseReasonLabels((body as { labels?: unknown }).labels);
  if (!parsed.ok) return adminError(parsed.error, 400, { lang: parsed.lang });
  const { labels } = parsed;

  return withReasonsLock(async (db) => {
    const existing = await readLostReasons(db, true);
    const duplicate = findDuplicateLabel(labels, existing);
    if (duplicate) return { rollback: true, response: adminError('duplicate', 409, { lang: duplicate }) };
    const result = await db.query(
      `INSERT INTO lost_reasons (id, code, label_pl, label_en, label_cs, label_de, sort_order, created_by)
       SELECT s.n, 'r' || s.n, $1, $2, $3, $4, $5, $6
       FROM (SELECT nextval(pg_get_serial_sequence('lost_reasons', 'id')) AS n) s
       RETURNING code, label_pl, label_en, label_cs, label_de, sort_order, is_system, archived_at`,
      [labels.pl, labels.en, labels.cs, labels.de, nextSortOrder(existing), auth.ctx.userId]
    );
    return { response: NextResponse.json({ reason: toLostReasonDef(result.rows[0]) }, { status: 201 }) };
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireSuperuser();
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (!body) return adminError('invalid_json', 400);

  return withReasonsLock(async (db) => {
    const existing = await readLostReasons(db, true);
    const order = parseReorder((body as { order?: unknown }).order, existing);
    if (!order) return { rollback: true, response: adminError('order_mismatch', 409) };
    await db.query(
      `UPDATE lost_reasons r
       SET sort_order = o.pos * $2, updated_at = CURRENT_TIMESTAMP
       FROM unnest($1::text[]) WITH ORDINALITY AS o(code, pos)
       WHERE r.code = o.code AND r.sort_order <> o.pos * $2`,
      [order, SORT_STEP]
    );
    return { response: NextResponse.json({ reasons: await readLostReasons(db) }) };
  });
}
