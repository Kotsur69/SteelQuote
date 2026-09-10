export type ThemeVars = Record<string, string>;

// Wspólna paleta motywu (jasny / ciemny / wysoki kontrast) dla Calculator,
// AdminLayout, offers i senior page. Wysoki kontrast NIE jest już jednym,
// stałym motywem - ma wariant jasny i ciemny, żeby przycisk dark/light dalej
// działał wizualnie, gdy wysoki kontrast jest włączony (patrz useHighContrast).
//
// Sprzedawcy uznali dawną paletę czerń-na-bieli za zbyt ostrą ("kiczowatą"),
// więc OBA warianty wysokiego kontrastu korzystają teraz z normalnych kolorów
// (light / dark niżej). Element "wysokiego kontrastu" niosą wyłącznie typografia
// i struktura z globals.css (.hc): większy zoom, grubsza czcionka, grubsze
// obramowania - nie kolor. Obramowania i tekst pomocniczy są odrobinę mocniej
// skontrastowane niż w zwykłym motywie, żeby krawędzie paneli były czytelne na
// małych, słabych ekranach, do których ten tryb jest kierowany.

const dark: ThemeVars = {
  '--bg': '#0f1117',
  '--bg-panel': '#181c26',
  '--bg-card': '#1e2333',
  '--bg-input': '#141720',
  '--border': '#2a3048',
  '--border-hi': '#3d4a70',
  '--text-primary': '#e8ecf5',
  '--text-secondary': '#7b88aa',
  '--text-muted': '#4a536b',
  '--text-value': '#c8d4f0',
  '--accent-hrs': '#e8a020',
  '--accent-cr': '#3b8ef5',
  '--accent-hdg': '#2ecc71',
  '--accent-pickled': '#e0499a',
  '--accent-teardrop': '#22c1d6',
  '--accent-zm': '#8b7cf6',
  '--accent-sum': '#f5475a',
};

const light: ThemeVars = {
  '--bg': '#eef0f6',
  '--bg-panel': '#e2e6f0',
  '--bg-card': '#ffffff',
  '--bg-input': '#f4f5fa',
  '--border': '#b8c0d8',
  '--border-hi': '#7e90c0',
  '--text-primary': '#0d1220',
  '--text-secondary': '#2e3a5c',
  '--text-muted': '#6b789a',
  '--text-value': '#141e3a',
  '--accent-hrs': '#e8a020',
  '--accent-cr': '#3b8ef5',
  '--accent-hdg': '#2ecc71',
  '--accent-pickled': '#e0499a',
  '--accent-teardrop': '#22c1d6',
  '--accent-zm': '#8b7cf6',
  '--accent-sum': '#f5475a',
};

// Wysoki kontrast = normalne kolory + minimalnie mocniejszy kontrast krawędzi
// i tekstu pomocniczego. Reszta (zoom, waga czcionki, grubość obramowań) idzie
// z reguł .hc w globals.css.
const highContrastLight: ThemeVars = {
  ...light,
  '--border': '#8a97b8',
  '--border-hi': '#5b6f9f',
  '--text-muted': '#556080',
};

const highContrastDark: ThemeVars = {
  ...dark,
  '--border': '#3d4668',
  '--border-hi': '#556492',
  '--text-muted': '#6b7699',
};

export function getThemeVars(isDark: boolean, highContrast: boolean): ThemeVars {
  if (highContrast) return isDark ? highContrastDark : highContrastLight;
  return isDark ? dark : light;
}
