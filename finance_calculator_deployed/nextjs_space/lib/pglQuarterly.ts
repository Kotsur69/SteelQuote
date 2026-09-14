// Harmonogram kwartalny cen bazowych PGL (migracja 021) — admin planuje ceny z wyprzedzeniem
// dla Q1-Q4 danego roku i danego typu stali, a kalkulator ma sam użyć tej właściwej dla
// kwartału, w którym aktualnie jesteśmy (wg zegara serwera), bez ręcznej interwencji.
//
// Ta tabela NIE zastępuje app_settings.pgl_base_* — jest nakładką: gdy dla aktualnego roku+
// kwartału+typu istnieje zaplanowany wiersz, wygrywa on z wartością ręczną; w przeciwnym razie
// zostaje dotychczasowa wartość ręczna jako fallback (instalacja bez zaplanowanych kwartałów
// działa dokładnie jak przed tą zmianą).
import pool from './db';
import type { AppSettings } from './currency';
import type { SteelType } from './calculatorData';
import { quarterOf, type Quarter } from './quarterUtils';

export type { Quarter };

export const STEEL_TYPES: SteelType[] = ['HRS', 'CR', 'HDG', 'PICKLED', 'TEARDROP', 'ZM'];

type NumericPglKey =
  | 'pglBaseHrs'
  | 'pglBaseCr'
  | 'pglBaseHdg'
  | 'pglBasePickled'
  | 'pglBaseTeardrop'
  | 'pglBaseZm';

// Klucz app_settings/AppSettings dla każdego typu stali — jedno źródło prawdy, żeby nie
// rozjeżdżać tego mapowania między GET /api/settings, offers/[id]/send i offers/[id] (PUT).
const SETTINGS_KEY_BY_STEEL_TYPE: Record<SteelType, NumericPglKey> = {
  HRS: 'pglBaseHrs',
  CR: 'pglBaseCr',
  HDG: 'pglBaseHdg',
  PICKLED: 'pglBasePickled',
  TEARDROP: 'pglBaseTeardrop',
  ZM: 'pglBaseZm',
};

/** Rok + kwartał (1-4) dla podanej daty — domyślnie "teraz" wg zegara serwera. */
export function currentQuarter(date: Date = new Date()): { year: number; quarter: Quarter } {
  return quarterOf(date);
}

export interface PglQuarterlyEntry {
  year: number;
  quarter: Quarter;
  steelType: SteelType;
  price: number;
  updatedByName: string | null;
  updatedByEmail: string | null;
  updatedAt: string;
}

/**
 * Ceny zaplanowane na PODANY rok+kwartał, per typ stali. Brak wpisu dla typu = ten typ nie ma
 * zaplanowanej ceny i jedzie dalej na ręcznej wartości pgl_base_*.
 * Brak tabeli (migracja 021 jeszcze nie puszczona) -> pusty wynik, tak samo jak przy
 * transport_tariff_bands w app/api/settings/route.ts — kalkulator ma dalej działać na
 * wartościach ręcznych, a nie sypać 500.
 */
export async function readQuarterPrices(year: number, quarter: Quarter): Promise<Partial<Record<SteelType, number>>> {
  try {
    const result = await pool.query(
      `SELECT steel_type, price FROM pgl_quarterly_prices WHERE year = $1 AND quarter = $2`,
      [year, quarter]
    );
    const prices: Partial<Record<SteelType, number>> = {};
    for (const row of result.rows) {
      prices[row.steel_type as SteelType] = Number(row.price);
    }
    return prices;
  } catch (error) {
    if ((error as { code?: string })?.code === '42P01') return {};
    throw error;
  }
}

/** Ceny zaplanowane na AKTUALNY kwartał (wg zegara serwera) — patrz readQuarterPrices. */
export async function readCurrentQuarterPrices(): Promise<Partial<Record<SteelType, number>>> {
  const { year, quarter } = currentQuarter();
  return readQuarterPrices(year, quarter);
}

/**
 * Nakłada na `settings` ceny zaplanowane na dany rok+kwartał — jeśli admin zaplanował cenę dla
 * danego typu na ten kwartał, wygrywa ona z ręczną wartością pgl_base_*. Domyślnie (bez `target`)
 * to bieżący kwartał wg zegara serwera — dotychczasowe zachowanie dla wszystkich istniejących
 * wywołań. Kalkulator może podać `target` wyliczony z wybranego "okresu ważności oferty", żeby
 * dostać PGL zaplanowane na kwartał, w którym ta oferta ma obowiązywać, a nie na "teraz".
 */
export async function applyQuarterlyPglOverride(
  settings: AppSettings,
  target: { year: number; quarter: Quarter } = currentQuarter()
): Promise<AppSettings> {
  const prices = await readQuarterPrices(target.year, target.quarter);
  const types = Object.keys(prices) as SteelType[];
  if (types.length === 0) return settings;

  const next = { ...settings };
  for (const type of types) {
    const price = prices[type];
    if (price !== undefined) next[SETTINGS_KEY_BY_STEEL_TYPE[type]] = price;
  }
  return next;
}

/** Wszystkie zaplanowane ceny dla jednego roku — do panelu admina (siatka Q1-Q4 x typ stali). */
export async function readQuarterlyPricesForYear(year: number): Promise<PglQuarterlyEntry[]> {
  const result = await pool.query(
    `SELECT p.year, p.quarter, p.steel_type, p.price, p.updated_at,
            u.full_name AS updated_by_name, u.email AS updated_by_email
     FROM pgl_quarterly_prices p
     LEFT JOIN users u ON u.id = p.updated_by
     WHERE p.year = $1
     ORDER BY p.quarter, p.steel_type`,
    [year]
  );
  return result.rows.map((row) => ({
    year: row.year,
    quarter: row.quarter as Quarter,
    steelType: row.steel_type as SteelType,
    price: Number(row.price),
    updatedByName: row.updated_by_name,
    updatedByEmail: row.updated_by_email,
    updatedAt: row.updated_at,
  }));
}
