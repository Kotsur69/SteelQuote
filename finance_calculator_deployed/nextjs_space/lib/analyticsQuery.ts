// The single SQL read behind /api/analytics: which offers the caller may see, narrowed to
// the requested window, one row per offer family. Aggregation happens afterwards in
// lib/analyticsAggregate.ts - this file only decides WHICH rows are in scope.
//
// Two things here are easy to get wrong and both would silently inflate every number:
//
// 1. VERSIONS. Editing a saved offer inserts a new version row (migration 015) instead of
//    overwriting, so a family of offer_30, offer_30.1, offer_30.2 is three rows describing
//    ONE quote. Summing all of them triple-counts the tonnage. The latest version per
//    family is picked FIRST, in a CTE, before any analytical filter runs - otherwise a
//    status filter could drop the newest version and let an older one stand in for the
//    family, reporting a state the offer left long ago. This is also what makes a
//    renegotiation count once: a lost offer edited and re-sent four times is one family,
//    so it is one won offer if the last round was won, or one lost offer if all were lost.
//
// 2. TIMEZONE. The bucket dates are produced by to_char in Postgres, so the database
//    timezone decides which day an offer belongs to. Node, which may well be running in
//    UTC, never re-derives a date from a timestamp.

import type { PoolClient } from 'pg';
import pool from './db';
import {
  OFFER_STATUSES,
  CLIENT_DECISIONS,
  type AnalyticsFilters,
  type ClientDecision,
  type DateBasis,
  type OfferStatus,
} from './analytics';
import type { AccessContext } from './access/types';
import { offerVisibilitySql } from './access/scope';

/** The column each date basis filters and buckets on. */
const BASIS_COLUMN: Record<DateBasis, string> = {
  created: 'created_at',
  sent: 'sent_at',
  decided: 'client_decision_at',
};

export interface AnalyticsOfferRow {
  id: number;
  root_offer_id: number | null;
  version_number: number;
  display_name: string;
  status: OfferStatus;
  client_decision: ClientDecision;
  /** Reason code of a lost offer (migration 024); null for any other decision. */
  client_decision_reason: string | null;
  user_id: number | null;
  owner_name: string | null;
  owner_email: string | null;
  client_id: number | null;
  client_company: string | null;
  /** YYYY-MM-DD in the database timezone; null when the underlying timestamp is null. */
  created_date: string | null;
  sent_date: string | null;
  decided_date: string | null;
  offer_data: {
    zestawienie?: unknown;
    displayCurrency?: unknown;
    eurPlnRate?: unknown;
  } | null;
}

export interface RowQueryWindow {
  /** Inclusive YYYY-MM-DD, or null for unbounded. */
  from: string | null;
  to: string | null;
}

/**
 * Offers the caller may see (the visibility matrix, lib/access/scope.ts), optionally narrowed
 * to individual salespeople. The ?users= filter is ANDed onto the visibility predicate, so a
 * hand-edited query string can only narrow the scope, never widen it.
 */
function visibilityClause(ctx: AccessContext, filterUserIds: number[], params: unknown[]): string {
  const visible = offerVisibilitySql(ctx, params, 'o');
  if (filterUserIds.length === 0) return visible;
  params.push(filterUserIds);
  return `(${visible} AND o.user_id = ANY($${params.length}::int[]))`;
}

/**
 * Offers in scope for the caller, one row per family, inside `window` on the chosen date
 * basis. `window` is normally widened to cover the comparison period as well, so both
 * windows come back in a single round trip and are split by date in the aggregator.
 *
 * A basis other than `created` implies the underlying timestamp exists: bucketing on the
 * decision date cannot include an offer nobody has decided on, so those rows drop out.
 */
