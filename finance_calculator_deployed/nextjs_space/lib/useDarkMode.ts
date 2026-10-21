'use client';

import { useState, useEffect } from 'react';

const DARK_MODE_KEY = 'ssc-dark-mode';

/** Saved choice of the page toggle, or null when none was made (or storage is blocked). */
export function readStoredDarkMode(): boolean | null {
  try {
    const stored = localStorage.getItem(DARK_MODE_KEY);
    return stored === null ? null : stored === 'true';
  } catch {
    return null;
  }
}

// The brand theme (app/brand-theme.css) switches on html.dark, so the page toggle must drive
// that class too - before, it only changed the inline cssVars and the page stayed half dark.
function syncHtmlClass(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
}

// Trwaly tryb ciemny/jasny wspoldzielony miedzy podstronami (localStorage).
// Naprawia bug: wczesniej kazda strona trzymala wlasny stan isDark (domyslnie
// ciemny), przez co wybor motywu resetowal sie przy kazdej zmianie podstrony.
// Teraz wybor jest zapamietany i wspolny dla calej aplikacji.
export function useDarkMode(): [boolean, (v: boolean) => void] {
  const [isDark, setDark] = useState(true);

  // Po zamontowaniu odczytaj zapisany wybor (unikamy niezgodnosci SSR/hydracji).
  useEffect(() => {
    const stored = readStoredDarkMode();
    if (stored !== null) {
      setDark(stored);
      syncHtmlClass(stored);
    }
  }, []);

  const setIsDark = (v: boolean) => {
    setDark(v);
    syncHtmlClass(v);
    try {
      localStorage.setItem(DARK_MODE_KEY, String(v));
      // lib/theme-context keeps its own key; keep it equal so a reload agrees with the toggle.
      localStorage.setItem('theme', v ? 'dark' : 'light');
    } catch {
      /* localStorage niedostepny */
    }
  };

  return [isDark, setIsDark];
}
