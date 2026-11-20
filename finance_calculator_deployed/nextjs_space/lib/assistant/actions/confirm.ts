// The user's click on an assistant confirmation card (docs/ai-assistant-plan.md section 7):
//   token -> this user's pending row (locked) -> not used, not expired, offer unchanged ->
//   shared offer service with the clicking user's access -> row confirmed, in ONE transaction.
// A refusal of the service (permission, status, guard) rolls the action back and marks the row
// 'failed' in the same commit, so a card can never be retried into a different outcome.

import pool from '../../db';
import { accessErrorInfo } from '../../access/errors';
import type { AccessContext } from '../../access/types';
import type { PoolClient } from 'pg';
import type { ServiceError, ServiceResult } from '../../offers/service';
import type { Lang } from '../format';
import { executeAction, type ExecutedAction } from './execute';
import { actionIdOf, isMissingTable, lockForConfirm, markDecided, type LoadRefusal } from './pending';

export type ConfirmOutcome =
  | { ok: true; result: ExecutedAction }
  | { ok: false; status: number; message: string; code: string };

const REFUSALS: Record<LoadRefusal | 'not_configured', { status: number; pl: string; en: string }> = {
  invalid_token: { status: 403, pl: 'Ta karta jest nieprawidłowa.', en: 'This card is not valid.' },
  not_found: { status: 404, pl: 'Nie znalazłam tej akcji.', en: 'This action was not found.' },
  used: { status: 409, pl: 'Ta akcja została już wykonana albo anulowana.', en: 'This action was already done or cancelled.' },
  expired: { status: 410, pl: 'Karta wygasła. Poproś asystenta o nią ponownie.', en: 'The card has expired. Ask the assistant again.' },
  stale: { status: 409, pl: 'Oferta zmieniła się od czasu przygotowania karty. Odśwież i poproś ponownie.', en: 'The offer changed since the card was prepared. Refresh and ask again.' },
  corrupt: { status: 409, pl: 'Tej akcji nie da się wykonać. Poproś asystenta ponownie.', en: 'This action cannot be run. Ask the assistant again.' },
  not_configured: { status: 503, pl: 'Akcje asystenta nie są jeszcze włączone (brak migracji 038).', en: 'Assistant actions are not enabled yet (migration 038 missing).' },
};

const refusal = (code: keyof typeof REFUSALS, lang: Lang): ConfirmOutcome => ({
  ok: false, status: REFUSALS[code].status, message: REFUSALS[code][lang], code,
});

/** The service's own refusal, worded as the app's offer routes word it (Polish). */
function serviceRefusal(error: ServiceError): ConfirmOutcome {
  if (error.kind === 'access') {
    const info = accessErrorInfo(error.code);
    return { ok: false, status: info.status, message: info.text, code: error.code };
  }
  return { ok: false, status: error.status, message: error.error, code: error.code ?? 'refused' };
}

type Attempt =
  | { kind: 'refused'; reason: LoadRefusal }
  | { kind: 'service'; result: ServiceResult<ExecutedAction> };

/**
 * Inside one transaction: lock the card, run it, record the outcome. A refusal of the service
 * rolls back to the savepoint (keeping only what the service asked to keep - the re-planned steps
 * of a re-routed approval) and marks the card failed in the SAME commit, so there is no moment in
 * which a second click could run it again.
 */
async function attempt(tx: PoolClient, ctx: AccessContext, id: number, lang: Lang): Promise<Attempt> {
  const loaded = await lockForConfirm(tx, id, ctx.userId);
  if ('refused' in loaded) return { kind: 'refused', reason: loaded.refused };
  await tx.query('SAVEPOINT assistant_action');
  const result = await executeAction(tx, ctx, loaded.action, lang);
  if (result.ok) {
    await markDecided(tx, id, ctx.userId, 'confirmed', result.value.offerId);
  } else {
    if (!result.commit) await tx.query('ROLLBACK TO SAVEPOINT assistant_action');
    await markDecided(tx, id, ctx.userId, 'failed');
  }
  return { kind: 'service', result };
}

export async function confirmAction(ctx: AccessContext, token: string, lang: Lang): Promise<ConfirmOutcome> {
  const id = actionIdOf(token, ctx.userId);
  if (id === null) return refusal('invalid_token', lang);

  let outcome: Attempt;
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    outcome = await attempt(tx, ctx, id, lang);
    await tx.query('COMMIT');
  } catch (error) {
    // Nothing happened (the card stays pending and may be clicked again).
    await tx.query('ROLLBACK').catch(() => undefined);
    if (isMissingTable(error)) return refusal('not_configured', lang);
    throw error;
  } finally {
    tx.release();
  }

  if (outcome.kind === 'refused') return refusal(outcome.reason, lang);
  if (outcome.result.ok) return { ok: true, result: outcome.result.value };
  return serviceRefusal(outcome.result.error);
}

export async function cancelAction(ctx: AccessContext, token: string, lang: Lang): Promise<ConfirmOutcome | { ok: true; cancelled: true }> {
  const id = actionIdOf(token, ctx.userId);
  if (id === null) return refusal('invalid_token', lang);
  try {
    const cancelled = await markDecided(pool, id, ctx.userId, 'cancelled');
    return cancelled ? { ok: true, cancelled: true } : refusal('used', lang);
  } catch (error) {
    if (isMissingTable(error)) return refusal('not_configured', lang);
    throw error;
  }
}
