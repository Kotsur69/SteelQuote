// Arytmetyka na surowym stringu YYYY-MM-DD (dokładnie to, co zwraca <input type="date">).
// Parsujemy cyfry ręcznie i liczymy w UTC — NIE przez `new Date(string)`, który czyta datę
// jako UTC północ, a odczyt lokalnymi getterami w strefie na zachód od UTC cofnąłby dzień.
// Ten sam problem i to samo lekarstwo co w lib/quarterUtils.ts (quarterOfDateString).

/** `value` + `days` dni, jako string YYYY-MM-DD. `null`, gdy `value` nie pasuje do formatu. */
export function addDaysToDateString(value: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);

  const yyyy = String(shifted.getUTCFullYear()).padStart(4, '0');
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Dzisiejsza data w strefie przeglądarki/serwera jako string YYYY-MM-DD (dla pól <input type="date">). */
export function todayDateString(): string {
  const now = new Date();
  const yyyy = String(now.getFullYear()).padStart(4, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Liczba dni od `from` do `to` (ujemna, gdy `to` jest wcześniej). `null`, gdy któryś string
 * nie pasuje do formatu YYYY-MM-DD. Liczone w UTC (patrz nagłówek pliku) — bezpieczne razem
 * z addDaysToDateString przy odtwarzaniu tego samego zakresu dni pod nową datą startową.
 */
export function daysBetweenDateStrings(from: string, to: string): number | null {
  const parse = (value: string): number | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  const fromMs = parse(from);
  const toMs = parse(to);
  if (fromMs === null || toMs === null) return null;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}
