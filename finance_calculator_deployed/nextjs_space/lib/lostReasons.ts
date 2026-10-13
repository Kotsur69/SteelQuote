// Reasons a client rejected ('lost') an offer. Since v2.0 the list lives in the lost_reasons
// table (migrations/032_lost_reasons.sql) and the superuser edits it at /admin/powody-przegranej.
// offers.client_decision_reason stores the reason's code (foreign key). This module is the
// client-safe part: types, the pre-032 fallback list, label lookup and the pure validation
// the decision route and the dialog share. Database access is in lib/lostReasonsDb.ts.
//
// 'other' is the built-in catch-all: always active, and picking it makes the note mandatory.

export const REASON_LANGS = ['pl', 'en', 'cs', 'de'] as const;
export type ReasonLang = (typeof REASON_LANGS)[number];
export type ReasonLabels = Record<ReasonLang, string>;

export interface LostReasonDef {
  code: string;
  labels: ReasonLabels;
  sortOrder: number;
  archived: boolean;
  /** The built-in catch-all ('other'): cannot be archived, needs a note. */
  isSystem: boolean;
}

export const OTHER_REASON = 'other';
/** Longest label per language (the table CHECK says the same). */
export const MAX_LABEL_LENGTH = 80;
/** Longest note we store - a real sentence, not free storage. */
export const MAX_NOTE_LENGTH = 500;

// Served while migration 032 has not run: the closed list of migration 024, which the CHECK
// constraint of that era still enforces.
export const FALLBACK_LOST_REASONS: readonly LostReasonDef[] = [
  { code: 'price', sortOrder: 10, labels: { pl: 'Cena', en: 'Price', cs: 'Cena', de: 'Preis' } },
  { code: 'lead_time', sortOrder: 20, labels: { pl: 'Termin dostawy', en: 'Lead time', cs: 'Dodací lhůta', de: 'Lieferzeit' } },
  { code: 'competitor', sortOrder: 30, labels: { pl: 'Wybrał konkurencję', en: 'Chose a competitor', cs: 'Zvolil konkurenci', de: 'Wettbewerber gewählt' } },
  { code: 'project_cancelled', sortOrder: 50, labels: { pl: 'Projekt anulowany', en: 'Project cancelled', cs: 'Projekt zrušen', de: 'Projekt abgebrochen' } },
  { code: 'no_response', sortOrder: 60, labels: { pl: 'Brak odpowiedzi klienta', en: 'No response from client', cs: 'Bez odpovědi klienta', de: 'Keine Antwort des Kunden' } },
  { code: 'payment_terms', sortOrder: 70, labels: { pl: 'Warunki płatności', en: 'Payment terms', cs: 'Platební podmínky', de: 'Zahlungsbedingungen' } },
  { code: OTHER_REASON, sortOrder: 1000, labels: { pl: 'Inne', en: 'Other', cs: 'Jiné', de: 'Sonstiges' } },
].map((r) => ({ ...r, archived: false, isSystem: r.code === OTHER_REASON }));

export function pickReasonLang(language: string): ReasonLang {
  return (REASON_LANGS as readonly string[]).includes(language) ? (language as ReasonLang) : 'en';
}

/** Admin order with the catch-all always last, whatever its sort_order. Returns a new array. */
export function sortLostReasons(reasons: readonly LostReasonDef[]): LostReasonDef[] {
  return [...reasons].sort(
    (a, b) => Number(a.isSystem) - Number(b.isSystem) || a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)
  );
}

/** Trims a free-text note and caps it at MAX_NOTE_LENGTH; empty -> null. */
export function cleanNote(note: unknown): string | null {
  if (typeof note !== 'string') return null;
  const text = note.trim().slice(0, MAX_NOTE_LENGTH).trimEnd();
  return text === '' ? null : text;
}

/** What the salesperson may pick: active reasons in admin order. */
export function activeLostReasons(reasons: readonly LostReasonDef[]): LostReasonDef[] {
  return sortLostReasons(reasons.filter((r) => !r.archived));
}

