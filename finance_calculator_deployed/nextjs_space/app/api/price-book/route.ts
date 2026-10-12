import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { requireAccess, requireSuperuser } from '@/lib/access/context';
import { PRICE_BOOK_STEEL_TYPES, defaultCell, type GradeRow, type PriceBookEntry } from '@/lib/priceBook';
import { validatePriceBookUpdate, type PriceBookUpdate } from '@/lib/priceBookValidation';
import type { SteelType } from '@/lib/calculatorData';

// Editable surcharge price book (migration 031). GET serves the overrides + grades to every
// signed-in user (the calculator needs them); ?log=1 serves the change log to the superuser.
// PUT saves one steel type's diff - superuser only - with entries and log rows in one
// transaction. Missing tables (42P01) -> code defaults, like readTariffBands in
// app/api/settings/route.ts.

const LOG_LIMIT = 200;
const MIGRATION_HINT = 'Uruchom migrations/031_price_book.sql';

export interface PriceBookLogEntry {
  id: number;
  changedAt: string;
  changedByName: string | null;
  changedByEmail: string | null;
  steelType: SteelType;
  tableKey: string | null;
  rowKey: string | null;
  colKey: string | null;
  gradeName: string | null;
  oldValue: number | null;
  newValue: number | null;
  action: string;
}

type Queryable = Pick<PoolClient, 'query'>;

const isMissingTable = (error: unknown) => (error as { code?: string })?.code === '42P01';
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toGradeRow(row: Record<string, unknown>): GradeRow {
  return {
    id: Number(row.id),
    steelType: row.steel_type as SteelType,
    name: String(row.name),
    surcharge: Number(row.surcharge),
    hasYieldSurcharge: row.has_yield_surcharge === true,
    retired: row.retired_at !== null,
    sortOrder: Number(row.sort_order),
  };
}

async function readEntries(db: Queryable, type?: SteelType, lock = false): Promise<PriceBookEntry[]> {
  const result = await db.query(
    `SELECT steel_type, table_key, row_key, col_key, value FROM price_book_entries
     ${type ? 'WHERE steel_type = $1' : ''} ${lock ? 'FOR UPDATE' : ''}`,
    type ? [type] : []
  );
  return result.rows.map((r) => ({
    steelType: r.steel_type, tableKey: r.table_key, rowKey: r.row_key, colKey: r.col_key, value: Number(r.value),
  }));
}

async function readGrades(db: Queryable, type?: SteelType, lock = false): Promise<GradeRow[]> {
  const result = await db.query(
    `SELECT id, steel_type, name, surcharge, has_yield_surcharge, retired_at, sort_order FROM steel_grades
     ${type ? 'WHERE steel_type = $1' : ''} ORDER BY steel_type, sort_order, name ${lock ? 'FOR UPDATE' : ''}`,
    type ? [type] : []
  );
  return result.rows.map(toGradeRow);
}

async function readPayload() {
  try {
    const [entries, grades] = await Promise.all([readEntries(pool), readGrades(pool)]);
    return { entries, grades, migrated: true };
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    console.warn(`Tabele cennika dopłat nie istnieją — ${MIGRATION_HINT}. Używam wartości domyślnych.`);
    return { entries: [], grades: null, migrated: false };
  }
}

