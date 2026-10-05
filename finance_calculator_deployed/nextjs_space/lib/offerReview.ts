// Czy oferta wymaga zatwierdzenia przez seniora/admina zamiast bezpośredniej wysyłki
// przez juniora. Współdzielone przez UI (app/offers/page.tsx, Calculator.tsx) i backend
// (app/api/offers/[id]/send, app/api/offers/[id] PUT), żeby klient i serwer liczyły to
// samo na tych samych danych — serwer jest granicą zaufania i NIE ufa fladze z klienta.
//
// Reguła: KAŻDA pojedyncza pozycja w zestawieniu musi mieć marżę >= progu (Ustawienia:
// minMarginPct) ORAZ PGL bazowe >= aktualnej wartości bazowej dla jej typu stali
// (Ustawienia: pglBaseHrs/Cr/Hdg). Jedna słaba pozycja wystarczy, żeby CAŁA oferta
// wymagała zatwierdzenia — trafia do tego samego dokumentu u klienta.
//
// Porównanie PGL jest ŻYWE względem aktualnych Ustawień (nie zamrożone w chwili
// dodania pozycji) — jeśli admin później zmieni cenę bazową, wymóg zatwierdzenia
// dla jeszcze niewysłanej oferty przelicza się na nowo.
import { pglBaseForType, type AppSettings } from './currency';
import type { SteelType } from './calculatorData';

export interface ReviewableItem {
  type: SteelType;
  pgl: number;
  inputs?: { marginPct?: number };
}

// Pozycje sprzed wprowadzenia ItemInputs.marginPct nie mają zapisanej marży — w razie
// braku danych zakładamy najbezpieczniejszy wariant (wymaga zatwierdzenia), zamiast
// milcząco przepuszczać ofertę, której realnej marży nie da się zweryfikować.
// Why a single position falls below the guidelines. Exposed (not just a boolean) so the
// reviewer sees the concrete number and the threshold it missed, e.g. "margin 4% < min 6%".
export type ReviewIssue =
  | { kind: 'marginBelowMin'; value: number; min: number }
  | { kind: 'marginUnknown' }
  | { kind: 'pglBelowBase'; value: number; base: number };

// Single source of truth for the review rule; positionNeedsReview is derived from it so the
// UI explanation can never disagree with the gate the server enforces.
export function positionReviewIssues(item: ReviewableItem, settings: AppSettings): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const marginPct = item.inputs?.marginPct;
  if (typeof marginPct !== 'number') {
    issues.push({ kind: 'marginUnknown' });
  } else if (marginPct < settings.minMarginPct) {
    issues.push({ kind: 'marginBelowMin', value: marginPct, min: settings.minMarginPct });
  }
  const base = pglBaseForType(item.type, settings);
  if (item.pgl < base) {
    issues.push({ kind: 'pglBelowBase', value: item.pgl, base });
  }
  return issues;
}

export function positionNeedsReview(item: ReviewableItem, settings: AppSettings): boolean {
  return positionReviewIssues(item, settings).length > 0;
}

export function offerNeedsReview(
  zestawienie: ReviewableItem[] | undefined,
  settings: AppSettings
): boolean {
  return (zestawienie ?? []).some((item) => positionNeedsReview(item, settings));
}
