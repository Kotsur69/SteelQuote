'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUnsavedGuard } from '@/lib/unsavedGuard';

interface NavigationProps {
  isDark: boolean;
  highContrast?: boolean;
}

interface NavUser {
  email: string;
  fullName: string | null;
  role: string;
}

export default function Navigation({ isDark, highContrast }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { run, newOfferAction } = useUnsavedGuard();
  const [user, setUser] = useState<NavUser | null>(null);
  const role = user?.role ?? null;

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  const tabs = [
    { href: '/calculator', label: t.navigation?.calculator || 'Kalkulator', icon: '🧮' },
    { href: '/offers', label: t.navigation?.myOffers || 'Moje Oferty', icon: '📋' },
    // Analytics is available to every role - junior and senior see their own book, admin the
    // whole company. The scope is decided server-side; see lib/analyticsQuery.ts.
    { href: '/analytics', label: t.analytics?.navAnalytics || 'Analiza', icon: '📊' },
    // Panel seniora tylko dla roli 'senior'.
    ...(role === 'senior'
      ? [{ href: '/senior', label: t.navigation?.panelSenior || 'Panel Seniora', icon: '🔍' }]
      : []),
    // Panel admina tylko dla roli 'admin'.
    ...(role === 'admin'
      ? [{ href: '/admin', label: t.navigation?.panelAdmin || 'Panel Admina', icon: '⚙️' }]
      : []),
  ];

  // Every tab click goes through the unsaved-changes guard. Clicking "Kalkulator" while it
  // is already the current route is normally a no-op, but when a reset action is registered
  // (i.e. the calculator is mounted) it must behave exactly like the "New offer" button:
  // run the guard, then reset to a clean offer.
  const handleNavClick = (e: React.MouseEvent, href: string) => {
    const isCalculatorReset = href === '/calculator' && newOfferAction !== null;
    if (!isCalculatorReset && href === pathname) return;
    e.preventDefault();
    if (isCalculatorReset && newOfferAction) {
      run(newOfferAction);
    } else {
      run(() => router.push(href));
    }
  };

  return (
    <nav className="flex flex-wrap items-center gap-2 mb-6">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onClick={(e) => handleNavClick(e, tab.href)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all border
              ${isActive
                ? 'bg-[rgba(59,142,245,0.12)] border-[#3b8ef5] text-[#3b8ef5]'
                : `border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.03)]
                   ${highContrast ? (isDark ? 'hover:bg-[rgba(255,255,255,0.12)]' : 'hover:bg-[rgba(0,0,0,0.12)]') : !isDark ? 'hover:bg-[rgba(0,0,0,0.03)]' : ''}`
              }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}

      {/* Prawy blok: „Nowa oferta" (tylko na kalkulatorze) + zalogowany użytkownik. */}
      <div className="ml-auto flex items-center gap-2">
        {newOfferAction && (
          <button
            type="button"
            onClick={() => run(newOfferAction)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm border border-[#1f8f4e] text-[#1f8f4e] transition-colors hover:bg-[rgba(31,143,78,0.12)]"
          >
            <span className="text-base leading-none">＋</span>
            <span>{t.unsavedGuard?.newOffer || 'Nowa oferta'}</span>
          </button>
        )}
        {user && (
          <div
            className="flex items-center gap-2 px-3 font-mono text-xs text-[var(--text-secondary)]"
            title={user.role}
          >
            <span className="text-sm">👤</span>
            <span className="hidden sm:inline">
              {user.fullName ? `${user.fullName} · ` : ''}{user.email}
            </span>
            <span className="sm:hidden">{user.email}</span>
          </div>
        )}
      </div>
    </nav>
  );
}
