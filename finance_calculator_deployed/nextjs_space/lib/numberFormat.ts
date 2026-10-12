// Thousands grouping for DISPLAY ONLY: "1234567.89" -> "1 234 567.89".
//
// Never feed the result back into an <input>, parseFloat, an API payload or a CSV/XLSX
// export - the separator is not a digit and would break parsing. Inputs keep raw numbers.

/** Narrow no-break space: a slight gap that never wraps a number across lines. */
export const THOUSANDS_SEP = ' ';

/**
 * Groups the first run of digits in an already formatted number string. Everything after it
 * (decimal separator, decimals, unit suffix) is left untouched, so it works the same for
 * "1234.56", "1234,5" and "1234567".
 */
export function groupThousands(formatted: string, sep: string = THOUSANDS_SEP): string {
  return formatted.replace(/^([-−]?)(\d+)/, (_m, sign: string, int: string) =>
    sign + int.replace(/\B(?=(\d{3})+$)/g, sep)
  );
}

/** toFixed with thousands grouping. */
export function fixedGrouped(value: number, decimals: number, sep: string = THOUSANDS_SEP): string {
  return groupThousands(value.toFixed(decimals), sep);
}
