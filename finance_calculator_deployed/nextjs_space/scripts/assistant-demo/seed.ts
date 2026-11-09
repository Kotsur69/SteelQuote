// Writes the AI-assistant demo data (spec.ts) into the LOCAL `steelquote_ai` database.
//
// Run via scripts/assistant-demo/setup.ps1, or directly:
//   DATABASE_URL=postgresql://postgres@localhost:5432/steelquote_ai npx tsx scripts/assistant-demo/seed.ts [--reset]
//
// Offers are priced with the real engine (computeItemPricing) and approval steps come from the
// real rule engine (assessOffer), so the rows look exactly like ones the app would write.
// Refuses to run against anything but localhost/steelquote_ai - .env holds production secrets.


import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { assessOffer, snapshotOf } from '@/lib/access/workflow';
import { CLIENTS, PEOPLE, PGL, buildDemoOffers, type OfferSpec, type VersionSpec } from './spec';
import { buildOfferData } from './offerData';

const DEMO_DB = 'steelquote_ai';
const PASSWORD = '1234';

function assertLocalDemoDb(): void {
  const raw = process.env.DATABASE_URL ?? '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL is missing or invalid');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  // pg-connection-string lets ?host= / ?port= in the query override the URL's host, so a
  // query string could point a "localhost" URL at another server - reject any query at all.
  if (!local || url.pathname !== `/${DEMO_DB}` || url.search !== '') {
    throw new Error(`Refusing to seed: DATABASE_URL must be exactly postgresql://...@localhost:5432/${DEMO_DB}`);
  }
}

/** Second layer: ask the server itself which database and address we are connected to. */
async function assertConnectedToLocalDemoDb(db: PoolClient): Promise<void> {
  const who = await db.query(`SELECT current_database() AS db, inet_server_addr()::text AS addr`);
  const { db: name, addr } = who.rows[0] as { db: string; addr: string | null };
  const localAddr = addr === null || addr.startsWith('127.0.0.1') || addr.startsWith('::1');
  if (name !== DEMO_DB || !localAddr) {
    throw new Error(`Refusing to seed: connected to ${name} at ${addr ?? 'unix socket'}, expected local ${DEMO_DB}`);
  }
}

function must<K, V>(map: Map<K, V>, key: K, what: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Unknown ${what}: ${String(key)}`);
  return value;
}

// --- writers -------------------------------------------------------------------------

/** Warsaw wall-clock 'YYYY-MM-DD HH:MM' parameter -> timestamptz, converted by Postgres. */
const TS = (n: number) => `($${n}::timestamp AT TIME ZONE 'Europe/Warsaw')`;

async function seedPeople(db: PoolClient): Promise<Map<string, number>> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const ids = new Map<string, number>();
  for (const p of PEOPLE) {
    const user = await db.query(
      `INSERT INTO users (email, password, full_name, is_superuser, is_active)
       VALUES ($1, $2, $3, false, true)
       ON CONFLICT (email) DO UPDATE SET full_name = $3, is_active = true
       RETURNING id`,
      [p.email, hash, p.fullName]
    );
    const id = user.rows[0].id as number;
    ids.set(p.key, id);
    await db.query(
      `INSERT INTO user_flow_roles (user_id, flow_id, role_id)
       SELECT $1, f.id, r.id FROM flows f JOIN roles r ON r.code = $3
       JOIN flow_roles fr ON fr.flow_id = f.id AND fr.role_id = r.id
       WHERE f.code = $2
       ON CONFLICT (user_id, flow_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [id, p.flow, p.role]
    );
    if (p.teamLead) {
      await db.query(
        `INSERT INTO team_members (senior_id, junior_id)
         SELECT l.id, $2 FROM users l WHERE l.email = $1
         ON CONFLICT DO NOTHING`,
        [p.teamLead, id]
      );
    }
  }
  return ids;
}

