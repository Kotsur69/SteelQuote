'use client';

// The floating entry point: a bubble bottom-right on every signed-in page and the side panel it
// opens (420 px on desktop, full screen on a phone). Hidden on the login page, on the full
// assistant page (which shows the same chat inline) and in print / PDF preview.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Maximize2, MessageSquareText, Plus, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { AssistantChat } from './AssistantChat';
import { useAssistant } from './AssistantProvider';
import { panelLang, STRINGS } from './strings';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const ICON_BUTTON =
  'flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-txt-secondary transition-colors duration-150 hover:bg-[var(--accent-tint-strong)] hover:text-txt-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

export function AssistantShell() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const strings = STRINGS[panelLang(language)];
  const { open, setOpen, newChat, messages } = useAssistant();
  const panelRef = useRef<HTMLElement>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [available, setAvailable] = useState(false);

  // The bubble exists only where the assistant does (feature switch, migration, per-user
  // switch). Asked again after sign-in: the login page answers 401, the next page does not.
  const signedOut = pathname === '/';
  useEffect(() => {
    if (signedOut || available) return;
    const controller = new AbortController();
    fetch('/api/assistant/chat', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { available?: boolean } | null) => setAvailable(data?.available === true))
      .catch(() => undefined);
    return () => controller.abort();
  }, [signedOut, available]);

  // Escape closes; Tab stays inside the panel while it is open on a phone (where it covers the
  // page). On desktop the panel sits beside the page, which stays usable, so focus is not trapped.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      const panel = panelRef.current;
      if (event.key !== 'Tab' || !panel || window.matchMedia('(min-width: 640px)').matches) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  // Closing hands focus back to the bubble that opened the panel.
  useEffect(() => {
    if (wasOpen.current && !open) bubbleRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (signedOut || !available || pathname.startsWith('/asystent')) return null;

  return (
    <div className="print:hidden">
      {!open && (
        <button
          ref={bubbleRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={strings.open}
          aria-haspopup="dialog"
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full text-white shadow-lg transition-transform duration-200 ease-out hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          style={{ background: 'var(--am-gradient)' }}
        >
          <MessageSquareText aria-hidden className="h-6 w-6" />
          {messages.length > 0 && <span aria-hidden className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#F58847]" />}
        </button>
      )}

      {open && (
        <aside
          ref={panelRef}
          role="dialog"
          aria-label={strings.title}
          className="fixed inset-0 z-50 flex flex-col bg-white shadow-2xl dark:bg-[#1a171d] sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(680px,calc(100dvh-2.5rem))] sm:w-[420px] sm:overflow-hidden sm:rounded-xl sm:border sm:border-brd-hi"
        >
          <div aria-hidden className="h-1 shrink-0" style={{ background: 'var(--am-gradient)' }} />
          <header className="flex shrink-0 items-center justify-between border-b border-brd py-1 pl-4 pr-1">
            <h2 className="m-0 text-sm font-semibold tracking-wide text-txt-primary">{strings.title}</h2>
            <div className="flex items-center">
              <button type="button" onClick={newChat} aria-label={strings.newChat} title={strings.newChat} disabled={messages.length === 0} className={`${ICON_BUTTON} disabled:cursor-default disabled:opacity-40`}>
                <Plus aria-hidden className="h-4 w-4" />
              </button>
              <Link href="/asystent" onClick={() => setOpen(false)} aria-label={strings.expand} title={strings.expand} className={ICON_BUTTON}>
                <Maximize2 aria-hidden className="h-4 w-4" />
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label={strings.close} title={strings.close} className={ICON_BUTTON}>
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
          </header>
          <AssistantChat autoFocus />
        </aside>
      )}
    </div>
  );
}
