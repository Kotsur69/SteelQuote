// Pure helpers of the /admin/cennik panel: the per-type unsaved draft, its diff against the
// live book (the PUT body) and the fixed labels of rows/columns. No React here.
import type { SteelType } from '@/lib/calculatorData';
import {
  BASE_COLUMN_LABELS,
  BASE_LENGTH_COLUMNS,
  BASE_WIDTH_COLUMNS,
  COATING_CLASSES,
  DEFAULT_PRICE_BOOK,
  bookCell,
  defaultCell,
  type PriceBook,
  type PriceTableKey,
} from '@/lib/priceBook';
import { normalizeGradeName, priceError } from '@/lib/priceBookValidation';

export interface GradeEdit { surcharge?: string; hasYieldSurcharge?: boolean; retired?: boolean }
export interface GradeAddDraft { key: string; name: string; surcharge: string; hasYieldSurcharge: boolean }

export interface TypeDraft {
  /** cellId -> raw text typed in; only cells touched in this session. */
  cells: Readonly<Record<string, string>>;
  gradeEdits: Readonly<Record<number, GradeEdit>>;
  gradeAdds: readonly GradeAddDraft[];
}

export const EMPTY_DRAFT: TypeDraft = { cells: {}, gradeEdits: {}, gradeAdds: [] };

export const cellId = (table: PriceTableKey, row: string, col: string) => `${table}|${row}|${col}`;

export function splitCellId(id: string): { tableKey: PriceTableKey; rowKey: string; colKey: string } {
  const [tableKey, rowKey, colKey] = id.split('|');
  return { tableKey: tableKey as PriceTableKey, rowKey, colKey };
}

/** Accepts "12,5" as well as "12.5"; null when not a valid price. */
export function parsePrice(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return priceError(n) === null ? n : null;
}

export function formatPrice(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}

export type CellState = 'clean' | 'changed' | 'invalid';

export function cellState(raw: string | undefined, current: number): CellState {
  if (raw === undefined) return 'clean';
  const parsed = parsePrice(raw);
  if (parsed === null) return 'invalid';
  return parsed === current ? 'clean' : 'changed';
}

// Keeps the raw text even when it parses equal to the current value - deleting it would
// snap the input back mid-typing ("1.0" on the way to "1.05"). diffDraft skips equal values.
export function withCell(draft: TypeDraft, id: string, raw: string): TypeDraft {
  return { ...draft, cells: { ...draft.cells, [id]: raw } };
}

export function withGradeEdit(draft: TypeDraft, id: number, patch: GradeEdit): TypeDraft {
  return { ...draft, gradeEdits: { ...draft.gradeEdits, [id]: { ...draft.gradeEdits[id], ...patch } } };
}

export interface DraftDiff {
  body: {
    steelType: SteelType;
    entries: { tableKey: string; rowKey: string; colKey: string; value: number }[];
    grades: {
      add: { name: string; surcharge: number; hasYieldSurcharge: boolean }[];
      update: { id: number; surcharge?: number; hasYieldSurcharge?: boolean; retired?: boolean }[];
    };
  };
  changeCount: number;
  invalidCount: number;
}

/** The PUT body for one type: only values that differ from the live book. */
export function diffDraft(book: PriceBook, type: SteelType, draft: TypeDraft): DraftDiff {
  let invalidCount = 0;
  const entries: DraftDiff['body']['entries'] = [];
  for (const [id, raw] of Object.entries(draft.cells)) {
    const { tableKey, rowKey, colKey } = splitCellId(id);
    const current = bookCell(book, type, tableKey, rowKey, colKey);
    const parsed = parsePrice(raw);
    if (parsed === null) { invalidCount += 1; continue; }
    if (current !== undefined && parsed !== current) entries.push({ tableKey, rowKey, colKey, value: parsed });
  }

  const grades = book[type].grades;
  const update: DraftDiff['body']['grades']['update'] = [];
  for (const [idText, edit] of Object.entries(draft.gradeEdits)) {
    const id = Number(idText);
    const grade = grades.find((g) => g.id === id);
    if (!grade) continue;
    const u: DraftDiff['body']['grades']['update'][number] = { id };
    if (edit.surcharge !== undefined) {
      const parsed = parsePrice(edit.surcharge);
      if (parsed === null) invalidCount += 1;
      else if (parsed !== grade.surcharge) u.surcharge = parsed;
    }
    if (edit.hasYieldSurcharge !== undefined && edit.hasYieldSurcharge !== grade.hasYieldSurcharge) u.hasYieldSurcharge = edit.hasYieldSurcharge;
    if (edit.retired !== undefined && edit.retired !== grade.retired) u.retired = edit.retired;
    if (Object.keys(u).length > 1) update.push(u);
  }

  const add: DraftDiff['body']['grades']['add'] = [];
  for (const a of draft.gradeAdds) {
    const parsed = parsePrice(a.surcharge);
    if (parsed === null || a.name.trim() === '') { invalidCount += 1; continue; }
    add.push({ name: a.name.trim(), surcharge: parsed, hasYieldSurcharge: a.hasYieldSurcharge });
  }

  const changeCount = entries.length + add.length
    + update.reduce((n, u) => n + Object.keys(u).length - 1, 0);
  return { body: { steelType: type, entries, grades: { add, update } }, changeCount, invalidCount };
}

/** Name problem of a grade about to be added, or null. Compared case-insensitively. */
export function gradeNameProblem(book: PriceBook, type: SteelType, draft: TypeDraft, name: string): 'required' | 'duplicate' | null {
  const key = normalizeGradeName(name);
  if (key === '') return 'required';
  const taken = book[type].grades.some((g) => normalizeGradeName(g.name) === key)
    || draft.gradeAdds.some((a) => normalizeGradeName(a.name) === key);
  return taken ? 'duplicate' : null;
}

// ---------------------------------------------------------------------------------------
// Layout of the grids (fixed by the code structure, never by the DB)
// ---------------------------------------------------------------------------------------

const bandStart = (key: string) => Number(key.split('-')[0]);

export interface GridLayout { rows: string[]; cols: string[] }

export function gridLayout(type: SteelType, table: PriceTableKey): GridLayout {
  const cells = DEFAULT_PRICE_BOOK[type].tables[table] ?? {};
  const rows = Object.keys(cells);
  let cols: string[];
  if (table === 'coating') cols = [...(COATING_CLASSES[type] ?? [])];
  else if (table === 'baseLength') cols = [...BASE_LENGTH_COLUMNS];
  else if (table === 'baseWidth') cols = [...BASE_WIDTH_COLUMNS];
  else if (table === 'pickling' || table === 'teardrop') cols = ['value'];
  else cols = Array.from(new Set(rows.flatMap((r) => Object.keys(cells[r])))).sort((a, b) => bandStart(a) - bandStart(b));
  return { rows, cols };
}

/** "1.50-1.59" -> "1.50–1.59", open-ended bands ("20.00-99.00", "2050-9999") -> "≥ 20.00". */
export function bandLabel(key: string): string {
  if (BASE_COLUMN_LABELS[key]) return BASE_COLUMN_LABELS[key];
  const [min, max] = key.split('-');
  if (max === undefined) return key;
  if (Number(min) === 0) return `≤ ${max}`;
  if (Number(max) === 99 || Number(max) >= 9999) return `≥ ${min}`;
  return `${min}–${max}`;
}

export const existsInStructure = (type: SteelType, table: PriceTableKey, row: string, col: string) =>
  defaultCell(type, table, row, col) !== undefined;
