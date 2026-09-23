'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

// Android-only "install this app" banner, shown on the login screen before
// the user authenticates. It relies entirely on Chrome's beforeinstallprompt
// event: if that event never fires (criteria not met, already installed,
// or a non-Chromium/non-Android browser), the banner simply never renders.
//
// Not shown: iOS Safari (no beforeinstallprompt support), desktop browsers,
// or once the app is already running as an installed PWA.

const DISMISS_STORAGE_KEY = 'pwaInstallDismissedAt';
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

function isRecentlyDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return daysSince < DISMISS_DAYS;
}

export default function PwaInstallBanner() {
  const { t } = useLanguage();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isAndroid() || isStandalone() || isRecentlyDismissed()) return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Installability just won't be met without it; no user-facing fallback needed.
      });
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  if (!installEvent || dismissed) return null;

  const handleInstall = async () => {
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 flex items-center gap-3 px-4 py-3 bg-[#1e2333] border-t border-[#2a3048] shadow-[0_-4px_16px_rgba(0,0,0,0.3)]">
      <div className="w-9 h-9 shrink-0 bg-gradient-to-br from-[#3b8ef5] to-[#e8a020] rounded-lg flex items-center justify-center">
        <span className="text-white font-mono font-bold text-[10px]">SSC</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#e8ecf5] truncate">{t.pwaInstall.title}</p>
        <p className="text-xs text-[#7b88aa] truncate">{t.pwaInstall.description}</p>
      </div>
      <button
        onClick={handleDismiss}
        className="px-3 py-1.5 text-xs text-[#7b88aa] hover:text-[#e8ecf5] transition-colors"
      >
        {t.pwaInstall.dismiss}
      </button>
      <button
        onClick={handleInstall}
        className="px-4 py-1.5 bg-gradient-to-r from-[#e8a020] to-[#f0c040] text-[#0d1220] font-mono font-bold text-xs tracking-wider rounded hover:opacity-90 transition-opacity shrink-0"
      >
        {t.pwaInstall.install}
      </button>
    </div>
  );
}
