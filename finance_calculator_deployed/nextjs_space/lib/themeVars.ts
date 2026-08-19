export type ThemeVars = Record<string, string>;

// Wspólna paleta motywu (jasny / ciemny / wysoki kontrast) dla Calculator,
// AdminLayout, offers i senior page. Wysoki kontrast NIE jest już jednym,
// stałym motywem - ma wariant jasny i ciemny, żeby przycisk dark/light dalej
// działał wizualnie, gdy wysoki kontrast jest włączony (patrz useHighContrast).
const highContrastLight: ThemeVars = {
  '--bg': '#ffffff',
  '--bg-panel': '#f0f0f0',
  '--bg-card': '#ffffff',
  '--bg-input': '#ffffff',
  '--border': '#000000',
  '--border-hi': '#000000',
  '--text-primary': '#000000',
  '--text-secondary': '#1a1a1a',
  '--text-muted': '#333333',
  '--text-value': '#000000',
  '--accent-hrs': '#7a4a00',
  '--accent-cr': '#0b3d91',
  '--accent-hdg': '#0b6b2c',
  '--accent-pickled': '#8a1a4a',
  '--accent-teardrop': '#0e6270',
  '--accent-zm': '#3d2f8f',
  '--accent-sum': '#9c0b1e',
};

const highContrastDark: ThemeVars = {
  '--bg': '#000000',
  '--bg-panel': '#0a0a0a',
  '--bg-card': '#000000',
  '--bg-input': '#000000',
  '--border': '#ffffff',
  '--border-hi': '#ffffff',
  '--text-primary': '#ffffff',
  '--text-secondary': '#f2f2f2',
  '--text-muted': '#cccccc',
  '--text-value': '#ffffff',
  '--accent-hrs': '#ff9500',
  '--accent-cr': '#66b3ff',
  '--accent-hdg': '#5ce488',
  '--accent-pickled': '#ff7ac6',
  '--accent-teardrop': '#5be6ff',
  '--accent-zm': '#b8a6ff',
  '--accent-sum': '#ff6b7a',
};

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

export function getThemeVars(isDark: boolean, highContrast: boolean): ThemeVars {
  if (highContrast) return isDark ? highContrastDark : highContrastLight;
  return isDark ? dark : light;
}
