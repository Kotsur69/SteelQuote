'use client';

// Global guard against losing unsaved calculator work.
//
// The calculator registers three things with this provider:
//   - setDirty(bool)          — does its current state differ from the loaded baseline
//   - setSaver(fn)            — how to persist the current offer (resolves true on success)
//   - setNewOfferAction(fn)   — the "start a clean offer" reset; null on every non-calculator page
//
// Any navigation that could drop unsaved work (the nav tabs, the "New offer" button)
// calls `run(proceed)`. When nothing is dirty `proceed` fires immediately; otherwise a
// single shared modal asks the seller to save, discard, or cancel.
//
// Tab close / refresh is handled separately by a native `beforeunload` listener inside
// the calculator — the browser owns that dialog and its text.

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

type ProceedFn = () => void | Promise<void>;
type SaverFn = () => Promise<boolean>;

interface UnsavedGuardValue {
  /** Run `proceed` now when clean, otherwise open the confirmation modal and defer it. */
  run: (proceed: ProceedFn) => void;
  /** Calculator reports whether its state currently differs from the loaded baseline. */
  setDirty: (dirty: boolean) => void;
  /** Calculator registers how to persist the current offer (true on success). */
  setSaver: (saver: SaverFn | null) => void;
  /** Calculator registers the clean-slate reset; null while no calculator is mounted. */
  setNewOfferAction: (action: ProceedFn | null) => void;
  /** Non-null only while the calculator is mounted — drives the nav-bar "New offer" button. */
  newOfferAction: ProceedFn | null;
}

const UnsavedGuardContext = createContext<UnsavedGuardValue | null>(null);

export function useUnsavedGuard(): UnsavedGuardValue {
  const ctx = useContext(UnsavedGuardContext);
  if (!ctx) {
    throw new Error('useUnsavedGuard must be used inside <UnsavedGuardProvider>');
  }
  return ctx;
}

export function UnsavedGuardProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();

  // Dirty flag and saver live in refs: they are read inside event handlers, never
  // rendered, so writing them must not trigger a re-render of the whole app subtree.
  const dirtyRef = useRef(false);
  const saverRef = useRef<SaverFn | null>(null);

  // The reset action IS rendered (the nav-bar button appears/disappears with it), so it
  // stays in state. It flips at most twice per calculator visit (mount + unmount).
  const [newOfferAction, setNewOfferActionState] = useState<ProceedFn | null>(null);

  // Pending navigation captured while the modal is open. Wrapped in an object so React
  // never mistakes a stored function for a functional state updater.
  const [pending, setPending] = useState<{ proceed: ProceedFn } | null>(null);
  const [busy, setBusy] = useState(false);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const setSaver = useCallback((saver: SaverFn | null) => {
    saverRef.current = saver;
  }, []);

  const setNewOfferAction = useCallback((action: ProceedFn | null) => {
    setNewOfferActionState(() => action);
  }, []);

  const run = useCallback((proceed: ProceedFn) => {
    if (!dirtyRef.current) {
      void proceed();
      return;
    }
    setPending({ proceed });
  }, []);

  const closeModal = useCallback(() => setPending(null), []);

  const handleDiscard = useCallback(() => {
    const proceed = pending?.proceed;
    dirtyRef.current = false;
    setPending(null);
    if (proceed) void proceed();
  }, [pending]);

  const handleSave = useCallback(async () => {
    const proceed = pending?.proceed;
    const saver = saverRef.current;
    if (!saver) {
      // No saver registered — do not trap the seller; fall back to discarding.
      handleDiscard();
      return;
    }
    setBusy(true);
    try {
      const ok = await saver();
      if (ok) {
        dirtyRef.current = false;
        setPending(null);
        if (proceed) void proceed();
      }
      // On failure the modal stays open; the calculator shows its own error toast.
    } finally {
      setBusy(false);
    }
  }, [pending, handleDiscard]);

  const g = t.unsavedGuard;
  const value: UnsavedGuardValue = { run, setDirty, setSaver, setNewOfferAction, newOfferAction };

  return (
    <UnsavedGuardContext.Provider value={value}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="w-[440px] max-w-[90vw] rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
              {g?.title ?? 'Niezapisane zmiany'}
            </h3>
            <p className="mb-5 text-sm leading-relaxed text-[var(--text-secondary)]">
              {g?.body ??
                'Bieżąca oferta ma zmiany, które nie zostały jeszcze zapisane. Jeśli teraz przejdziesz dalej, zostaną utracone.'}
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={busy}
                className="rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hi)] disabled:opacity-50"
              >
                {g?.cancel ?? 'Anuluj'}
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                disabled={busy}
                className="rounded border border-[#f5475a] px-4 py-2 text-sm font-medium text-[#f5475a] transition-colors hover:bg-[rgba(245,71,90,0.1)] disabled:opacity-50"
              >
                {g?.discard ?? 'Odrzuć zmiany'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="rounded bg-[#1f8f4e] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? (t.offers?.saving ?? '…') : (g?.save ?? 'Zapisz i kontynuuj')}
              </button>
            </div>
          </div>
        </div>
      )}
    </UnsavedGuardContext.Provider>
  );
}
