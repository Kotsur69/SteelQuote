// Runs the assistant's REAL tools against the seeded `steelquote_ai` database and compares them
// with the golden set (tests/assistant/golden.json) - the part the unit tests cannot cover: the
// SQL (visibility, latest version, queues, single-offer access) under each asking user.
//
//   - aggregate cases   -> query_metrics numbers == golden numbers
//   - lookup cases      -> search_offers / my_queue / get_offer return the golden offer ids
//   - permission cases  -> get_offer on an invisible offer answers not_found
//   - name resolution   -> find_people / find_clients (found, ambiguous, not_found)
//
// Read-only. Run:
//   DATABASE_URL=postgresql://postgres@localhost:5432/steelquote_ai JWT_SECRET=verify-only \
//     npx tsx scripts/assistant-demo/verify-tools.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pool from '@/lib/db';
import { loadAccessContext } from '@/lib/access/context';
import { toolByName } from '@/lib/assistant/tools';
import type { ToolRuntime } from '@/lib/assistant/tools/types';
import type { GoldenCase } from './golden-types';
import { CLIENTS, PEOPLE, SPEC_TODAY } from './spec';
import { ASKERS } from './visibility';

const golden = JSON.parse(readFileSync(join(__dirname, '..', '..', 'tests', 'assistant', 'golden.json'), 'utf8')) as { cases: GoldenCase[] };

const errors: string[] = [];
let checks = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

const userIds = new Map<string, number>();
const clientIds = new Map<string, number>();
const runtimes = new Map<string, ToolRuntime>();

async function setup(): Promise<void> {
  if (!(process.env.DATABASE_URL ?? '').includes('localhost') || !(process.env.DATABASE_URL ?? '').endsWith('/steelquote_ai')) {
    throw new Error('Refusing to run: DATABASE_URL must point at localhost/steelquote_ai');
  }
  for (const p of PEOPLE) {
    const r = await pool.query(`SELECT id FROM users WHERE email = $1`, [p.email]);
    userIds.set(p.key, Number(r.rows[0].id));
  }
  for (const c of CLIENTS) {
    const r = await pool.query(`SELECT id FROM clients WHERE company = $1`, [c.company]);
    if (r.rows[0]) clientIds.set(c.key, Number(r.rows[0].id));
  }
  for (const asker of ASKERS) {
    const r = await pool.query(`SELECT id FROM users WHERE email = $1`, [asker.email]);
    const ctx = await loadAccessContext(Number(r.rows[0].id), null);
    if (!ctx) throw new Error(`No access context for ${asker.key}`);
    runtimes.set(asker.key, { ctx, today: SPEC_TODAY, lang: 'pl', db: pool });
  }
}

async function run(tool: string, input: unknown, asker: string): Promise<Record<string, unknown>> {
  const t = toolByName(tool);
  if (!t) throw new Error(`Unknown tool ${tool}`);
  return (await t.run(t.schema.parse(input), runtimes.get(asker)!)).result;
}

function periodOf(label: string): Record<string, unknown> {
  if (label === 'thisYear') return { preset: 'ytd' };
  if (label === 'last30days') return { preset: 'last30' };
  if (/^\d{4}$/.test(label)) return { year: Number(label) };
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const q = /^(\d{4})-Q(\d)$/.exec(label);
  if (q) return { year: Number(q[1]), quarter: Number(q[2]) };
  return { preset: label };
}

const ids = (map: Map<string, number>, keys: unknown): number[] | undefined =>
  Array.isArray(keys) ? keys.map((k) => map.get(String(k))!) : undefined;
const compact = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

interface Cell { metric: string; value: number | null; value_pln?: number | null }
const METRIC_OF: Record<string, [string, boolean?]> = {
  won: ['offers_won'], lost: ['offers_lost'], tons: ['tons_offered'], tonsWon: ['tons_won'], tonsLost: ['tons_lost'],
  valueEur: ['value_offered'], valuePln: ['value_offered', true], valueWonEur: ['value_won'], valueWonPln: ['value_won', true],
  valueLostEur: ['value_lost'], valueLostPln: ['value_lost', true], clients: ['clients_offered'],
  winRateOffers: ['win_rate_offers'], winRateTons: ['win_rate_tons'], marginWeighted: ['margin_weighted'],
  marginSimple: ['margin_simple'], avgTons: ['avg_tons_per_offer'],
};

async function aggregates(): Promise<void> {
  for (const c of golden.cases.filter((x) => x.group === 'aggregate')) {
    const p = c.expect.params as { metrics: string[]; period: string; basis: string; filters: Record<string, unknown> };
    const result = await run('query_metrics', {
      metrics: p.metrics.flatMap((m) => (m === 'margin' ? ['margin_weighted', 'margin_simple'] : [m])),
      period: periodOf(p.period),
      basis: p.basis,
      filters: compact({ people: ids(userIds, p.filters.people), clients: ids(clientIds, p.filters.clients), steel_types: p.filters.steelTypes }),
    }, c.asker);
    const values = (result.values ?? []) as Cell[];
    const coverage = (result.coverage ?? []) as { offers: number; offers_with_margin?: number }[];
    const reasons = (result.lost_reasons ?? []) as { reason: string; offers: number; share_pct: number }[];
    for (const [key, expected] of Object.entries(c.expect.numbers ?? {})) {
      let actual: unknown;
      const reason = /^reason\.(.+)\.(offers|sharePct)$/.exec(key);
      if (reason) {
        const row = reasons.find((r) => r.reason === reason[1]);
        actual = reason[2] === 'offers' ? row?.offers : row?.share_pct;
      } else if (key === 'offersWithMargin') actual = coverage.find((x) => x.offers_with_margin !== undefined)?.offers_with_margin;
      else if (key === 'offers') actual = values.find((v) => v.metric === 'offers_created' || v.metric === 'offers_sent')?.value ?? coverage[0]?.offers;
      else {
        const [metric, pln] = METRIC_OF[key] ?? [];
        const cell = values.find((v) => v.metric === metric);
        actual = pln ? cell?.value_pln : cell?.value;
      }
      check(`${c.id} ${key}`, actual, expected);
    }
  }
}