export async function fetchAnalyticsRows(
  ctx: AccessContext,
  filters: AnalyticsFilters,
  window: RowQueryWindow,
  db: PoolClient | typeof pool = pool
): Promise<AnalyticsOfferRow[]> {
  const params: unknown[] = [];
  const visibility = visibilityClause(ctx, filters.userIds, params);
  const basis = BASIS_COLUMN[filters.basis];

  const conditions: string[] = [];

  if (filters.basis !== 'created') {
    conditions.push(`l.${basis} IS NOT NULL`);
  }
  if (window.from) {
    params.push(window.from);
    conditions.push(`l.${basis} >= $${params.length}::date`);
  }
  if (window.to) {
    params.push(window.to);
    // The whole of `to` counts, matching /api/admin/offers.
    conditions.push(`l.${basis} < ($${params.length}::date + interval '1 day')`);
  }

  // Empty enum filters mean "no filter" rather than "nothing" - the panel starts with every
  // status and decision selected and unticking them all should not blank the page.
  const statuses = filters.statuses.length > 0 ? filters.statuses : OFFER_STATUSES;
  if (statuses.length < OFFER_STATUSES.length) {
    params.push(statuses);
    conditions.push(`l.status = ANY($${params.length}::text[])`);
  }

  const decisions = filters.decisions.length > 0 ? filters.decisions : CLIENT_DECISIONS;
  if (decisions.length < CLIENT_DECISIONS.length) {
    params.push(decisions);
    conditions.push(`l.client_decision = ANY($${params.length}::text[])`);
  }

  if (filters.clientIds.length > 0) {
    params.push(filters.clientIds);
    conditions.push(`l.client_id = ANY($${params.length}::int[])`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // The steel-type filter is NOT applied here. An offer mixes types, and narrowing to HDG
  // has to keep the offer while dropping its non-HDG line items - a per-item decision the
  // aggregator makes.
  const result = await db.query(
    `WITH latest AS (
       SELECT DISTINCT ON (COALESCE(o.root_offer_id, o.id))
              o.id, o.root_offer_id, o.version_number, o.display_name, o.status,
              o.client_decision, o.client_decision_reason, o.user_id, o.client_id, o.offer_data,
              o.created_at, o.sent_at, o.client_decision_at
       FROM offers o
       WHERE ${visibility}
       ORDER BY COALESCE(o.root_offer_id, o.id), o.version_number DESC, o.id DESC
     )
     SELECT l.id, l.root_offer_id, l.version_number, l.display_name, l.status,
            l.client_decision, l.client_decision_reason, l.user_id, l.client_id, l.offer_data,
            to_char(l.created_at, 'YYYY-MM-DD')        AS created_date,
            to_char(l.sent_at, 'YYYY-MM-DD')           AS sent_date,
            to_char(l.client_decision_at, 'YYYY-MM-DD') AS decided_date,
            u.full_name AS owner_name, u.email AS owner_email,
            c.company   AS client_company
     FROM latest l
     LEFT JOIN users u ON u.id = l.user_id
     LEFT JOIN clients c ON c.id = l.client_id
     ${where}
     ORDER BY l.created_at DESC`,
    params
  );

  return result.rows as AnalyticsOfferRow[];
}

/**
 * Today according to the DATABASE, as YYYY-MM-DD. The period presets have to resolve against
 * the same clock the rows were stamped with, or "today" on a browser an hour across a
 * timezone boundary would ask for a day the database has not started yet.
 */
export async function fetchToday(db: PoolClient | typeof pool = pool): Promise<string> {
  const result = await db.query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today`);
  return result.rows[0].today as string;
}

/**
 * Values the filter dropdowns offer, scoped exactly like the rows: the clients and the
 * salespeople owning at least one offer the caller may see, plus the caller themselves. A
 * deactivated salesperson stays filterable as long as their offers are in scope.
 */
export async function fetchFacets(
  ctx: AccessContext,
  db: PoolClient | typeof pool = pool
): Promise<{
  users: { id: number; name: string; tier: string | null }[];
  clients: { id: number; name: string }[];
}> {
  const clientParams: unknown[] = [];
  const clientScope = offerVisibilitySql(ctx, clientParams, 'o');
  const clientsResult = await db.query(
    `SELECT DISTINCT c.id, COALESCE(NULLIF(TRIM(c.company), ''), '#' || c.id::text) AS name
     FROM offers o
     JOIN clients c ON c.id = o.client_id
     WHERE ${clientScope}
     ORDER BY name ASC`,
    clientParams
  );

  // tier: the highest chain level the user holds in any flow, else a parallel level (NPR).
  const userParams: unknown[] = [];
  const userScope = offerVisibilitySql(ctx, userParams, 'o');
  userParams.push(ctx.userId);
  const usersResult = await db.query(
    `SELECT u.id, COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) AS name,
            (SELECT l.code FROM user_flow_roles m
               JOIN flow_roles fr ON fr.flow_id = m.flow_id AND fr.role_id = m.role_id
               JOIN hierarchy_levels l ON l.id = fr.level_id
              WHERE m.user_id = u.id
              ORDER BY (l.kind = 'chain') DESC, l.chain_rank DESC NULLS LAST, l.sort_order
              LIMIT 1) AS tier
     FROM users u
     WHERE u.id = $${userParams.length}
        OR EXISTS (SELECT 1 FROM offers o WHERE o.user_id = u.id AND ${userScope})
     ORDER BY name ASC`,
    userParams
  );

  return { users: usersResult.rows, clients: clientsResult.rows };
}
