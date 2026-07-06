'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

interface NavigationProps {
  isDark: boolean;
}

export default function Navigation({ isDark }: NavigationProps) {
  const pathname = usePathname();
  const { t } = useLanguage();

  const tabs = [
    { href: '/calculator', label: t.navigation?.calculator || 'Kalkulator', icon: '🧮' },
    { href: '/offers', label: t.navigation?.myOffers || 'Moje Oferty', icon: '📋' },
  ];

  return (
    <nav className="flex gap-2 mb-6">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all border
              ${isActive
                ? 'bg-[rgba(59,142,245,0.12)] border-[#3b8ef5] text-[#3b8ef5]'
                : `border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.03)]
                   ${!isDark ? 'hover:bg-[rgba(0,0,0,0.03)]' : ''}`
              }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}    </nav>
  );
}