async function readLog(type: SteelType | null): Promise<PriceBookLogEntry[]> {
  try {
    const result = await pool.query(
      `SELECT l.id, l.changed_at, l.steel_type, l.table_key, l.row_key, l.col_key, l.grade_name,
              l.old_value, l.new_value, l.action, u.full_name AS changed_by_name, u.email AS changed_by_email
       FROM price_book_log l
       LEFT JOIN users u ON u.id = l.changed_by
       ${type ? 'WHERE l.steel_type = $2' : ''}
       ORDER BY l.changed_at DESC, l.id DESC
       LIMIT $1`,
      type ? [LOG_LIMIT, type] : [LOG_LIMIT]
    );
    return result.rows.map((r) => ({
      id: r.id,
      changedAt: r.changed_at,
      changedByName: r.changed_by_name,
      changedByEmail: r.changed_by_email,
      steelType: r.steel_type,
      tableKey: r.table_key,
      rowKey: r.row_key,
      colKey: r.col_key,
      gradeName: r.grade_name,
      oldValue: numOrNull(r.old_value),
      newValue: numOrNull(r.new_value),
      action: r.action,
    }));
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

function parseTypeParam(raw: string | null): SteelType | null {
  return raw && PRICE_BOOK_STEEL_TYPES.includes(raw as SteelType) ? (raw as SteelType) : null;
}

// GET - effective-book inputs ({ entries, grades, migrated }) or, with ?log=1, the change log.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wantsLog = searchParams.get('log') === '1';
  const auth = wantsLog ? await requireSuperuser() : await requireAccess();
  if ('error' in auth) return auth.error;

  try {
    if (wantsLog) {
      return NextResponse.json({ log: await readLog(parseTypeParam(searchParams.get('type'))) });
    }
    return NextResponse.json(await readPayload());
  } catch (error) {
    console.error('Error fetching price book:', error);
    return NextResponse.json({ error: 'Failed to fetch price book' }, { status: 500 });
  }
}

async function logRow(
  db: Queryable,
  userId: number,
  type: SteelType,
  fields: { tableKey?: string; rowKey?: string; colKey?: string; gradeName?: string; oldValue: number | null; newValue: number | null; action: string }
) {
  await db.query(
    `INSERT INTO price_book_log (changed_by, steel_type, table_key, row_key, col_key, grade_name, old_value, new_value, action)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [userId, type, fields.tableKey ?? null, fields.rowKey ?? null, fields.colKey ?? null,
      fields.gradeName ?? null, fields.oldValue, fields.newValue, fields.action]
  );
}

// Upserts / deletes overrides. A value equal to the code default removes the override, so
// the table keeps holding overrides only. No-op changes write nothing.
async function applyEntries(db: Queryable, userId: number, update: PriceBookUpdate): Promise<number> {
  const type = update.steelType;
  const current = new Map((await readEntries(db, type, true)).map((e) => [`${e.tableKey}|${e.rowKey}|${e.colKey}`, e.value]));
  let changed = 0;
  for (const e of update.entries) {
    const fallback = defaultCell(type, e.tableKey, e.rowKey, e.colKey) as number;
    const oldValue = current.get(`${e.tableKey}|${e.rowKey}|${e.colKey}`) ?? fallback;
    if (oldValue === e.value) continue;
    if (e.value === fallback) {
      await db.query(
        'DELETE FROM price_book_entries WHERE steel_type = $1 AND table_key = $2 AND row_key = $3 AND col_key = $4',
        [type, e.tableKey, e.rowKey, e.colKey]
      );
    } else {
      await db.query(
        `INSERT INTO price_book_entries (steel_type, table_key, row_key, col_key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (steel_type, table_key, row_key, col_key)
         DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
        [type, e.tableKey, e.rowKey, e.colKey, e.value, userId]
      );
    }
    await logRow(db, userId, type, {
      tableKey: e.tableKey, rowKey: e.rowKey, colKey: e.colKey, oldValue, newValue: e.value,
      action: e.value === fallback ? 'reset' : 'set',
    });
    changed += 1;
  }
  return changed;
}

