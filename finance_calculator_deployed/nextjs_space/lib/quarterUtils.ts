// Czysta funkcja rok+kwartał dla daty — bez importu `db`, więc bezpieczna także w komponencie
// klienckim (Calculator.tsx liczy nią kwartał wybranego "okresu ważności oferty"). Serwerowy
// lib/pglQuarterly.ts owija ją jako currentQuarter() dla zgodności z dotychczasowym kodem.
import { todayDateString } from './dateUtils';

export type Quarter = 1 | 2 | 3 | 4;

export function quarterOf(date: Date): { year: number; quarter: Quarter } {
  return {
    year: date.getFullYear(),
    quarter: (Math.floor(date.getMonth() / 3) + 1) as Quarter,
  };
}

/**
 * Rok + kwartał z surowego stringa `YYYY-MM-DD` (dokładnie to, co zwraca <input type="date">).
 * Parsujemy cyfry wprost, a NIE przez `new Date(string)` — ten konstruktor czyta datę jako UTC
 * północ, a odczyt przez lokalne gettery (getMonth/getDate) w strefie na zachód od UTC cofnąłby
 * dzień/miesiąc o jeden, co w okolicy granicy kwartału dawałoby błędny kwartał.
 */
export function quarterOfDateString(value: string): { year: number; quarter: Quarter } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, quarter: Math.ceil(month / 3) as Quarter };
}

/** Ostatni dzień danego miesiąca (1-12) jako string YYYY-MM-DD. Liczone w UTC, patrz dateUtils.ts. */
export function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  const yyyy = String(d.getUTCFullYear()).padStart(4, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Pierwszy i ostatni dzień danego kwartału jako stringi YYYY-MM-DD. */
export function quarterDateRange(year: number, quarter: Quarter): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = quarter * 3;
  const start = `${String(year).padStart(4, '0')}-${String(startMonth).padStart(2, '0')}-01`;
  return { start, end: lastDayOfMonth(year, endMonth) };
}

/**
 * "Ten miesiąc": od dzisiaj do końca bieżącego miesiąca. Współdzielone między
 * OfferValidityPicker (przycisk "Ten miesiąc") i Calculator (domyślny okres ważności
 * dla nowej oferty) — patrz obie strony wywołania, żeby nie rozjechały się przy zmianie.
 */
export function thisMonthValidityRange(): { from: string; to: string } {
  const now = new Date();
  return { from: todayDateString(), to: lastDayOfMonth(now.getFullYear(), now.getMonth() + 1) };
}

export type ValidityMode = 'quarter' | 'month' | 'custom';

/**
 * Rozpoznaje, którym presetem (OfferValidityPicker) mogły powstać zapisane `validFrom`/`validTo`
 * — porównując `validTo` z ostatnim dniem miesiąca/kwartału zawierającego `validFrom`, a NIE
 * `validFrom` z pierwszym dniem okresu, bo "Ten miesiąc"/bieżący kwartał startują od "dziś",
 * nie od 1. dnia (patrz OfferValidityPicker.pickQuarter/pickThisMonth). "Ten miesiąc" rozpoznajemy
 * tylko wtedy, gdy miesiąc `validFrom` to naprawdę bieżący rok+miesiąc (wg zegara przeglądarki) —
 * w przeciwnym razie miesiąc, który tylko przypadkiem kończy się jak dawny "dziś", zostałby
 * błędnie rozpoznany jako wciąż aktywny preset. Zwraca `null`, gdy `validFrom` jest puste (nowa
 * oferta) — wtedy OfferValidityPicker domyślnie pokazuje tryb "custom" z pustymi polami.
 */
export function detectValidityMode(
  validFrom: string,
  validTo: string
): { mode: ValidityMode; year: number; quarter?: Quarter } | null {
  const fromMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(validFrom);
  if (!fromMatch || !validTo) return null;
  const year = Number(fromMatch[1]);
  const month = Number(fromMatch[2]);
  const fromQ = quarterOfDateString(validFrom);
  if (!fromQ) return null;

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  if (isCurrentMonth && validTo === lastDayOfMonth(year, month)) {
    return { mode: 'month', year };
  }

  const { end } = quarterDateRange(fromQ.year, fromQ.quarter);
  if (validTo === end) {
    return { mode: 'quarter', year: fromQ.year, quarter: fromQ.quarter };
  }

  return { mode: 'custom', year: fromQ.year };
}
