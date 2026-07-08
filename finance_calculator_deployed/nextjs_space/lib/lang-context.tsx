'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';
type Lang = 'pl' | 'en' | 'de';

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangCtx>({ lang: 'pl', setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('pl');
  const setLang = useCallback((l: Lang) => setLangState(l), []);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
