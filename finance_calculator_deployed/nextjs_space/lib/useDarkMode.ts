'use client';

import { useState, useEffect } from 'react';

const DARK_MODE_KEY = 'ssc-dark-mode';

// Trwaly tryb ciemny/jasny wspoldzielony miedzy podstronami (localStorage).
// Naprawia bug: wczesniej kazda strona trzymala wlasny stan isDark (domyslnie
// ciemny), przez co wybor motywu resetowal sie przy kazdej zmianie podstrony.
// Teraz wybor jest zapamietany i wspolny dla calej aplikacji.
export function useDarkMode(): [boolean, (v: boolean) => void] {
  const [isDark, setDark] = useState(true);

  // Po zamontowaniu odczytaj zapisany wybor (unikamy niezgodnosci SSR/hydracji).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DARK_MODE_KEY);
      if (stored !== null) setDark(stored === 'true');
    } catch {
      /* localStorage niedostepny */
    }
  }, []);

  const setIsDark = (v: boolean) => {
    setDark(v);
    try {
      localStorage.setItem(DARK_MODE_KEY, String(v));
    } catch {
      /* localStorage niedostepny */
    }
  };

  return [isDark, setIsDark];
}
