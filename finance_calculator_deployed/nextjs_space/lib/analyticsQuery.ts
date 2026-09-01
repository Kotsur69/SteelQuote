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
//    family, reporting a state the offer left long ago.
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
import type { Role } from './auth';
import { teamMemberIds } from './teams';

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
 * Junior: own offers only. Senior: own offers plus every team member's (migration 019), which a
 * ?users= filter may narrow but never widen past the team. Admin: the whole company, optionally
 * narrowed to individual salespeople.
 *
 * `teamIds` is the senior's team, already fetched by the caller; it is ignored for other roles.
 */
function visibilityClause(
  role: Role,
  userId: number,
  filterUserIds: number[],
  teamIds: number[],
  params: unknown[]
): string {
  if (role === 'junior') {
    params.push(userId);
    return `o.user_id = $${params.length}`;
  }

  if (role === 'senior') {
    // The filter can only pick from ids that are already in scope - anything else the client
    // sends is dropped here, so a hand-edited query string cannot escape the team.
    const allowed = new Set<number>([userId, ...teamIds]);
    const requested = filterUserIds.filter((id) => allowed.has(id));
    const ids = requested.length > 0 ? requested : [...allowed];
    params.push(ids);
    return `o.user_id = ANY($${params.length}::int[])`;
  }

  if (filterUserIds.length > 0) {
    params.push(filterUserIds);
    return `o.user_id = ANY($${params.length}::int[])`;
  }
  return 'TRUE';
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
  role: Role,
  userId: number,
  filters: AnalyticsFilters,
  window: RowQueryWindow,
  db: PoolClient | typeof pool = pool
): Promise<AnalyticsOfferRow[]> {
  const params: unknown[] = [];
  const teamIds = role === 'senior' ? await teamMemberIds(userId, db) : [];
  const visibility = visibilityClause(role, userId, filters.userIds, teamIds, params);
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
              o.client_decision, o.user_id, o.client_id, o.offer_data,
              o.created_at, o.sent_at, o.client_decision_at
       FROM offers o
       WHERE ${visibility}
       ORDER BY COALESCE(o.root_offer_id, o.id), o.version_number DESC, o.id DESC
     )
     SELECT l.id, l.root_offer_id, l.version_number, l.display_name, l.status,
            l.client_decision, l.user_id, l.client_id, l.offer_data,
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
 * Values the filter dropdowns offer. Clients are scoped the same way the rows are, so a
 * junior's client list contains only companies they have quoted and a senior's spans their
 * whole team. The salespeople list is empty for a junior (nobody to filter by), the senior
 * plus their team for a senior, and the whole company for an admin.
 */
export async function fetchFacets(
  role: Role,
  userId: number,
  db: PoolClient | typeof pool = pool
): Promise<{ users: { id: number; name: string }[]; clients: { id: number; name: string }[] }> {
  const teamIds = role === 'senior' ? await teamMemberIds(userId, db) : [];

  const clientParams: unknown[] = [];
  let ownership: string;
  if (role === 'admin') {
    ownership = 'TRUE';
  } else if (role === 'senior') {
    clientParams.push([userId, ...teamIds]);
    ownership = `o.user_id = ANY($${clientParams.length}::int[])`;
  } else {
    clientParams.push(userId);
    ownership = `o.user_id = $${clientParams.length}`;
  }

  const clientsResult = await db.query(
    `SELECT DISTINCT c.id, COALESCE(NULLIF(TRIM(c.company), ''), '#' || c.id::text) AS name
     FROM offers o
     JOIN clients c ON c.id = o.client_id
     WHERE ${ownership}
     ORDER BY name ASC`,
    clientParams
  );

  if (role === 'junior') {
    return { users: [], clients: clientsResult.rows };
  }

  if (role === 'senior') {
    // Exactly the ids the rows are scoped to: the senior and their team. With no team this is
    // one entry, so the picker is inert rather than misleading.
    const usersResult = await db.query(
      `SELECT u.id, COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) AS name
       FROM users u
       WHERE u.id = $1 OR u.id = ANY($2::int[])
       ORDER BY name ASC`,
      [userId, teamIds]
    );
    return { users: usersResult.rows, clients: clientsResult.rows };
  }

  // Admin: everyone who either still has an account or already owns offers - a deactivated
  // salesperson has to stay filterable, otherwise their history becomes unreachable.
  const usersResult = await db.query(
    `SELECT u.id, COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) AS name
     FROM users u
     WHERE u.is_active = true OR EXISTS (SELECT 1 FROM offers o WHERE o.user_id = u.id)
     ORDER BY name ASC`
  );

  return { users: usersResult.rows, clients: clientsResult.rows };
}
