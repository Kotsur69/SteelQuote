'use client';
import React, { useState, useEffect } from 'react';
import { ThemeProvider } from '@/lib/theme-context';
import { LangProvider } from '@/lib/lang-context';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { UnsavedGuardProvider } from '@/lib/unsavedGuard';
import { AssistantProvider } from '@/components/assistant/AssistantProvider';
import { AssistantShell } from '@/components/assistant/AssistantShell';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="min-h-screen bg-skin-bg" />;
  return (
    <ThemeProvider>
      <LangProvider>
        <LanguageProvider>
          <CurrencyProvider>
            <UnsavedGuardProvider>
              {/* Above the pages on purpose: the chat survives navigation (plan D17). */}
              <AssistantProvider>
                {children}
                <AssistantShell />
              </AssistantProvider>
            </UnsavedGuardProvider>
          </CurrencyProvider>
        </LanguageProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
