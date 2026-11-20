// Pending actions (migration 038): what a propose_* tool stored and the card's token points to.
//
// Lifecycle: pending -> confirmed | cancelled | failed. A row is bound to the user who saw the
// card, valid for ACTION_TTL_MINUTES and single-use. The token in the card only carries the row
// id (HMAC-signed, lib/assistant/tokens.ts); everything that matters is checked on the row.

import type { Db } from '../../access/config';
import { signToken, verifyToken } from '../tokens';
import { ACTION_TTL_MINUTES, parseAction, targetOfferId, type AnyAction } from './kinds';

/** Days an unconfirmed (pending, cancelled, failed) card is kept. */
const UNCONFIRMED_RETENTION_DAYS = 30;

export const isMissingTable = (error: unknown): boolean => (error as { code?: string })?.code === '42P01';

export class ActionsNotConfiguredError extends Error {
  constructor() {
    super('Migration 038 (ai_pending_actions) is not applied');
  }
}

export interface CreatedAction {
  id: number;
  token: string;
  expiresAt: string;
}

/**
 * Stores the action and returns the card token. cardVersion = offerVersionOf() read by the
 * caller BEFORE it loaded the data the card shows: a write after that read makes the stored
 * version differ from the current row, so the confirm refuses rather than act on what the user
 * did not see.
 */
export async function createPendingAction(db: Db, userId: number, action: AnyAction, cardVersion: string | null): Promise<CreatedAction> {
  const offerId = targetOfferId(action);
  try {
    // Housekeeping: this user's unconfirmed cards older than the retention are dropped (the
    // confirmed ones are the audit record and stay).
    await db.query(
      `DELETE FROM ai_pending_actions
       WHERE user_id = $1 AND status <> 'confirmed' AND created_at < CURRENT_TIMESTAMP - make_interval(days => $2)`,
      [userId, UNCONFIRMED_RETENTION_DAYS]
    );
    const result = await db.query(
      `INSERT INTO ai_pending_actions (user_id, kind, offer_id, offer_version, payload, expires_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + make_interval(mins => $6))
       RETURNING id, expires_at`,
      [userId, action.kind, offerId, cardVersion, JSON.stringify(action.payload), ACTION_TTL_MINUTES]
    );
    const row = result.rows[0];
    const id = Number(row.id);
    return { id, token: signToken('action', userId, { id }), expiresAt: new Date(row.expires_at).toISOString() };
  } catch (error) {
    if (isMissingTable(error)) throw new ActionsNotConfiguredError();
    throw error;
  }
}

/** updated_at of an offer as exact text (microseconds - a JS Date would round them away). */
export async function offerVersionOf(db: Db, offerId: number): Promise<string | null> {
  const result = await db.query(`SELECT updated_at::text AS v FROM offers WHERE id = $1`, [offerId]);
  return result.rows[0]?.v ?? null;
}

export type LoadRefusal = 'invalid_token' | 'not_found' | 'used' | 'expired' | 'stale' | 'corrupt';

export interface LoadedAction {
  id: number;
  action: AnyAction;
}

/** The token's action id, or null for a forged / foreign / malformed token. */
export function actionIdOf(token: string, userId: number): number | null {
  const check = verifyToken<{ id?: unknown }>('action', token, userId);
  if (!check.ok) return null;
  const id = check.data?.id;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Locks the user's pending action for execution inside the caller's transaction. Refuses a
 * used, expired or corrupt row, and one whose offer changed (or got a newer version) since the
 * card was built.
 */
export async function lockForConfirm(tx: Db, id: number, userId: number): Promise<LoadedAction | { refused: LoadRefusal }> {
  const result = await tx.query(
    `SELECT id, kind, offer_id, offer_version, payload, status, expires_at < CURRENT_TIMESTAMP AS expired
     FROM ai_pending_actions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [id, userId]
  );
  const row = result.rows[0];
  if (!row) return { refused: 'not_found' };
  if (row.status !== 'pending') return { refused: 'used' };
  if (row.expired === true) return { refused: 'expired' };
  const action = parseAction(row.kind, row.payload);
  if (!action) return { refused: 'corrupt' };

  const offerId = targetOfferId(action);
  if (offerId !== null) {
    // Lock the offer first (same order as the service: action row, then offer), so no write can
    // land between this check and the service. The check is a SEPARATE statement: under READ
    // COMMITTED it then sees a version that a save committed while we waited for the lock.
    await tx.query(`SELECT 1 FROM offers WHERE id = $1 FOR UPDATE`, [offerId]);
    // Same offer row as on the card, unchanged, and still the newest version of its family.
    const current = await tx.query(
      `SELECT o.updated_at::text AS v,
              NOT EXISTS (SELECT 1 FROM offers n
                          WHERE (n.id = COALESCE(o.root_offer_id, o.id) OR n.root_offer_id = COALESCE(o.root_offer_id, o.id))
                            AND n.version_number > o.version_number) AS is_latest
       FROM offers o WHERE o.id = $1`,
      [offerId]
    );
    const offer = current.rows[0];
    if (Number(row.offer_id) !== offerId || !offer || offer.v !== row.offer_version || offer.is_latest !== true) {
      return { refused: 'stale' };
    }
  }
  return { id: Number(row.id), action };
}

export async function markDecided(
  db: Db,
  id: number,
  userId: number,
  status: 'confirmed' | 'cancelled' | 'failed',
  resultOfferId: number | null = null
): Promise<boolean> {
  const result = await db.query(
    `UPDATE ai_pending_actions
     SET status = $3, decided_at = CURRENT_TIMESTAMP, result_offer_id = $4
     WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
    [id, userId, status, resultOfferId]
  );
  return (result.rowCount ?? 0) > 0;
}

export interface AssistantActionRecord {
  kind: string;
  at: string;
  by: string | null;
}

/**
 * Confirmed assistant actions on an offer (plan D25: the confirmed row is the audit record),
 * for the "przez asystenta" badge and get_offer. Empty before migration 038.
 */
export async function assistantActionsFor(db: Db, offerId: number): Promise<AssistantActionRecord[]> {
  try {
    const result = await db.query(
      `SELECT a.kind, a.decided_at, NULLIF(TRIM(u.full_name), '') AS by_name
       FROM ai_pending_actions a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.status = 'confirmed' AND a.result_offer_id = $1
       ORDER BY a.decided_at`,
      [offerId]
    );
    return result.rows.map((r) => ({ kind: String(r.kind), at: new Date(r.decided_at).toISOString(), by: r.by_name ?? null }));
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}