async function lookups(): Promise<void> {
  for (const c of golden.cases.filter((x) => x.group === 'lookup')) {
    const p = (c.expect.params ?? {}) as Record<string, unknown>;
    const expected = [...(c.expect.offerIds ?? [])].sort((a, b) => a - b);
    if (c.expect.tool === 'get_offer') {
      const result = await run('get_offer', { offer_id: p.offer_id }, c.asker);
      check(`${c.id} get_offer`, (result.offer as { id: number } | undefined)?.id, expected[0]);
      continue;
    }
    const input = c.expect.tool === 'my_queue'
      ? { kind: p.kind }
      : compact({
          people: ids(userIds, p.people), clients: ids(clientIds, p.clients), status: p.status, decision: p.decision,
          period: typeof p.period === 'string' ? periodOf(p.period) : undefined, basis: p.basis,
        });
    const result = await run(c.expect.tool!, input, c.asker);
    const got = ((result.offers ?? []) as { id: number }[]).map((o) => o.id).sort((a, b) => a - b);
    if (c.expect.tool === 'my_queue') {
      // A queue question may name one client ("moja oferta dla X"): the tool returns the whole
      // queue and the model picks, so the golden ids must be IN the queue, not equal to it.
      check(`${c.id} my_queue contains`, expected.every((id) => got.includes(id)), true);
      continue;
    }
    // The golden list is capped at 20 like the tool; compare what both show.
    check(`${c.id} ${c.expect.tool}`, got, expected.length > 20 ? got : expected);
    check(`${c.id} total`, (result.total as number) >= expected.length, true);
  }
}

async function accessAndNames(): Promise<void> {
  for (const c of golden.cases.filter((x) => x.group === 'permission' && x.expect.tool === 'get_offer')) {
    const id = Number(/offer_(\d+)/.exec(c.question)?.[1]);
    check(`${c.id} invisible offer`, (await run('get_offer', { offer_id: id }, c.asker)).status, 'not_found');
  }
  check('get_offer missing id', (await run('get_offer', { offer_id: 999999 }, 'admin')).status, 'not_found');

  const status = async (tool: string, query: string, asker: string) => (await run(tool, { query }, asker)).status;
  check('Marek (admin) is ambiguous', await status('find_people', 'Marek', 'admin'), 'ambiguous');
  check('Marek Nowak (admin)', await status('find_people', 'Marek Nowak', 'admin'), 'found');
  check('Anna Kowalska declined', await status('find_people', 'Anny Kowalskiej', 'admin'), 'found');
  check('lukasz zak no diacritics', await status('find_people', 'lukasz zak', 'admin'), 'found');
  check('Tomasz is not a user', await status('find_people', 'Tomasz', 'admin'), 'not_found');
  check('Katarzyna Wąsik outside Marek scope', await status('find_people', 'Katarzyna Wąsik', 'marekN'), 'not_found');
  check('Marek Nowak outside Kasia scope', await status('find_people', 'Marek Nowak', 'kasia'), 'not_found');
  check('client Profilex', await status('find_clients', 'Profilexu', 'admin'), 'found');
  check('client Żurawiec declined', await status('find_clients', 'Żurawca', 'admin'), 'found');
  check('client Marek-Stal', await status('find_clients', 'Marek-Stal', 'admin'), 'found');

  for (const tool of ['get_my_context', 'list_lost_reasons', 'get_approval_rules']) {
    check(`${tool} runs`, (await run(tool, {}, 'marekN')).status, 'ok');
  }
  check('get_pgl runs', (await run('get_pgl', { year: 2026, quarter: 4 }, 'marekN')).status, 'ok');
  check('price_item runs', (await run('price_item', { type: 'HRS', grade: 'S235JR+N', thickness: 3, width: 1500, length: 3000, tons: 20, margin_pct: 8 }, 'marekN')).status, 'ok');
  check('price_item unknown grade', (await run('price_item', { type: 'HRS', grade: 'S999XYZ', thickness: 3, width: 1500, length: 3000, tons: 5 }, 'marekN')).status, 'unknown_grade');
  check('calculate_transport with km', (await run('calculate_transport', { destination: 'Poznań', weight_tons: 42, distance_km: 460 }, 'marekN')).status, 'ok');
}

async function main(): Promise<void> {
  await setup();
  await aggregates();
  await lookups();
  await accessAndNames();
  if (errors.length > 0) {
    process.stderr.write(`${errors.length} of ${checks} checks failed:\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`OK: ${checks} tool checks match the golden set\n`);
  }
  await pool.end();
}

main().catch((error: unknown) => {
  process.stderr.write(`verify-tools failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
