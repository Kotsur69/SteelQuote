// Short UI strings for the review-guideline notice and the in-calculator approve/reject bar.
// Kept next to offerReview.ts instead of in translations.ts: they are used by two small
// components only. Unknown languages fall back to English.
import type { ReviewIssue } from './offerReview';

type Lang = 'pl' | 'en' | 'cs' | 'de';

interface ReviewStrings {
  belowGuidelines: (count: number, total: number) => string;
  margin: (value: number, min: number) => string;
  marginUnknown: string;
  pgl: (value: number, base: number) => string;
  approve: string;
  reject: string;
  saveFirst: string;
  rejectTitle: string;
  rejectReasonPlaceholder: string;
  rejectReasonRequired: string;
  cancel: string;
  approved: string;
  rejected: string;
  actionFailed: string;
}

const STRINGS: Record<Lang, ReviewStrings> = {
  pl: {
    belowGuidelines: (c, n) => `Poniżej wytycznych: ${c} z ${n} pozycji`,
    margin: (v, m) => `marża ${v}% < min ${m}%`,
    marginUnknown: 'brak danych o marży',
    pgl: (v, b) => `PGL ${v} < baza ${b}`,
    approve: 'Zatwierdź',
    reject: 'Odrzuć',
    saveFirst: 'Zapisz zmiany przed walidacją - decyzja dotyczy zapisanej wersji oferty.',
    rejectTitle: 'Odrzuć ofertę',
    rejectReasonPlaceholder: 'Powód odrzucenia (wymagany)',
    rejectReasonRequired: 'Podaj powód odrzucenia',
    cancel: 'Anuluj',
    approved: 'Oferta zatwierdzona',
    rejected: 'Oferta odrzucona',
    actionFailed: 'Nie udało się wykonać akcji',
  },
  en: {
    belowGuidelines: (c, n) => `Below guidelines: ${c} of ${n} items`,
    margin: (v, m) => `margin ${v}% < min ${m}%`,
    marginUnknown: 'margin unknown',
    pgl: (v, b) => `PGL ${v} < base ${b}`,
    approve: 'Approve',
    reject: 'Reject',
    saveFirst: 'Save your changes before reviewing - the decision applies to the saved version.',
    rejectTitle: 'Reject offer',
    rejectReasonPlaceholder: 'Rejection reason (required)',
    rejectReasonRequired: 'Enter a rejection reason',
    cancel: 'Cancel',
    approved: 'Offer approved',
    rejected: 'Offer rejected',
    actionFailed: 'Action failed',
  },
  cs: {
    belowGuidelines: (c, n) => `Pod směrnicemi: ${c} z ${n} položek`,
    margin: (v, m) => `marže ${v}% < min ${m}%`,
    marginUnknown: 'marže neznámá',
    pgl: (v, b) => `PGL ${v} < základ ${b}`,
    approve: 'Schválit',
    reject: 'Zamítnout',
    saveFirst: 'Před schválením uložte změny - rozhodnutí se týká uložené verze nabídky.',
    rejectTitle: 'Zamítnout nabídku',
    rejectReasonPlaceholder: 'Důvod zamítnutí (povinný)',
    rejectReasonRequired: 'Zadejte důvod zamítnutí',
    cancel: 'Zrušit',
    approved: 'Nabídka schválena',
    rejected: 'Nabídka zamítnuta',
    actionFailed: 'Akci se nepodařilo provést',
  },
  de: {
    belowGuidelines: (c, n) => `Unter den Richtlinien: ${c} von ${n} Positionen`,
    margin: (v, m) => `Marge ${v}% < min ${m}%`,
    marginUnknown: 'Marge unbekannt',
    pgl: (v, b) => `PGL ${v} < Basis ${b}`,
    approve: 'Genehmigen',
    reject: 'Ablehnen',
    saveFirst: 'Änderungen vor der Prüfung speichern - die Entscheidung gilt für die gespeicherte Version.',
    rejectTitle: 'Angebot ablehnen',
    rejectReasonPlaceholder: 'Ablehnungsgrund (erforderlich)',
    rejectReasonRequired: 'Ablehnungsgrund eingeben',
    cancel: 'Abbrechen',
    approved: 'Angebot genehmigt',
    rejected: 'Angebot abgelehnt',
    actionFailed: 'Aktion fehlgeschlagen',
  },
};

export function reviewStrings(language: string): ReviewStrings {
  return language in STRINGS ? STRINGS[language as Lang] : STRINGS.en;
}

export function describeReviewIssue(issue: ReviewIssue, s: ReviewStrings): string {
  switch (issue.kind) {
    case 'marginBelowMin':
      return s.margin(issue.value, issue.min);
    case 'marginUnknown':
      return s.marginUnknown;
    case 'pglBelowBase':
      return s.pgl(issue.value, issue.base);
  }
}
