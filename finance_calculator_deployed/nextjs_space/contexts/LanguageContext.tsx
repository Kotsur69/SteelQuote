'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Language,
  Translations,
  translations,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
} from '@/lib/translations';

interface LanguageContextType {
  language: Language;
  t: Translations;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: React.ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  // Load language preference from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null;
    if (stored && (stored === 'pl' || stored === 'en' || stored === 'cs' || stored === 'de')) {
      setLanguageState(stored);
    }
  }, []);

  // Save language preference to localStorage when changed
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }, []);

  // Toggle between available languages
  const toggleLanguage = useCallback(() => {
    const newLang = language === 'pl' ? 'en' : 'pl';
    setLanguage(newLang);
  }, [language, setLanguage]);

  // Get current translations
  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, t, setLanguage, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

// Custom hook to use language context
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// Language flag button component
interface LanguageFlagProps {
  lang: Language;
  currentLang: Language;
  onClick: () => void;
  className?: string;
}

// SVG Flag components for reliable cross-browser rendering
function PolishFlag() {
  return (
    <svg width="20" height="14" viewBox="0 0 32 24" style={{ borderRadius: '2px' }}>
      <rect width="32" height="12" fill="#ffffff" />
      <rect y="12" width="32" height="12" fill="#dc143c" />
    </svg>
  );
}

function UKFlag() {
  return (
    <svg width="20" height="12" viewBox="0 0 60 30" style={{ borderRadius: '2px' }}>
      <rect width="60" height="30" fill="#012169"/>
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
      <path d="M0,0 L60,30" stroke="#C8102E" strokeWidth="4"/>
      <path d="M60,0 L0,30" stroke="#C8102E" strokeWidth="4"/>
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10"/>
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6"/>
    </svg>
  );
}

function CzechFlag() {
  return (
    <svg width="20" height="14" viewBox="0 0 60 40" style={{ borderRadius: '2px' }}>
      <rect width="60" height="20" fill="#ffffff" />
      <rect y="20" width="60" height="20" fill="#d7141a" />
      <path d="M0,0 L30,20 L0,40 Z" fill="#11457e" />
    </svg>
  );
}

function GermanFlag() {
  return (
    <svg width="20" height="14" viewBox="0 0 32 24" style={{ borderRadius: '2px' }}>
      <rect width="32" height="8" fill="#000000" />
      <rect y="8" width="32" height="8" fill="#dd0000" />
      <rect y="16" width="32" height="8" fill="#ffce00" />
    </svg>
  );
}

const LANG_FLAGS: Record<Language, React.ReactNode> = {
  pl: <PolishFlag />,
  en: <UKFlag />,
  cs: <CzechFlag />,
  de: <GermanFlag />,
};

const LANG_LABELS: Record<Language, string> = {
  pl: 'Polski',
  en: 'English',
  cs: 'Čeština',
  de: 'Deutsch',
};

export function LanguageFlag({ lang, currentLang, onClick, className = '' }: LanguageFlagProps) {
  const isActive = lang === currentLang;

  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all
        ${isActive
          ? 'border-[#3b8ef5] bg-[rgba(59,142,245,0.15)] scale-110'
          : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-hi)] hover:scale-105 opacity-70 hover:opacity-100'
        } ${className}`}
      title={LANG_LABELS[lang]}
      aria-label={`Switch to ${LANG_LABELS[lang]}`}
    >
      {LANG_FLAGS[lang]}
    </button>
  );
}

// Language selector component with both flags
interface LanguageSelectorProps {
  className?: string;
}

export function LanguageSelector({ className = '' }: LanguageSelectorProps) {
  const { language, setLanguage } = useLanguage();

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {(['pl', 'en', 'cs', 'de'] as Language[]).map((lang) => (
        <LanguageFlag
          key={lang}
          lang={lang}
          currentLang={language}
          onClick={() => setLanguage(lang)}
        />
      ))}
    </div>
  );
}
