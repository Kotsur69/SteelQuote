// Czysta funkcja rok+kwartał dla daty — bez importu `db`, więc bezpieczna także w komponencie
// klienckim (Calculator.tsx liczy nią kwartał wybranego "okresu ważności oferty"). Serwerowy
// lib/pglQuarterly.ts owija ją jako currentQuarter() dla zgodności z dotychczasowym kodem.
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
