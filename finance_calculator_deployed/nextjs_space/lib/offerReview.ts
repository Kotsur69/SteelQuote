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
export function positionNeedsReview(item: ReviewableItem, settings: AppSettings): boolean {
  const marginPct = item.inputs?.marginPct;
  if (typeof marginPct !== 'number' || marginPct < settings.minMarginPct) return true;
  if (item.pgl < pglBaseForType(item.type, settings)) return true;
  return false;
}

export function offerNeedsReview(
  zestawienie: ReviewableItem[] | undefined,
  settings: AppSettings
): boolean {
  return (zestawienie ?? []).some((item) => positionNeedsReview(item, settings));
}