async function applyGrades(db: Queryable, userId: number, update: PriceBookUpdate, existing: GradeRow[]): Promise<number> {
  const type = update.steelType;
  const byId = new Map(existing.map((g) => [g.id, g]));
  let nextOrder = existing.reduce((max, g) => Math.max(max, g.sortOrder), -1) + 1;
  let changed = 0;

  for (const add of update.gradeAdds) {
    await db.query(
      `INSERT INTO steel_grades (steel_type, name, surcharge, has_yield_surcharge, sort_order) VALUES ($1, $2, $3, $4, $5)`,
      [type, add.name, add.surcharge, add.hasYieldSurcharge, nextOrder++]
    );
    await logRow(db, userId, type, { gradeName: add.name, oldValue: null, newValue: add.surcharge, action: 'grade_add' });
    if (add.hasYieldSurcharge) {
      await logRow(db, userId, type, { gradeName: add.name, oldValue: 0, newValue: 1, action: 'grade_yield' });
    }
    changed += 1;
  }

  for (const u of update.gradeUpdates) {
    const grade = byId.get(u.id) as GradeRow;
    if (u.surcharge !== undefined && u.surcharge !== grade.surcharge) {
      await db.query('UPDATE steel_grades SET surcharge = $1 WHERE id = $2', [u.surcharge, u.id]);
      await logRow(db, userId, type, { gradeName: grade.name, oldValue: grade.surcharge, newValue: u.surcharge, action: 'grade_surcharge' });
      changed += 1;
    }
    if (u.hasYieldSurcharge !== undefined && u.hasYieldSurcharge !== grade.hasYieldSurcharge) {
      await db.query('UPDATE steel_grades SET has_yield_surcharge = $1 WHERE id = $2', [u.hasYieldSurcharge, u.id]);
      await logRow(db, userId, type, {
        gradeName: grade.name, oldValue: grade.hasYieldSurcharge ? 1 : 0, newValue: u.hasYieldSurcharge ? 1 : 0, action: 'grade_yield',
      });
      changed += 1;
    }
    if (u.retired !== undefined && u.retired !== grade.retired) {
      await db.query(
        `UPDATE steel_grades SET retired_at = ${u.retired ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = $1`,
        [u.id]
      );
      await logRow(db, userId, type, {
        gradeName: grade.name, oldValue: null, newValue: null, action: u.retired ? 'grade_retire' : 'grade_restore',
      });
      changed += 1;
    }
  }
  return changed;
}

// PUT - one steel type's diff: { steelType, entries: [{tableKey,rowKey,colKey,value}],
// grades: { add: [{name,surcharge,hasYieldSurcharge}], update: [{id,surcharge?,hasYieldSurcharge?,retired?}] } }.
export async function PUT(request: NextRequest) {
  const auth = await requireSuperuser();
  if ('error' in auth) return auth.error;
  const userId = auth.ctx.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const steelType = (body as { steelType?: unknown })?.steelType;
  if (typeof steelType !== 'string' || !PRICE_BOOK_STEEL_TYPES.includes(steelType as SteelType)) {
    return NextResponse.json({ error: 'Unknown steel type' }, { status: 400 });
  }

  let db: PoolClient | null = null;
  try {
    db = await pool.connect();
    await db.query('BEGIN');
    // Serializes saves of one steel type (row locks alone miss rows that do not exist yet:
    // first overrides, newly added grades), so validation always sees the committed state.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['price_book:' + steelType]);
    const existing = await readGrades(db, steelType as SteelType, true);
    const validation = validatePriceBookUpdate(body, existing);
    if (!validation.ok) {
      await db.query('ROLLBACK');
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const changed = await applyEntries(db, userId, validation.value)
      + await applyGrades(db, userId, validation.value, existing);
    await db.query('COMMIT');
    db.release();
    db = null;
    // The save is committed: a failing re-read must not turn it into a 500.
    const payload = await readPayload().catch((error) => {
      console.error('Price book re-read after save failed:', error);
      return null;
    });
    return NextResponse.json(payload ? { ...payload, changed } : { changed, reload: true });
  } catch (error) {
    if (db) await db.query('ROLLBACK').catch(() => undefined);
    if (isMissingTable(error)) {
      return NextResponse.json({ error: `Brak tabel cennika — ${MIGRATION_HINT}` }, { status: 503 });
    }
    if ((error as { code?: string })?.code === '23505') {
      return NextResponse.json({ error: 'Grade already exists' }, { status: 409 });
    }
    console.error('Error saving price book:', error);
    return NextResponse.json({ error: 'Failed to save price book' }, { status: 500 });
  } finally {
    if (db) db.release();
  }
}
