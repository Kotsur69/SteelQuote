// Pure validation of the admin's edits to the lost-reason list (/admin/powody-przegranej).
// Shared by the admin API routes and the admin panel, so both refuse the same input.

import {
  MAX_LABEL_LENGTH,
  REASON_LANGS,
  sortLostReasons,
  type LostReasonDef,
  type ReasonLabels,
  type ReasonLang,
} from './lostReasons';

export type LabelsError = 'label_required' | 'label_too_long' | 'label_invalid';

// Control and invisible (zero-width / bidi) characters: they would let two names that look the
// same slip past the duplicate check.
const INVISIBLE = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/;

export type LabelsResult =
  | { ok: true; labels: ReasonLabels }
  | { ok: false; error: LabelsError; lang: ReasonLang };

/** All four languages are required; each is trimmed, visible text, at most MAX_LABEL_LENGTH long. */
export function parseReasonLabels(raw: unknown): LabelsResult {
  const source: Record<string, unknown> = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const labels: Partial<ReasonLabels> = {};
  for (const lang of REASON_LANGS) {
    const input = source[lang];
    const value = typeof input === 'string' ? input.trim() : '';
    if (value === '') return { ok: false, error: 'label_required', lang };
    if (value.length > MAX_LABEL_LENGTH) return { ok: false, error: 'label_too_long', lang };
    if (INVISIBLE.test(value)) return { ok: false, error: 'label_invalid', lang };
    labels[lang] = value;
  }
  return { ok: true, labels: labels as ReasonLabels };
}

const normalize = (s: string) => s.trim().toLowerCase();

/**
 * First language in which `labels` repeats another reason's name (case-insensitive, archived
 * reasons included - restoring the old one is the fix), or null. `selfCode` skips the reason
 * being edited.
 */
export function findDuplicateLabel(
  labels: ReasonLabels,
  existing: readonly LostReasonDef[],
  selfCode?: string
): ReasonLang | null {
  for (const lang of REASON_LANGS) {
    const wanted = normalize(labels[lang]);
    if (existing.some((r) => r.code !== selfCode && normalize(r.labels[lang]) === wanted)) return lang;
  }
  return null;
}

/**
 * A new order must list every existing code exactly once. System reasons (the catch-all) are
 * moved to the end whatever position they were sent in. Returns the codes in final order, or
 * null when the list does not match.
 */
export function parseReorder(raw: unknown, existing: readonly LostReasonDef[]): string[] | null {
  if (!Array.isArray(raw) || raw.length !== existing.length) return null;
  if (!raw.every((c): c is string => typeof c === 'string')) return null;
  const codes = new Set(existing.map((r) => r.code));
  if (new Set(raw).size !== raw.length || !raw.every((c) => codes.has(c))) return null;
  const system = new Set(existing.filter((r) => r.isSystem).map((r) => r.code));
  return [...raw.filter((c) => !system.has(c)), ...raw.filter((c) => system.has(c))];
}

/** Sort order values written for a reordered list: 10, 20, 30... */
export const SORT_STEP = 10;

/** Sort order for a reason added now: after every regular reason, before the catch-all. */
export function nextSortOrder(existing: readonly LostReasonDef[]): number {
  const regular = sortLostReasons(existing).filter((r) => !r.isSystem);
  return regular.length === 0 ? SORT_STEP : regular[regular.length - 1].sortOrder + SORT_STEP;
}
