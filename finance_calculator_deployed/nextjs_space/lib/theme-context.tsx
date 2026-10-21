'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { readStoredDarkMode } from '@/lib/useDarkMode';

interface ThemeCtx {
  dark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ dark: true, toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // The page toggle (useDarkMode) is the source of truth; 'theme' is only the older fallback.
    const toggled = readStoredDarkMode();
    if (toggled !== null) setDark(toggled);
    else setDark(localStorage?.getItem?.('theme') !== 'light');
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (dark) {
      document?.documentElement?.classList?.add?.('dark');
      localStorage?.setItem?.('theme', 'dark');
    } else {
      document?.documentElement?.classList?.remove?.('dark');
      localStorage?.setItem?.('theme', 'light');
    }
  }, [dark, mounted]);

  const toggle = useCallback(() => setDark((d: boolean) => !d), []);

  if (!mounted) return <div className="min-h-screen" style={{ background: '#0a1628' }} />;

  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
