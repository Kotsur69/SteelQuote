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
