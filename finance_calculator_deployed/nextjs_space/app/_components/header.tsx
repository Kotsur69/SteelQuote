'use client';
import React from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useLang } from '@/lib/lang-context';
import { useTheme } from '@/lib/theme-context';
import { t } from '@/lib/translations';
import { Calculator, Sun, Moon, Globe, LogOut, FileText } from 'lucide-react';

interface HeaderProps {
  activeTab?: 'calculator' | 'offers';
  onTabChange?: (tab: 'calculator' | 'offers') => void;
}

export default function Header({ activeTab = 'calculator', onTabChange }: HeaderProps) {
  const { data: session } = useSession() || {};
  const { lang, setLang } = useLang();
  const { dark, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl border-b border-brd" style={{ background: 'var(--bg-panel)' }}>
      <div className="max-w-[1200px] mx-auto px-4 h-14 flex items-center justify-between">
        {/* Left: logo + nav tabs */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Calculator size={18} className="text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-sm text-txt-primary">{t('appTitle', lang)}</span>
              <span className="block text-[10px] text-txt-muted">{t('appSubtitle', lang)}</span>
            </div>
          </div>

          {/* Navigation tabs */}
          {onTabChange && (
            <div className="flex items-center gap-1 ml-4 bg-skin-panel rounded-lg p-0.5">
              <button
                onClick={() => onTabChange('calculator')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'calculator'
                    ? 'bg-accent text-white shadow'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                <Calculator size={14} />
                {t('calculator', lang)}
              </button>
              <button
                onClick={() => onTabChange('offers')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'offers'
                    ? 'bg-accent text-white shadow'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                <FileText size={14} />
                {t('myOffers', lang)}
              </button>
            </div>
          )}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')}
            className="p-2 rounded-lg border border-brd text-txt-secondary hover:border-brd-hi transition"
            title={t('language', lang)}
          >
            <Globe size={18} />
            <span className="text-xs ml-0.5 font-medium">{lang?.toUpperCase?.()}</span>
          </button>

          <button
            onClick={toggle}
            className="p-2 rounded-lg border border-brd text-txt-secondary hover:border-brd-hi transition"
            title={dark ? t('lightMode', lang) : t('darkMode', lang)}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {session?.user && (
            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs text-txt-muted hidden sm:block">
                {session?.user?.email ?? ''}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="p-2 rounded-lg border border-brd text-accent-sum hover:border-accent-sum transition"
                title={t('logout', lang)}
              >
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
