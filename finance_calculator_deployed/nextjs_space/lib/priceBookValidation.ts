// Validation of PUT /api/price-book bodies, shared by the route and the tests. Pure.
import type { SteelType } from './calculatorData';
import { PRICE_BOOK_STEEL_TYPES, defaultCell, type PriceBookEntry } from './priceBook';

export const PRICE_MIN = -1000;
export const PRICE_MAX = 5000;
export const GRADE_NAME_MAX_LENGTH = 100;
const MAX_ENTRIES_PER_SAVE = 5000;

// NUMERIC(10,2) in the DB: accepted values (at most 2 decimals, float noise allowed) are
// rounded to cents here, so what is compared, logged and stored is the same number
// (12.3500000001 -> 12.35).
const toCents = (value: number) => Math.round(value * 100) / 100;

// ---------------------------------------------------------------------------------------

export interface GradeAdd { name: string; surcharge: number; hasYieldSurcharge: boolean }
export interface GradeUpdate { id: number; surcharge?: number; hasYieldSurcharge?: boolean; retired?: boolean }

export interface PriceBookUpdate {
  steelType: SteelType;
  entries: PriceBookEntry[];
  gradeAdds: GradeAdd[];
  gradeUpdates: GradeUpdate[];
}

export type ValidationResult = { ok: true; value: PriceBookUpdate } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function priceError(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'not a finite number';
  if (value < PRICE_MIN || value > PRICE_MAX) return `out of range ${PRICE_MIN}..${PRICE_MAX}`;
  if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) return 'more than 2 decimals';
  return null;
}

export const normalizeGradeName = (name: string) => name.trim().toLowerCase();

function parseGradeAdds(raw: unknown[], existing: readonly { name: string }[]): GradeAdd[] | string {
  const taken = new Set(existing.map((g) => normalizeGradeName(g.name)));
  const adds: GradeAdd[] = [];
  for (const a of raw) {
    if (!isRecord(a) || typeof a.name !== 'string' || a.name.trim().length === 0) return 'Grade name is required';
    const name = a.name.trim();
    if (name.length > GRADE_NAME_MAX_LENGTH) return `Grade name longer than ${GRADE_NAME_MAX_LENGTH} characters`;
    if (taken.has(normalizeGradeName(name))) return `Grade already exists: ${name}`;
    taken.add(normalizeGradeName(name));
    const err = priceError(a.surcharge);
    if (err) return `${name}: ${err}`;
    if (a.hasYieldSurcharge !== undefined && typeof a.hasYieldSurcharge !== 'boolean') return `${name}: hasYieldSurcharge must be a boolean`;
    adds.push({ name, surcharge: toCents(a.surcharge as number), hasYieldSurcharge: a.hasYieldSurcharge === true });
  }
  return adds;
}

function parseGradeUpdates(raw: unknown[], existing: readonly { id: number }[]): GradeUpdate[] | string {
  const ids = new Set(existing.map((g) => g.id));
  const seen = new Set<number>();
  const updates: GradeUpdate[] = [];
  for (const u of raw) {
    if (!isRecord(u) || typeof u.id !== 'number' || !ids.has(u.id)) return 'Unknown grade';
    if (seen.has(u.id)) return 'Duplicate grade update';
    seen.add(u.id);
    const update: GradeUpdate = { id: u.id };
    if (u.surcharge !== undefined) {
      const err = priceError(u.surcharge);
      if (err) return `Grade surcharge: ${err}`;
      update.surcharge = toCents(u.surcharge as number);
    }
    for (const flag of ['hasYieldSurcharge', 'retired'] as const) {
      if (u[flag] === undefined) continue;
      if (typeof u[flag] !== 'boolean') return `${flag} must be a boolean`;
      update[flag] = u[flag] as boolean;
    }
    updates.push(update);
  }
  return updates;
}

/**
 * Validates one steel type's diff. `existingGrades` = that type's current grade rows (ids +
 * names): grade updates must target one of them and added names must be new (case-insensitive).
 */
export function validatePriceBookUpdate(body: unknown, existingGrades: readonly { id: number; name: string }[]): ValidationResult {
  if (!isRecord(body)) return { ok: false, error: 'Body must be an object' };
  const type = body.steelType as SteelType;
  if (typeof body.steelType !== 'string' || !PRICE_BOOK_STEEL_TYPES.includes(type)) {
    return { ok: false, error: 'Unknown steel type' };
  }

  const rawEntries = body.entries ?? [];
  const rawGrades = isRecord(body.grades) ? body.grades : {};
  const rawAdds = rawGrades.add ?? [];
  const rawUpdates = rawGrades.update ?? [];
  if (!Array.isArray(rawEntries) || !Array.isArray(rawAdds) || !Array.isArray(rawUpdates)) {
    return { ok: false, error: 'entries, grades.add and grades.update must be arrays' };
  }
  if (rawEntries.length > MAX_ENTRIES_PER_SAVE) return { ok: false, error: 'Too many entries' };

  const entries: PriceBookEntry[] = [];
  const seenCells = new Set<string>();
  for (const e of rawEntries) {
    if (!isRecord(e)) return { ok: false, error: 'Invalid entry' };
    const { tableKey, rowKey, colKey, value } = e;
    if (typeof tableKey !== 'string' || typeof rowKey !== 'string' || typeof colKey !== 'string') {
      return { ok: false, error: 'Entry keys must be strings' };
    }
    const cellId = `${tableKey}|${rowKey}|${colKey}`;
    if (defaultCell(type, tableKey, rowKey, colKey) === undefined) {
      return { ok: false, error: `Unknown price cell for ${type}: ${cellId}` };
    }
    if (seenCells.has(cellId)) return { ok: false, error: `Duplicate price cell: ${cellId}` };
    seenCells.add(cellId);
    const err = priceError(value);
    if (err) return { ok: false, error: `${cellId}: ${err}` };
    entries.push({ steelType: type, tableKey, rowKey, colKey, value: toCents(value as number) });
  }

  const gradeAdds = parseGradeAdds(rawAdds, existingGrades);
  if (typeof gradeAdds === 'string') return { ok: false, error: gradeAdds };
  const gradeUpdates = parseGradeUpdates(rawUpdates, existingGrades);
  if (typeof gradeUpdates === 'string') return { ok: false, error: gradeUpdates };

  if (entries.length + gradeAdds.length + gradeUpdates.length === 0) {
    return { ok: false, error: 'Nothing to save' };
  }
  return { ok: true, value: { steelType: type, entries, gradeAdds, gradeUpdates } };
}
