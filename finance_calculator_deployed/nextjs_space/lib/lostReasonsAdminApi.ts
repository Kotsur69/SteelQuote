// Shared plumbing of the /api/admin/lost-reasons routes: one error shape the admin panel can
// translate ({ error, code, lang? }), and a transaction that serializes every write to the
// list so duplicate checks and reorders always see the committed state.

import { NextResponse, type NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { isMissingTable, LOST_REASONS_MIGRATION_HINT } from '@/lib/lostReasonsDb';

export type AdminReasonErrorCode =
  | 'invalid_json'
  | 'label_required'
  | 'label_too_long'
  | 'label_invalid'
  | 'nothing_to_change'
  | 'duplicate'
  | 'order_mismatch'
  | 'not_found'
  | 'system_reason'
  | 'not_migrated'
  | 'failed';

const MESSAGES: Record<AdminReasonErrorCode, string> = {
  invalid_json: 'Invalid JSON',
  label_required: 'Nazwa powodu jest wymagana we wszystkich językach',
  label_too_long: 'Nazwa powodu jest za długa',
  label_invalid: 'Nazwa powodu zawiera niedozwolone znaki',
  nothing_to_change: 'Brak zmian: podaj labels albo archived (true/false)',
  duplicate: 'Powód o tej nazwie już istnieje',
  order_mismatch: 'Lista powodów zmieniła się - odśwież stronę',
  not_found: 'Nie znaleziono powodu',
  system_reason: 'Powodu „Inne" nie można zarchiwizować',
  not_migrated: `Brak tabeli powodów — ${LOST_REASONS_MIGRATION_HINT}`,
  failed: 'Failed to save lost reasons',
};

/** Shape of every reason code ('price', 'r12'); anything else cannot exist. */
export const REASON_CODE_PATTERN = /^[a-z0-9_]{1,30}$/;

export function adminError(
  code: AdminReasonErrorCode,
  status: number,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ error: MESSAGES[code], code, ...extra }, { status });
}

export async function readJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type LockedWork = (db: PoolClient) => Promise<{ response: NextResponse; rollback?: boolean }>;

/** Runs `work` in a transaction holding the list-wide advisory lock; maps DB errors. */
export async function withReasonsLock(work: LockedWork): Promise<NextResponse> {
  let db: PoolClient | null = null;
  try {
    db = await pool.connect();
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['lost_reasons']);
    const { response, rollback } = await work(db);
    await db.query(rollback ? 'ROLLBACK' : 'COMMIT');
    return response;
  } catch (error) {
    if (db) await db.query('ROLLBACK').catch(() => undefined);
    if (isMissingTable(error)) return adminError('not_migrated', 503);
    if ((error as { code?: string })?.code === '23505') return adminError('duplicate', 409, { lang: 'pl' });
    console.error('Error saving lost reasons:', error);
    return adminError('failed', 500);
  } finally {
    if (db) db.release();
  }
}
