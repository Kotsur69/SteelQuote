'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUnsavedGuard } from '@/lib/unsavedGuard';
import { useAccess } from '@/lib/useAccess';
import { useAccessT } from '@/lib/i18n/access';

interface NavigationProps {
  isDark: boolean;
  // Kept for call-site compatibility; high contrast no longer changes nav colours,
  // only typography/borders via the global .hc rules.
  highContrast?: boolean;
}

export default function Navigation({ isDark }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { run, newOfferAction } = useUnsavedGuard();
  const at = useAccessT();
  const { access, switchFlow } = useAccess();
  const [switching, setSwitching] = useState(false);

  // Reviewers get a Dashboard tab first, so their review home is one click away right after
  // login: the superuser lands on the admin panel, anyone who may approve in some flow on the
  // validation queue. Derived from the flow/role configuration, never from a role name.
  const dashboardHref = access?.isSuperuser ? '/admin' : access?.isApprover ? '/senior' : null;

  // New offers are created in the active flow; switching reloads the page so every list and
  // the calculator pick up the new context and permissions.
  const handleFlowChange = async (flowId: number) => {
    setSwitching(true);
    const ok = await switchFlow(flowId);
    setSwitching(false);
    if (ok) window.location.reload();
  };
  const activeRoleLabel = access?.isSuperuser ? at.superuser : access?.activeRoleName ?? at.noFlow;

  const tabs = [
    ...(dashboardHref
      ? [{ href: dashboardHref, label: t.admin?.navDashboard || 'Dashboard', icon: '🏠' }]
      : []),
    { href: '/calculator', label: t.navigation?.calculator || 'Kalkulator', icon: '🧮' },
    { href: '/offers', label: t.navigation?.myOffers || 'Moje Oferty', icon: '📋' },
    // Analytics is available to every role - junior and senior see their own book, admin the
    // whole company. The scope is decided server-side; see lib/analyticsQuery.ts.
    { href: '/analytics', label: t.analytics?.navAnalytics || 'Analiza', icon: '📊' },
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
            title={tab.label}
            onClick={(e) => handleNavClick(e, tab.href)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg font-medium text-sm transition-all border
              ${isActive
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

      {/* Prawy blok: „Nowa oferta" (tylko na kalkulatorze) + zalogowany użytkownik. */}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {newOfferAction && (
          <button
            type="button"
            title={t.unsavedGuard?.newOffer || 'Nowa oferta'}
            onClick={() => run(newOfferAction)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium text-sm border border-[#1f8f4e] text-[#1f8f4e] transition-colors hover:bg-[rgba(31,143,78,0.12)]"
          >
            <span className="text-base leading-none">＋</span>
            <span className="hidden sm:inline">{t.unsavedGuard?.newOffer || 'Nowa oferta'}</span>
          </button>
        )}
        {access && access.flows.length > 1 && (
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="hidden sm:inline">{at.activeFlow}</span>
            <select
              aria-label={at.switchFlow}
              value={access.activeFlowId ?? ''}
              disabled={switching}
              onChange={(e) => run(() => void handleFlowChange(Number(e.target.value)))}
              className="min-h-[40px] bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-cr)] disabled:opacity-50"
            >
              {access.flows.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
        )}
        {access && (
          <div
            className="flex items-center gap-2 px-3 font-mono text-xs text-[var(--text-secondary)]"
            title={activeRoleLabel}
          >
            <span className="text-sm">👤</span>
            <span className="hidden sm:inline">
              {access.fullName ? `${access.fullName} · ` : ''}{access.email}
            </span>
            <span className="sm:hidden">{access.email}</span>
            <span className="px-1.5 py-0.5 rounded border border-[var(--border)] text-[10px]">
              {access.activeLevelCode ? `${activeRoleLabel} · ${access.activeLevelCode}` : activeRoleLabel}
            </span>
          </div>
        )}
      </div>
    </nav>
  );
}
