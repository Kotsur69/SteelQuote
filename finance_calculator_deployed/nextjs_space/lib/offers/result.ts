// Outcome of an offer service call (lib/offers/service.ts). The service decides; the caller
// turns the outcome into an HTTP response (API routes, lib/offers/http.ts) or into the
// assistant's confirmation result (app/api/assistant/actions). Both paths therefore run the
// same rules and report the same errors.

import type { PoolClient } from 'pg';
import pool from '../db';
import type { AccessErrorCode } from '../access/errors';

export type ServiceError =
  /** One of the shared access / workflow errors (lib/access/errors.ts). */
  | { kind: 'access'; code: AccessErrorCode; extra?: Record<string, unknown> }
  /** Any other refusal: the status and Polish message the route always returned. */
  | { kind: 'http'; status: number; error: string; code?: string };

export type ServiceResult<T> =
  | { ok: true; value: T }
  /** commit: the refusal still wrote something that must stay (approve -> re-routed steps). */
  | { ok: false; error: ServiceError; commit?: boolean };

export const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });

export const accessFail = <T>(code: AccessErrorCode, extra?: Record<string, unknown>): ServiceResult<T> => ({
  ok: false,
  error: { kind: 'access', code, ...(extra ? { extra } : {}) },
});

export const httpFail = <T>(status: number, error: string, code?: string): ServiceResult<T> => ({
  ok: false,
  error: { kind: 'http', status, error, ...(code ? { code } : {}) },
});

export const notFound = <T>(): ServiceResult<T> => httpFail(404, 'Offer not found');

/**
 * Runs `work` in one transaction: COMMIT when it succeeded (or a refusal asks to keep its
 * writes), ROLLBACK otherwise and on any thrown error.
 */
export async function inTransaction<T>(work: (tx: PoolClient) => Promise<ServiceResult<T>>): Promise<ServiceResult<T>> {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    const result = await work(tx);
    await tx.query(result.ok || result.commit ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    tx.release();
  }
}
