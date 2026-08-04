'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Currency,
  AppSettings,
  DEFAULT_CURRENCY,
  DEFAULT_SETTINGS,
  CURRENCY_STORAGE_KEY,
  isCurrency,
  sanitizeRate,
  toDisplay as toDisplayRaw,
  fromDisplay as fromDisplayRaw,
  currencySymbol,
} from '@/lib/currency';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Kurs użyty do przeliczeń. Dla wczytanej oferty jest to kurs ZAMROŻONY w chwili jej zapisu. */
  rate: number;
  /** Bieżące ustawienia globalne z /api/settings (domyślne PGL i transport dla NOWEJ kalkulacji). */
  settings: AppSettings;
  settingsLoaded: boolean;
  /**
   * Pobiera świeże ustawienia z /api/settings i aktualizuje kontekst (dla WSZYSTKICH
   * konsumentów, nie tylko wywołującego). Kontekst mieszka w Providers na poziomie root
   * layoutu i żyje przez cały czas trwania karty — nawigacja klienta między stronami go
   * NIE odmontowuje, więc bez tego admin, który właśnie zmienił PGL/kurs w panelu, i tak
   * widziałby starą wartość w kalkulatorze aż do twardego odświeżenia karty. Strony, którym
   * zależy na aktualnym stanie przy każdym wejściu (patrz Calculator.tsx), wołają to same
   * przy montowaniu zamiast polegać wyłącznie na jednorazowym fetchu poniżej.
   */
  refreshSettings: () => Promise<AppSettings | null>;
  /** Nadpisuje kurs kursem zamrożonym w ofercie. null = wróć do bieżącego kursu z ustawień. */
  setRateOverride: (rate: number | null) => void;
  /** EUR -> waluta wyświetlania. */
  toDisplay: (eur: number) => number;
  /** Waluta wyświetlania -> EUR. */
  fromDisplay: (value: number) => number;
  /** Sufiks jednostki: '€/t' albo 'zł/t'. */
  symbol: string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(DEFAULT_CURRENCY);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [rateOverride, setRateOverride] = useState<number | null>(null);

  // Wybór waluty przeżywa przeładowanie strony (wzorzec z LanguageContext).
  useEffect(() => {
    const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (isCurrency(stored)) setCurrencyState(stored);
  }, []);

  // Pobiera świeże ustawienia z /api/settings i aktualizuje kontekst. Błąd (np. wygasła
  // sesja, brak migracji) nie może wywrócić kalkulatora - zostajemy przy tym, co już mamy
  // (na starcie to DEFAULT_SETTINGS, kopia seeda z migracji 007/011).
  const refreshSettings = useCallback(async (): Promise<AppSettings | null> => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.settings) {
        setSettings(data.settings as AppSettings);
        return data.settings as AppSettings;
      }
      return null;
    } catch (error) {
      console.error('Nie udało się pobrać ustawień, używam domyślnych:', error);
      return null;
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  // Jednorazowy fetch przy starcie karty. Providers żyje przez cały czas trwania karty
  // i NIE odmontowuje się przy nawigacji klienta między stronami, więc to jedyne miejsce,
  // gdzie ustawienia ładują się "same z siebie" - potem trzeba jawnie wołać refreshSettings().
  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem(CURRENCY_STORAGE_KEY, c);
  }, []);

  // Kurs ZAMROŻONY w ofercie ma pierwszeństwo nad bieżącym z ustawień.
  // Bez tego zmiana kursu przez admina przeliczyłaby wstecz oferty zapisane, wysłane
  // i czekające na akceptację seniora. Override ustawia Calculator przy wczytaniu oferty.
  const rate = sanitizeRate(rateOverride ?? settings.eurPlnRate);

  const value = useMemo<CurrencyContextType>(
    () => ({
      currency,
      setCurrency,
      rate,
      settings,
      settingsLoaded,
      refreshSettings,
      setRateOverride,
      toDisplay: (eur: number) => toDisplayRaw(eur, rate, currency),
      fromDisplay: (v: number) => fromDisplayRaw(v, rate, currency),
      symbol: currencySymbol(currency),
    }),
    [currency, setCurrency, rate, settings, settingsLoaded, refreshSettings]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

// Przełącznik EURO | PLN. Używany w kalkulatorze pod blokiem "Waga arkusza".
export function CurrencySelector({ className = '' }: { className?: string }) {
  const { currency, setCurrency } = useCurrency();

  const options: { value: Currency; label: string }[] = [
    { value: 'EUR', label: 'EURO' },
    { value: 'PLN', label: 'PLN' },
  ];

  return (
    <div className={`inline-flex gap-1 ${className}`} role="group" aria-label="Waluta">
      {options.map((opt) => {
        const isActive = currency === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setCurrency(opt.value)}
            aria-pressed={isActive}
            className={`px-3 py-1 rounded font-mono text-[11px] font-semibold border transition-colors
              ${
                isActive
                  ? 'bg-[rgba(59,142,245,0.12)] border-[#3b8ef5] text-[#3b8ef5]'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
              }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