async function seedClients(db: PoolClient, createdBy: number): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const c of CLIENTS) {
    const existing = await db.query(`SELECT id FROM clients WHERE nip = $1`, [c.nip]);
    const row = existing.rows[0] ?? (await db.query(
      `INSERT INTO clients (company, nip, sap_id, address, first_name, last_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [c.company, c.nip, c.sapId, c.address, c.firstName, c.lastName, createdBy]
    )).rows[0];
    ids.set(c.key, row.id as number);
  }
  return ids;
}

async function seedPgl(db: PoolClient): Promise<void> {
  for (const [key, prices] of Object.entries(PGL)) {
    const [year, q] = key.split('-Q').map(Number);
    for (const [type, price] of Object.entries(prices)) {
      await db.query(
        `INSERT INTO pgl_quarterly_prices (year, quarter, steel_type, price)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (year, quarter, steel_type) DO UPDATE SET price = EXCLUDED.price`,
        [year, q, type, price]
      );
    }
  }
}

/** One user per hierarchy level per flow, to sign approval steps. */
async function loadApprovers(db: PoolClient): Promise<Map<string, number>> {
  const result = await db.query(
    `SELECT DISTINCT ON (m.flow_id, fr.level_id) m.flow_id, fr.level_id, m.user_id
     FROM user_flow_roles m
     JOIN flow_roles fr ON fr.flow_id = m.flow_id AND fr.role_id = m.role_id
     ORDER BY m.flow_id, fr.level_id, m.user_id`
  );
  return new Map(result.rows.map((r) => [`${r.flow_id}:${r.level_id}`, r.user_id as number]));
}

async function flowIdOf(db: PoolClient, code: string): Promise<number> {
  const result = await db.query(`SELECT id FROM flows WHERE code = $1`, [code]);
  if (result.rows.length === 0) throw new Error(`Flow ${code} missing - run migrations first`);
  return result.rows[0].id as number;
}

interface Ctx {
  people: Map<string, number>;
  clients: Map<string, number>;
  flows: Map<string, number>;
  approvers: Map<string, number>;
}

interface StepTarget {
  offerKey: string;
  offerId: number;
  flowId: number;
  ownerId: number;
  offerData: Record<string, unknown>;
  version: VersionSpec;
}

async function writeSteps(db: PoolClient, ctx: Ctx, t: StepTarget): Promise<void> {
  const { version } = t;
  if (version.status === 'draft') return;
  const assessment = await assessOffer({ flowId: t.flowId, ownerId: t.ownerId, offerData: t.offerData }, db);
  const { plan } = assessment;
  if (plan.blocked) throw new Error(`${t.offerKey}: approval plan blocked (level conflict)`);
  const needsSteps = version.status === 'pending_review' || version.status === 'rejected';
  if (needsSteps && plan.steps.length === 0) {
    throw new Error(`${t.offerKey}: spec says ${version.status} but no approval rule fires - adjust the spec`);
  }
  await db.query(`UPDATE offers SET validation_snapshot = $2 WHERE id = $1`, [t.offerId, JSON.stringify(snapshotOf(assessment))]);

  for (const [i, step] of plan.steps.entries()) {
    const approver = ctx.approvers.get(`${t.flowId}:${step.level.id}`) ?? null;
    let status = 'pending';
    let comment: string | null = null;
    if (version.status === 'approved' || version.status === 'sent') status = 'approved';
    if (version.status === 'rejected') {
      status = i === 0 ? 'rejected' : 'superseded';
      comment = i === 0 ? version.rejectionReason ?? null : null;
    }
    const decided = status === 'approved' || status === 'rejected';
    await db.query(
      `INSERT INTO offer_approval_steps (offer_id, track, level_id, required_level_id, status, decided_by, decided_at, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $9 THEN ${TS(7)} + interval '3 hours' END, $8, ${TS(7)} + interval '1 hour')`,
      [t.offerId, step.track, step.level.id, step.requiredLevel.id, status, decided ? approver : null, version.createdAt, comment, decided]
    );
  }
  if (version.status === 'rejected') {
    const reviewer = ctx.approvers.get(`${t.flowId}:${plan.steps[0].level.id}`) ?? null;
    await db.query(
      `UPDATE offers SET reviewed_by = $2, reviewed_at = ${TS(3)} + interval '3 hours', rejection_reason = $4 WHERE id = $1`,
      [t.offerId, reviewer, version.createdAt, version.rejectionReason ?? null]
    );
  }
}

async function seedOffer(db: PoolClient, ctx: Ctx, offer: OfferSpec, stamp: number): Promise<number> {
  const person = PEOPLE.find((p) => p.key === offer.owner);
  if (!person) throw new Error(`${offer.key}: unknown owner ${offer.owner}`);
  if (offer.versions.length === 0) throw new Error(`${offer.key}: no versions`);
  const ownerId = must(ctx.people, offer.owner, `${offer.key} owner`);
  const flowId = must(ctx.flows, person.flow, `${offer.key} flow`);
  const clientId = must(ctx.clients, offer.client, `${offer.key} client`);
  let rootId: number | null = null;

  for (const [i, version] of offer.versions.entries()) {
    const offerData = buildOfferData(offer, version, stamp + i * 10);
    const inserted = await db.query(
      `INSERT INTO offers (user_id, offer_data, client_id, flow_id, created_by, status,
                           root_offer_id, version_number, created_at, updated_at,
                           sent_at, sent_by, client_decision, client_decision_at,
                           client_decision_by, client_decision_reason)
       VALUES ($1, $2, $3, $4, $1, $5, $6, $7, ${TS(8)}, ${TS(8)},
               ${TS(9)}, CASE WHEN $9::text IS NULL THEN NULL ELSE $1::int END, $10, ${TS(11)},
               CASE WHEN $11::text IS NULL THEN NULL ELSE $1::int END, $12)
       RETURNING id`,
      [ownerId, JSON.stringify(offerData), clientId, flowId, version.status, rootId, i,
        version.createdAt, version.sentAt ?? null, version.decision, version.decidedAt ?? null,
        version.lostReason ?? null]
    );
    const offerId = inserted.rows[0].id as number;
    await writeSteps(db, ctx, { offerKey: offer.key, offerId, flowId, ownerId, offerData, version });
    rootId = rootId ?? offerId;
  }
  if (rootId === null) throw new Error(`${offer.key}: nothing inserted`);
  return rootId;
}

async function main(): Promise<void> {
  assertLocalDemoDb();
  const reset = process.argv.includes('--reset');
  const db = await pool.connect();
  try {
    await assertConnectedToLocalDemoDb(db);
    await db.query('BEGIN');
    const count = Number((await db.query(`SELECT count(*) FROM offers`)).rows[0].count);
    if (count > 0 && !reset) throw new Error(`${count} offers already exist - rerun with --reset`);
    if (reset) {
      await db.query(`DELETE FROM offer_approval_steps`);
      await db.query(`DELETE FROM offers`);
    }
    // Always restart (a failed earlier run burns sequence values even after ROLLBACK): ids must
    // start at 1 to match the ids the golden-set oracle predicts. verify.ts checks they do.
    await db.query(`ALTER SEQUENCE offers_id_seq RESTART WITH 1`);
    await db.query(`ALTER SEQUENCE offer_approval_steps_id_seq RESTART WITH 1`);

    const admin = await db.query(`SELECT id FROM users WHERE is_superuser ORDER BY id LIMIT 1`);
    if (admin.rows.length === 0) throw new Error('No superuser - run scripts/seed.ts first');
    const people = await seedPeople(db);
    const clients = await seedClients(db, admin.rows[0].id);
    await seedPgl(db);
    const flows = new Map([['FLOW1', await flowIdOf(db, 'FLOW1')], ['FLOW2', await flowIdOf(db, 'FLOW2')]]);
    const ctx: Ctx = { people, clients, flows, approvers: await loadApprovers(db) };

    const offers = buildDemoOffers();
    // Stable item ids (the calculator uses Date.now()-like ids): fixed base, no clock.
    let stamp = 1_790_000_000_000;
    const anchors: Record<string, number> = {};
    for (const offer of offers) {
      const rootId = await seedOffer(db, ctx, offer, stamp);
      if (offer.key.startsWith('a')) anchors[offer.key] = rootId;
      stamp += 1000;
    }
    await db.query('COMMIT');
    const rows = offers.reduce((n, o) => n + o.versions.length, 0);
    process.stdout.write(`Seeded ${PEOPLE.length} people, ${CLIENTS.length} clients, ${offers.length} offer families (${rows} rows)\n`);
    process.stdout.write(`Anchor root ids: ${JSON.stringify(anchors)}\n`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
