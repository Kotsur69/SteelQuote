'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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
    const saved = localStorage?.getItem?.('theme');
    if (saved === 'light') setDark(false);
    else setDark(true);
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
