'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUnsavedGuard } from '@/lib/unsavedGuard';
import { useAccess } from '@/lib/useAccess';

const SETTINGS_HREF = '/admin/ustawienia';

// Header shortcut to the admin settings page, rendered next to the language flags on every
// page so the admin reaches it in one click right after login. Superuser only — hidden for
// everyone else (the API still enforces access; this is just a convenience link).
export default function AdminSettingsShortcut() {
  const { t } = useLanguage();
  const { access } = useAccess();
  const { run } = useUnsavedGuard();
  const pathname = usePathname();
  const router = useRouter();

  if (!access?.isSuperuser) return null;

  const isActive = pathname === SETTINGS_HREF;
  const label = t.admin.navSettings;

  // Same unsaved-changes guard as the main navigation, so leaving the calculator never drops edits.
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isActive) return;
    run(() => router.push(SETTINGS_HREF));
  };

  return (
    <Link
      href={SETTINGS_HREF}
      onClick={handleClick}
      title={label}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className={`rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono flex items-center gap-1.5 border transition-colors ${
        isActive
          ? 'bg-[rgba(59,142,245,0.12)] border-[var(--accent-cr)] text-[var(--accent-cr)]'
          : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
      }`}
    >
      <span className="text-sm" aria-hidden="true">⚙️</span>
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
