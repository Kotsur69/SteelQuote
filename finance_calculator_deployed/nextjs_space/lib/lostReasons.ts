// Closed list of reasons a client rejected ('lost') an offer. Stored in
// offers.client_decision_reason (migrations/024_client_decision_reason.sql - keep the CHECK
// list there in sync with this array). 'other' is the catch-all: it is also what a loss gets
// when the salesperson picks nothing, and its custom text lives in client_decision_note.

export const LOST_REASONS = [
  'price',
  'lead_time',
  'competitor',
  'project_cancelled',
  'no_response',
  'payment_terms',
  'other',
] as const;

export type LostReason = (typeof LOST_REASONS)[number];

export const DEFAULT_LOST_REASON: LostReason = 'other';

export function isLostReason(value: unknown): value is LostReason {
  return typeof value === 'string' && (LOST_REASONS as readonly string[]).includes(value);
}

type Lang = 'pl' | 'en' | 'cs' | 'de';

const LABELS: Record<Lang, Record<LostReason, string>> = {
  pl: {
    price: 'Cena',
    lead_time: 'Termin dostawy',
    competitor: 'Wybrał konkurencję',
    project_cancelled: 'Projekt anulowany',
    no_response: 'Brak odpowiedzi klienta',
    payment_terms: 'Warunki płatności',
    other: 'Inne',
  },
  en: {
    price: 'Price',
    lead_time: 'Lead time',
    competitor: 'Chose a competitor',
    project_cancelled: 'Project cancelled',
    no_response: 'No response from client',
    payment_terms: 'Payment terms',
    other: 'Other',
  },
  cs: {
    price: 'Cena',
    lead_time: 'Dodací lhůta',
    competitor: 'Zvolil konkurenci',
    project_cancelled: 'Projekt zrušen',
    no_response: 'Bez odpovědi klienta',
    payment_terms: 'Platební podmínky',
    other: 'Jiné',
  },
  de: {
    price: 'Preis',
    lead_time: 'Lieferzeit',
    competitor: 'Wettbewerber gewählt',
    project_cancelled: 'Projekt abgebrochen',
    no_response: 'Keine Antwort des Kunden',
    payment_terms: 'Zahlungsbedingungen',
    other: 'Sonstiges',
  },
};

const UI: Record<Lang, { title: string; selectPlaceholder: string; customPlaceholder: string; confirm: string; cancel: string }> = {
  pl: {
    title: 'Powód odrzucenia przez klienta',
    selectPlaceholder: '- wybierz powód (opcjonalnie) -',
    customPlaceholder: 'Własny powód (opcjonalnie)',
    confirm: 'Zapisz odrzucenie',
    cancel: 'Anuluj',
  },
  en: {
    title: 'Why did the client reject it?',
    selectPlaceholder: '- select a reason (optional) -',
    customPlaceholder: 'Custom reason (optional)',
    confirm: 'Save rejection',
    cancel: 'Cancel',
  },
  cs: {
    title: 'Důvod zamítnutí klientem',
    selectPlaceholder: '- vyberte důvod (nepovinné) -',
    customPlaceholder: 'Vlastní důvod (nepovinné)',
    confirm: 'Uložit zamítnutí',
    cancel: 'Zrušit',
  },
  de: {
    title: 'Grund der Ablehnung durch den Kunden',
    selectPlaceholder: '- Grund wählen (optional) -',
    customPlaceholder: 'Eigener Grund (optional)',
    confirm: 'Ablehnung speichern',
    cancel: 'Abbrechen',
  },
};

function pickLang(language: string): Lang {
  return language in LABELS ? (language as Lang) : 'en';
}

export function lostReasonLabel(reason: LostReason, language: string): string {
  return LABELS[pickLang(language)][reason];
}

export function lostReasonUi(language: string) {
  return UI[pickLang(language)];
}
