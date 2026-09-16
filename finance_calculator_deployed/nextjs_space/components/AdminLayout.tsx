'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage, LanguageSelector } from '@/contexts/LanguageContext';
import { useDarkMode } from '@/lib/useDarkMode';
import { useHighContrast } from '@/lib/useHighContrast';
import { getThemeVars } from '@/lib/themeVars';

interface AdminLayoutProps {
  children: React.ReactNode;
}

// Wspólny szkielet stron /admin: motyw (CSS custom properties), nagłówek i pod-nawigacja.
// Wzorzec ciemny/jasny motyw i zmienne --accent-* takie same jak w reszcie aplikacji.
export default function AdminLayout({ children }: AdminLayoutProps) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [isDark, setIsDark] = useDarkMode();
  const [highContrast, setHighContrast] = useHighContrast();

  const cssVars = getThemeVars(isDark, highContrast);

  const tabs = [
    { href: '/admin', label: t.admin.navDashboard, icon: '🏠' },
    { href: '/analytics', label: t.analytics.navAnalytics, icon: '📊' },
    { href: '/admin/handlowcy', label: t.admin.navSalespeople, icon: '👥' },
    { href: '/admin/klienci', label: t.admin.navClients, icon: '🏢' },
    { href: '/admin/kontakty', label: t.admin.navContacts, icon: '📇' },
    { href: '/admin/oferty', label: t.admin.navOffers, icon: '📋' },
    { href: '/admin/ustawienia', label: t.admin.navSettings, icon: '⚙️' },
  ];

  return (
    <div
      className="min-h-screen p-7 font-sans"
      style={{
        ...(cssVars as React.CSSProperties),
        background: 'var(--bg)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 mb-7 pb-5 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center font-mono font-semibold text-[13px] text-white bg-gradient-to-br from-[#3b8ef5] to-[#e8a020]">
          SSC
        </div>
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold tracking-wide text-[var(--text-primary)] truncate">
            {t.admin.panelTitle}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5 truncate">
            {t.admin.subtitle} · {t.common.version}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <LanguageSelector />

          <button
            onClick={() => setIsDark(!isDark)}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] flex items-center gap-1.5 hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors"
          >
            <span className="text-sm">{isDark ? '☀️' : '🌙'}</span>
            <span className="hidden sm:inline">{isDark ? t.header.light : t.header.dark}</span>
          </button>
          <button
            onClick={() => setHighContrast(!highContrast)}
            className={`rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono flex items-center gap-1.5 border-2 transition-colors ${
              highContrast
                ? 'bg-[rgba(59,142,245,0.15)] text-[var(--accent-cr)] border-[var(--accent-cr)]'
                : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span className="text-sm">🔲</span>
            <span className="hidden sm:inline">{highContrast ? t.header.highContrastOn : t.header.highContrastOff}</span>
          </button>
          <button
            onClick={() => router.push('/calculator')}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5"
          >
            <span>🧮</span>
            <span className="hidden sm:inline">{t.navigation.calculator}</span>
          </button>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.href = '/';
            }}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] hover:border-[var(--accent-sum)] hover:text-[var(--accent-sum)] transition-colors flex items-center gap-1.5"
          >
            <span>🚪</span>
            <span className="hidden sm:inline">{t.common.logout}</span>
          </button>
        </div>
      </header>

      {/* Admin sub-navigation */}
      <nav className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              title={tab.label}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg font-medium text-sm transition-all border
                ${
                  isActive
                    ? 'bg-[rgba(59,142,245,0.12)] border-[#3b8ef5] text-[#3b8ef5]'
                    : `border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.03)]
                       ${!isDark ? 'hover:bg-[rgba(0,0,0,0.03)]' : ''}`
                }`}
            >
              <span className="text-base">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
