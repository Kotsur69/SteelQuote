'use client';

import { useState, useEffect } from 'react';

const HIGH_CONTRAST_KEY = 'ssc-high-contrast';

// Tryb wysokiego kontrastu, niezalezny od jasny/ciemny, wspoldzielony
// miedzy podstronami (localStorage) - ten sam wzorzec co useDarkMode.
// Dodatkowo przelacza klase `hc` na <html>, zeby globalne reguly CSS
// (pogrubienie, grubsze obramowania, powiekszenie tekstu) mogly zadzialac
// bez koniecznosci warunkowania kazdego elementu z osobna.
export function useHighContrast(): [boolean, (v: boolean) => void] {
  const [highContrast, setHc] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HIGH_CONTRAST_KEY);
      if (stored !== null) setHc(stored === 'true');
    } catch {
      /* localStorage niedostepny */
    }
  }, []);

  useEffect(() => {
    document?.documentElement?.classList?.toggle?.('hc', highContrast);
  }, [highContrast]);

  const setHighContrast = (v: boolean) => {
    setHc(v);
    try {
      localStorage.setItem(HIGH_CONTRAST_KEY, String(v));
    } catch {
      /* localStorage niedostepny */
    }
  };

  return [highContrast, setHighContrast];
}
