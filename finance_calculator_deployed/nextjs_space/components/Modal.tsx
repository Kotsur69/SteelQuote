'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  /** id of the element inside `children` that titles the dialog (aria-labelledby). */
  titleId: string;
  onClose: () => void;
  /** false while a request is in flight: Escape and backdrop clicks are ignored. */
  canClose?: boolean;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Accessible modal dialog. Rendered through a portal so no ancestor transform or stacking
// context can trap it, and it does the three things aria-modal alone does NOT do:
//  - keeps Tab / Shift+Tab inside the dialog (otherwise focus walks onto the page behind it),
//  - closes on Escape and on a click on the dark backdrop,
//  - puts focus back on the element that opened it when it closes.
// Mount it only while it should be open; unmounting is what closes it.
export default function Modal({ titleId, onClose, canClose = true, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);
  onCloseRef.current = onClose;
  canCloseRef.current = canClose;

  // The opener has to be read during the first render: an `autoFocus` child takes focus in the
  // commit phase, i.e. BEFORE any effect runs, so an effect would record the child itself.
  // Safe because the modal is only ever mounted on demand, in the browser.
  const openerRef = useRef<HTMLElement | null>(null);
  if (openerRef.current === null && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    const opener = openerRef.current;
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Respect an autoFocus inside the dialog; otherwise start on the first control.
    if (!dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (canCloseRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // A detached opener (list re-rendered, page navigated) cannot take focus; skip it.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && canCloseRef.current) onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