/** Label of a stored code; an unknown code (list not loaded yet) shows the code itself. */
export function lostReasonLabel(
  code: string,
  reasons: readonly LostReasonDef[],
  language: string
): string {
  const found = reasons.find((r) => r.code === code);
  return found ? found.labels[pickReasonLang(language)] : code;
}

export type LostChoiceError = 'reason_required' | 'reason_unknown' | 'note_required';

export type LostChoiceResult =
  | { ok: true; reason: string; note: string | null }
  | { ok: false; error: LostChoiceError };

/**
 * Validates what the salesperson picked for a loss. A reason is required and must be active;
 * 'other' also needs a note. The note is trimmed and capped at MAX_NOTE_LENGTH; empty -> null.
 */
export function validateLostChoice(
  reason: unknown,
  note: unknown,
  activeCodes: ReadonlySet<string>
): LostChoiceResult {
  if (typeof reason !== 'string' || reason.trim() === '') return { ok: false, error: 'reason_required' };
  const code = reason.trim();
  if (!activeCodes.has(code)) return { ok: false, error: 'reason_unknown' };
  const text = cleanNote(note);
  if (code === OTHER_REASON && text === null) return { ok: false, error: 'note_required' };
  return { ok: true, reason: code, note: text };
}

const UI: Record<ReasonLang, {
  title: string;
  selectPlaceholder: string;
  notePlaceholder: string;
  noteRequiredPlaceholder: string;
  confirm: string;
  cancel: string;
  archivedMark: string;
  errors: Record<LostChoiceError, string>;
}> = {
  pl: {
    title: 'Powód odrzucenia przez klienta',
    selectPlaceholder: '- wybierz powód -',
    notePlaceholder: 'Komentarz (opcjonalnie)',
    noteRequiredPlaceholder: 'Opisz powód (wymagane)',
    confirm: 'Zapisz odrzucenie',
    cancel: 'Anuluj',
    archivedMark: 'archiwalny',
    errors: {
      reason_required: 'Wybierz powód odrzucenia',
      reason_unknown: 'Ten powód nie jest już dostępny - odśwież stronę',
      note_required: 'Dla powodu „Inne" opis jest wymagany',
    },
  },
  en: {
    title: 'Why did the client reject it?',
    selectPlaceholder: '- select a reason -',
    notePlaceholder: 'Comment (optional)',
    noteRequiredPlaceholder: 'Describe the reason (required)',
    confirm: 'Save rejection',
    cancel: 'Cancel',
    archivedMark: 'archived',
    errors: {
      reason_required: 'Select a reason',
      reason_unknown: 'This reason is no longer available - refresh the page',
      note_required: 'A description is required for "Other"',
    },
  },
  cs: {
    title: 'Důvod zamítnutí klientem',
    selectPlaceholder: '- vyberte důvod -',
    notePlaceholder: 'Komentář (nepovinné)',
    noteRequiredPlaceholder: 'Popište důvod (povinné)',
    confirm: 'Uložit zamítnutí',
    cancel: 'Zrušit',
    archivedMark: 'archivováno',
    errors: {
      reason_required: 'Vyberte důvod zamítnutí',
      reason_unknown: 'Tento důvod již není k dispozici - obnovte stránku',
      note_required: 'U důvodu „Jiné" je popis povinný',
    },
  },
  de: {
    title: 'Grund der Ablehnung durch den Kunden',
    selectPlaceholder: '- Grund wählen -',
    notePlaceholder: 'Kommentar (optional)',
    noteRequiredPlaceholder: 'Grund beschreiben (Pflicht)',
    confirm: 'Ablehnung speichern',
    cancel: 'Abbrechen',
    archivedMark: 'archiviert',
    errors: {
      reason_required: 'Bitte einen Grund wählen',
      reason_unknown: 'Dieser Grund ist nicht mehr verfügbar - Seite neu laden',
      note_required: 'Bei „Sonstiges" ist eine Beschreibung Pflicht',
    },
  },
};

export function lostReasonUi(language: string) {
  return UI[pickReasonLang(language)];
}
