// Checks the seeded `steelquote_ai` database against what the app and the golden set assume:
//   1. every offer row passes the server-side item validation (validateOfferItems),
//   2. what each golden-set asker can see (the real offerVisibilitySql) matches ASKERS in
//      visibility.ts - the oracle computes expected answers from that fixture, so a mismatch
//      would make every golden number for that asker wrong.
//
// Run: DATABASE_URL=postgresql://postgres@localhost:5432/steelquote_ai npx tsx scripts/assistant-demo/verify.ts

import pool from '@/lib/db';
import { validateOfferItems } from '@/lib/offerItemValidation';
import { loadAccessContext } from '@/lib/access/context';
import { offerVisibilitySql } from '@/lib/access/scope';
import { fetchAnalyticsRows } from '@/lib/analyticsQuery';
import { computeKpi, normalizeOffers } from '@/lib/analyticsAggregate';
import type { AnalyticsFilters, DateBasis } from '@/lib/analytics';
import { ASKERS, expectedOwners } from './visibility';
import { PEOPLE } from './spec';
import { rows, select, totals } from './oracle';

async function checkItems(): Promise<string[]> {
  const rows = await pool.query(`SELECT id, offer_data FROM offers ORDER BY id`);
  const errors: string[] = [];
  for (const row of rows.rows) {
    const error = validateOfferItems(row.offer_data);
    if (error) errors.push(`offer ${row.id}: ${error}`);
  }
  return errors;
}

async function checkVisibility(): Promise<string[]> {
  const errors: string[] = [];
  const emailToKey = new Map(PEOPLE.map((p) => [p.email, p.key]));
  for (const asker of ASKERS) {
    const user = await pool.query(`SELECT id FROM users WHERE email = $1`, [asker.email]);
    if (user.rows.length === 0) {
      errors.push(`${asker.key}: user ${asker.email} missing`);
      continue;
    }
    const ctx = await loadAccessContext(user.rows[0].id, null);
    if (!ctx) {
      errors.push(`${asker.key}: no access context`);
      continue;
    }
    const params: unknown[] = [];
    const visible = offerVisibilitySql(ctx, params, 'o');
    const result = await pool.query(
      `SELECT DISTINCT u.email FROM offers o JOIN users u ON u.id = o.user_id WHERE ${visible}`,
      params
    );
    const actual = result.rows.map((r) => emailToKey.get(r.email) ?? r.email).sort();
    const expected = [...expectedOwners(asker)].sort();
    if (actual.join(',') !== expected.join(',')) {
      errors.push(`${asker.key}: sees owners [${actual.join(', ')}], fixture says [${expected.join(', ')}]`);
    }
  }
  return errors;
}

/**
 * 4. Ids the oracle predicts (latest version per family) are the ids in the DB, and no offer
 *    mixes items with and without a margin - computeKpi weights an offer's margin by its FULL
 *    tonnage, so a mixed offer would make the engine and the plan's definition disagree.
 */
async function checkIdsAndMargins(): Promise<string[]> {
  const errors: string[] = [];
  const latest = await pool.query(
    `SELECT DISTINCT ON (COALESCE(root_offer_id, id)) id, offer_data
     FROM offers ORDER BY COALESCE(root_offer_id, id), version_number DESC, id DESC`
  );
  const dbIds = latest.rows.map((r) => r.id as number).sort((a, b) => a - b);
  const oracleIds = rows().map((r) => r.id).sort((a, b) => a - b);
  if (dbIds.join(',') !== oracleIds.join(',')) {
    errors.push(`latest-version ids differ from the oracle (db ${dbIds.length}, oracle ${oracleIds.length}) - reseed with --reset`);
  }
  for (const row of latest.rows) {
    const items = (row.offer_data?.zestawienie ?? []) as { inputs?: { marginPct?: unknown } }[];
    const withMargin = items.filter((i) => typeof i.inputs?.marginPct === 'number').length;
    if (withMargin > 0 && withMargin < items.length) errors.push(`offer ${row.id}: mixes items with and without margin`);
  }
  return errors;
}

// Asker x basis x window grid; covers both timezone anchors (a01/a02) and the 3-version family.
const PARITY_CASES: [string, DateBasis, string, string][] = [
  ['admin', 'created', '2025-09-01', '2026-11-09'], ['admin', 'sent', '2026-10-01', '2026-10-31'],
  ['admin', 'decided', '2026-10-01', '2026-10-31'], ['admin', 'decided', '2026-11-01', '2026-11-09'],
  ['marekN', 'decided', '2025-11-01', '2025-11-30'], ['adam', 'sent', '2026-09-01', '2026-11-09'],
  ['kasia', 'created', '2026-01-01', '2026-11-09'], ['hanna', 'decided', '2026-07-01', '2026-09-30'],
];

/** 3. The oracle (golden numbers) and the real analytics engine agree on every KPI. */
async function checkEngineParity(): Promise<string[]> {
  const errors: string[] = [];
  for (const [who, basis, from, to] of PARITY_CASES) {
    const asker = ASKERS.find((a) => a.key === who)!;
    const user = await pool.query(`SELECT id FROM users WHERE email = $1`, [asker.email]);
    const ctx = await loadAccessContext(user.rows[0].id, null);
    if (!ctx) {
      errors.push(`${who}: no access context`);
      continue;
    }
    const filters: AnalyticsFilters = {
      dateFrom: from, dateTo: to, basis, granularity: 'month',
      userIds: [], steelTypes: [], statuses: [], decisions: [], clientIds: [],
    };
    const k = computeKpi(normalizeOffers(await fetchAnalyticsRows(ctx, filters, { from, to }), filters));
    const o = totals(select(asker, { basis, from, to }));
    const pairs: [string, unknown, unknown][] = [
      ['offers', k.offers, o.offers], ['tons', k.tonsOffered, o.tons], ['valueEur', k.valueOfferedEur, o.valueEur],
      ['valuePln', k.valueOfferedPln, o.valuePln], ['won', k.offersWon, o.won], ['lost', k.offersLost, o.lost],
      ['tonsWon', k.tonsWon, o.tonsWon], ['tonsLost', k.tonsLost, o.tonsLost], ['valueWonEur', k.valueWonEur, o.valueWonEur],
      ['valueWonPln', k.valueWonPln, o.valueWonPln], ['valueLostEur', k.valueLostEur, o.valueLostEur],
      ['clients', k.clients, o.clients], ['margin', k.avgMarginPct, o.marginWeighted],
      ['winRateOffers', k.winRateOffers, o.winRateOffers], ['winRateTons', k.winRateTons, o.winRateTons],
    ];
    for (const [name, engine, oracle] of pairs) {
      if (engine !== oracle) errors.push(`parity ${who} ${basis} ${from}..${to} ${name}: engine ${engine} vs oracle ${oracle}`);
    }
  }
  return errors;
}

async function main(): Promise<void> {
  const errors = [
    ...(await checkItems()),
    ...(await checkVisibility()),
    ...(await checkIdsAndMargins()),
    ...(await checkEngineParity()),
  ];
  if (errors.length > 0) {
    process.stderr.write(`${errors.length} problem(s):\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`OK: all offers valid, visibility matches the fixture, oracle == analytics engine on ${PARITY_CASES.length} windows\n`);
  }
  await pool.end();
}

main().catch((error: unknown) => {
  process.stderr.write(`Verify failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
