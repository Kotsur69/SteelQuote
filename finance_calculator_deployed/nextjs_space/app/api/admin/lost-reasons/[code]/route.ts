import { NextRequest, NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/access/context';
import { readLostReasons, toLostReasonDef } from '@/lib/lostReasonsDb';
import { findDuplicateLabel, parseReasonLabels } from '@/lib/lostReasonValidation';
import { REASON_CODE_PATTERN, adminError, readJson, withReasonsLock } from '@/lib/lostReasonsAdminApi';

interface RouteParams {
  params: Promise<{ code: string }>;
}

// PATCH - edit one reason: { labels?: { pl, en, cs, de }, archived?: boolean }. Superuser only.
// A rename relabels every past offer with that reason (they store the code). Archiving hides
// the reason from the picker but keeps it on old offers and in analytics; the catch-all
// 'other' cannot be archived.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireSuperuser();
  if ('error' in auth) return auth.error;
  const { code } = await params;
  if (!REASON_CODE_PATTERN.test(code)) return adminError('not_found', 404);
  const body = await readJson(request);
  if (!body) return adminError('invalid_json', 400);

  const wantsLabels = body.labels !== undefined;
  const parsed = wantsLabels ? parseReasonLabels(body.labels) : null;
  if (parsed && !parsed.ok) return adminError(parsed.error, 400, { lang: parsed.lang });
  const archived = typeof body.archived === 'boolean' ? body.archived : undefined;
  if (!wantsLabels && archived === undefined) return adminError('nothing_to_change', 400);

  return withReasonsLock(async (db) => {
    const existing = await readLostReasons(db, true);
    const reason = existing.find((r) => r.code === code);
    if (!reason) return { rollback: true, response: adminError('not_found', 404) };
    if (archived === true && reason.isSystem) {
      return { rollback: true, response: adminError('system_reason', 400) };
    }
    const labels = parsed?.ok ? parsed.labels : reason.labels;
    const duplicate = parsed?.ok ? findDuplicateLabel(labels, existing, code) : null;
    if (duplicate) return { rollback: true, response: adminError('duplicate', 409, { lang: duplicate }) };

    const archivedSql =
      archived === undefined ? 'archived_at' : archived ? 'COALESCE(archived_at, CURRENT_TIMESTAMP)' : 'NULL';
    const result = await db.query(
      `UPDATE lost_reasons
       SET label_pl = $2, label_en = $3, label_cs = $4, label_de = $5,
           archived_at = ${archivedSql}, updated_at = CURRENT_TIMESTAMP
       WHERE code = $1
       RETURNING code, label_pl, label_en, label_cs, label_de, sort_order, is_system, archived_at`,
      [code, labels.pl, labels.en, labels.cs, labels.de]
    );
    return { response: NextResponse.json({ reason: toLostReasonDef(result.rows[0]) }) };
  });
}
