// Waluta wyświetlania. EUR jest JEDYNYM źródłem prawdy: cały stan kalkulatora,
// lib/calc-data.ts i zapis do offer_data trzymają wyłącznie €/t. PLN istnieje tylko
// jako warstwa prezentacji + adapter na wejściu (toDisplay przy odczycie, fromDisplay
// przy edycji). Dzięki temu silnik liczenia nie wie nic o walutach.

import type { SteelType } from './calculatorData';

export type Currency = 'EUR' | 'PLN';

export const DEFAULT_CURRENCY: Currency = 'EUR';
export const CURRENCY_STORAGE_KEY = 'amsteel-currency';

// Fallback używany zanim /api/settings odpowie oraz gdy oferta zapisana przed tą zmianą
// nie ma zamrożonego kursu.
export const DEFAULT_EUR_PLN_RATE = 4.3;

// PGL bazowe jest osobne dla każdego typu stali — HRS, CR i HDG mają różne bazowe ceny
// wsadu w praktyce (migracja 011). Transport i kurs zostają wspólne dla całej kalkulacji.
export interface AppSettings {
  eurPlnRate: number;
  pglBaseHrs: number;
  pglBaseCr: number;
  pglBaseHdg: number;
  pglBasePickled: number;
  pglBaseTeardrop: number;
  pglBaseZm: number;
  transportBase: number;
  // Próg marży (%), poniżej którego oferta wymaga zatwierdzenia przez seniora/admina
  // (patrz lib/offerReview.ts) — konfigurowalny w Ustawieniach, tak jak PGL bazowe.
  minMarginPct: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  eurPlnRate: DEFAULT_EUR_PLN_RATE,
  pglBaseHrs: 645,
  pglBaseCr: 645,
  pglBaseHdg: 645,
  pglBasePickled: 650,
  pglBaseTeardrop: 650,
  pglBaseZm: 650,
  transportBase: 20,
  minMarginPct: 7,
};

// Wiersz app_settings z bazy -> kształt dla klienta. NUMERIC wraca z pg jako string,
// więc parsujemy. Współdzielone przez /api/settings, /api/offers/[id]/send i
// /api/offers/[id] (PUT), żeby serwer liczył offerNeedsReview na tych samych wartościach.
export function settingsRowToAppSettings(row: {
  eur_pln_rate: string | number;
  pgl_base_hrs: string | number;
  pgl_base_cr: string | number;
  pgl_base_hdg: string | number;
  pgl_base_pickled: string | number;
  pgl_base_teardrop: string | number;
  pgl_base_zm: string | number;
  transport_base: string | number;
  min_margin_pct: string | number;
}): AppSettings {
  return {
    eurPlnRate: Number(row.eur_pln_rate),
    pglBaseHrs: Number(row.pgl_base_hrs),
    pglBaseCr: Number(row.pgl_base_cr),
    pglBaseHdg: Number(row.pgl_base_hdg),
    pglBasePickled: Number(row.pgl_base_pickled),
    pglBaseTeardrop: Number(row.pgl_base_teardrop),
    pglBaseZm: Number(row.pgl_base_zm),
    transportBase: Number(row.transport_base),
    minMarginPct: Number(row.min_margin_pct),
  };
}

// PGL bazowe dla aktualnie wybranego typu stali w kalkulatorze.
export function pglBaseForType(type: SteelType, settings: AppSettings): number {
  switch (type) {
    case 'HRS':
      return settings.pglBaseHrs;
    case 'CR':
      return settings.pglBaseCr;
    case 'HDG':
      return settings.pglBaseHdg;
    case 'PICKLED':
      return settings.pglBasePickled;
    case 'TEARDROP':
      return settings.pglBaseTeardrop;
    case 'ZM':
      return settings.pglBaseZm;
  }
}

export function isCurrency(value: unknown): value is Currency {
  return value === 'EUR' || value === 'PLN';
}

