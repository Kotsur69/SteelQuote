'use client';

// Full-page view of the assistant (plan D17): the same chat as the bubble panel - the state
// lives in AssistantProvider above the router - with room for wide tables.

import type { CSSProperties } from 'react';
import { Plus } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDarkMode } from '@/lib/useDarkMode';
import { useHighContrast } from '@/lib/useHighContrast';
import { getThemeVars } from '@/lib/themeVars';
import { AssistantChat } from '@/components/assistant/AssistantChat';
import { useAssistant } from '@/components/assistant/AssistantProvider';
import { panelLang, STRINGS } from '@/components/assistant/strings';

export default function AssistantPage() {
  const { language } = useLanguage();
  const strings = STRINGS[panelLang(language)];
  const { newChat, messages } = useAssistant();
  const [isDark] = useDarkMode();
  const [highContrast] = useHighContrast();
  // Same theme wrapper as every other page (lib/themeVars).
  const themeVars = getThemeVars(isDark, highContrast) as CSSProperties;

  return (
    <div className="flex h-dvh flex-col p-4 font-sans sm:p-7" style={{ ...themeVars, background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <Navigation isDark={isDark} highContrast={highContrast} />
      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-2 pb-2 sm:px-4">
        <div className="flex items-center justify-between px-2 py-3">
          <h1 className="m-0 text-lg font-semibold text-txt-primary">{strings.title}</h1>
          <button
            type="button"
            onClick={newChat}
            disabled={messages.length === 0}
            className="flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border border-brd-hi px-3 text-sm font-medium text-txt-secondary transition-colors duration-150 hover:text-txt-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {strings.newChat}
          </button>
        </div>
        <section aria-label={strings.title} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-brd bg-[var(--bg-card)]">
          <AssistantChat autoFocus />
        </section>
      </main>
    </div>
  );
}
