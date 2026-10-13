// Server-only access to the lost_reasons table (migrations/032_lost_reasons.sql). Until that
// migration runs (42P01), readers get the 024 list from lib/lostReasons.ts, like the price
// book falls back to its code defaults.

import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { FALLBACK_LOST_REASONS, sortLostReasons, type LostReasonDef } from '@/lib/lostReasons';

type Queryable = Pick<PoolClient, 'query'>;

export const LOST_REASONS_MIGRATION_HINT = 'Uruchom migrations/032_lost_reasons.sql';

export const isMissingTable = (error: unknown) => (error as { code?: string })?.code === '42P01';

export function toLostReasonDef(row: Record<string, unknown>): LostReasonDef {
  return {
    code: String(row.code),
    labels: {
      pl: String(row.label_pl),
      en: String(row.label_en),
      cs: String(row.label_cs),
      de: String(row.label_de),
    },
    sortOrder: Number(row.sort_order),
    archived: row.archived_at !== null,
    isSystem: row.is_system === true,
  };
}

/** Every reason, archived included, in admin order. `lock` takes row locks for a write. */
export async function readLostReasons(db: Queryable, lock = false): Promise<LostReasonDef[]> {
  const result = await db.query(
    `SELECT code, label_pl, label_en, label_cs, label_de, sort_order, is_system, archived_at
     FROM lost_reasons ORDER BY sort_order, code ${lock ? 'FOR UPDATE' : ''}`
  );
  return result.rows.map(toLostReasonDef);
}

/** Reasons for readers that must keep working before migration 032: falls back to the 024 list. */
export async function loadLostReasons(
  db: Queryable = pool
): Promise<{ reasons: LostReasonDef[]; migrated: boolean }> {
  try {
    return { reasons: await readLostReasons(db), migrated: true };
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    console.warn(`Tabela lost_reasons nie istnieje — ${LOST_REASONS_MIGRATION_HINT}. Używam listy domyślnej.`);
    return { reasons: sortLostReasons(FALLBACK_LOST_REASONS), migrated: false };
  }
}

/** How many lost offers use each reason (all time). Codes nobody used are absent. */
export async function readLostReasonUsage(db: Queryable = pool): Promise<Record<string, number>> {
  const result = await db.query(
    `SELECT client_decision_reason AS code, COUNT(*)::int AS offers
     FROM offers
     WHERE client_decision = 'lost' AND client_decision_reason IS NOT NULL
     GROUP BY client_decision_reason`
  );
  return Object.fromEntries(result.rows.map((r) => [String(r.code), Number(r.offers)]));
}