// Kurs spoza tego zakresu oznacza błąd (literówka admina, zepsuty rekord) — lepiej
// policzyć po domyślnym niż pokazać handlowcowi cenę zawyżoną 100x.
export function sanitizeRate(rate: unknown): number {
  const n = typeof rate === 'string' ? parseFloat(rate) : rate;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 100) {
    return DEFAULT_EUR_PLN_RATE;
  }
  return n;
}

// EUR (stan) -> waluta wyświetlania.
export function toDisplay(eur: number, rate: number, currency: Currency): number {
  if (!Number.isFinite(eur)) return 0;
  return currency === 'PLN' ? eur * rate : eur;
}

// Waluta wyświetlania (to, co wpisał użytkownik) -> EUR (stan).
export function fromDisplay(value: number, rate: number, currency: Currency): number {
  if (!Number.isFinite(value)) return 0;
  return currency === 'PLN' ? value / rate : value;
}

// Sufiks jednostki przy kwotach. Języki inne niż PL i tak używają €/t, a złotówka
// zapisana jako "zł/t" jest czytelna w każdym z nich.
export function currencySymbol(currency: Currency): string {
  return currency === 'PLN' ? 'zł/t' : '€/t';
}

// Formatowanie kwoty do wyświetlenia.
export function formatMoney(eur: number, rate: number, currency: Currency, decimals = 2): string {
  return toDisplay(eur, rate, currency).toFixed(decimals);
}

// Cena końcowa jest zawsze zaokrąglana W GÓRĘ do pełnej jednostki waluty wyświetlania
// (decyzja biznesowa: nigdy nie zaniżać ceny końcowej). Reszta kwot (rozbicie dopłat,
// sumy pośrednie, wartość całkowita) zostaje na 2 miejscach po przecinku bez zmian.
export function ceilToUnit(eur: number, rate: number, currency: Currency): number {
  return Math.ceil(toDisplay(eur, rate, currency));
}

export function formatMoneyCeil(eur: number, rate: number, currency: Currency): string {
  return String(ceilToUnit(eur, rate, currency));
}

// --- Waluta ZAPISANA W OFERCIE -------------------------------------------------
// Oferta niesie własną walutę i własny kurs (offer_data.displayCurrency / .eurPlnRate),
// zamrożone w chwili zapisu. Listy ofert, podgląd u starszego i PDF muszą czytać JE,
// a nie bieżące ustawienia — inaczej zmiana kursu przez admina zmieniłaby kwoty na
// ofertach już wysłanych i czekających na akceptację.
//
// Oferty sprzed tej zmiany nie mają tych pól -> traktujemy je jako EUR (tak wtedy było).
export interface OfferCurrencyMeta {
  displayCurrency?: unknown;
  eurPlnRate?: unknown;
}

export function offerCurrency(data: OfferCurrencyMeta | null | undefined): Currency {
  const value = data?.displayCurrency;
  return isCurrency(value) ? value : DEFAULT_CURRENCY;
}

export function offerRate(data: OfferCurrencyMeta | null | undefined): number {
  return sanitizeRate(data?.eurPlnRate);
}

// Sufiks przy kwocie CAŁKOWITEJ (nie za tonę): "1234.56 zł" / "1234.56 €".
export function offerTotalUnit(data: OfferCurrencyMeta | null | undefined): string {
  return offerCurrency(data) === 'PLN' ? 'zł' : '€';
}

// Kwota w EUR -> tekst w walucie oferty, po jej zamrożonym kursie.
export function formatOfferMoney(
  eur: number,
  data: OfferCurrencyMeta | null | undefined,
  decimals = 2
): string {
  return toDisplay(eur, offerRate(data), offerCurrency(data)).toFixed(decimals);
}

// Wariant formatOfferMoney dla ceny końcowej — zaokrąglenie w górę do pełnej jednostki,
// tym samym zamrożonym kursem/walutą co reszta kwot oferty. Patrz ceilToUnit.
export function formatOfferMoneyCeil(
  eur: number,
  data: OfferCurrencyMeta | null | undefined
): string {
  return String(ceilToUnit(eur, offerRate(data), offerCurrency(data)));
}
