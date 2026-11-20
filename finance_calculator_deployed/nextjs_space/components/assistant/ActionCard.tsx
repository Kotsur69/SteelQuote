'use client';

// Confirmation card of an assistant action (docs/ai-assistant-plan.md section 7). Shows exactly
// what will happen - every value is server-built - and executes ONLY on the user's click, through
// /api/assistant/actions/<token>/confirm (the shared offer service, with the user's own access).
// The outcome lives in AssistantProvider (by token), so a confirmed card stays confirmed when the
// panel closes; nothing about it is persisted (plan D9).

import { useEffect, useId, useRef } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, Clock, X } from 'lucide-react';
import type { ActionCardBlock } from '@/lib/assistant/blocks';
import { useAssistant, type CardOutcome } from './AssistantProvider';
import type { PanelLang, PanelStrings } from './strings';
import { DataTable } from './DataTable';

// Only actions that end something for the other side get the danger colour.
const DESTRUCTIVE = new Set<ActionCardBlock['kind']>(['reject']);
// setTimeout fires at once above this; the cards live minutes, so it is only a guard.
const MAX_TIMER_MS = 2_147_483_647;

/** Card links only ever open an offer in the calculator. */
const safeOfferHref = (href: unknown): string | null =>
  typeof href === 'string' && href.startsWith('/calculator?') && !href.includes('//') ? href : null;

/** A fresh query parameter, so an already open /calculator?edit=<id> loads the changed offer again. */
const withReload = (href: string): string => `${href}&r=${Date.now()}`;

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

type Props = {
  block: ActionCardBlock;
  strings: PanelStrings;
  lang: PanelLang;
};

export function ActionCard({ block, strings, lang }: Props) {
  const { cardOutcomes, setCardOutcome } = useAssistant();
  const titleId = useId();
  const statusRef = useRef<HTMLDivElement>(null);
  const actedRef = useRef(false);

  const expiresMs = Date.parse(block.expiresAt);
  const validExpiry = Number.isFinite(expiresMs);
  const stored = cardOutcomes[block.token];
  const outcome: CardOutcome = stored ?? (!validExpiry || expiresMs <= Date.now() ? { kind: 'expired' } : { kind: 'idle' });
  const set = (next: CardOutcome) => setCardOutcome(block.token, next);

  // The card turns itself off when the server would refuse it anyway.
  useEffect(() => {
    if (outcome.kind !== 'idle' || !validExpiry) return;
    const timer = setTimeout(() => setCardOutcome(block.token, { kind: 'expired' }), Math.min(MAX_TIMER_MS, Math.max(0, expiresMs - Date.now())));
    return () => clearTimeout(timer);
  }, [block.token, expiresMs, validExpiry, outcome.kind, setCardOutcome]);

  // After the user's own click the buttons disappear: keep keyboard focus on the result.
  useEffect(() => {
    if (actedRef.current && outcome.kind !== 'idle' && outcome.kind !== 'busy') {
      actedRef.current = false;
      statusRef.current?.focus();
    }
  }, [outcome.kind]);

  const post = async (action: 'confirm' | 'cancel') => {
    if (outcome.kind !== 'idle') return;
    actedRef.current = true;
    set({ kind: 'busy', action });
    try {
      const response = await fetch(`/api/assistant/actions/${encodeURIComponent(block.token)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: unknown; href?: unknown; error?: unknown; code?: unknown };
      if (!response.ok) {
        if (body.code === 'expired') return set({ kind: 'expired' });
        if (body.code === 'used') return set({ kind: 'used' });
        return set({ kind: 'failed', message: typeof body.error === 'string' ? body.error : strings.actionFailed });
      }
      if (action === 'cancel') return set({ kind: 'cancelled' });
      const href = safeOfferHref(body.href);
      set({ kind: 'done', message: typeof body.message === 'string' ? body.message : strings.actionDone, href: href ? withReload(href) : null });
    } catch {
      set({ kind: 'failed', message: strings.networkError });
    }
  };

  const busy = outcome.kind === 'busy';
  const open = outcome.kind === 'idle' || busy;
  const destructive = DESTRUCTIVE.has(block.kind);
  const offerHref = block.offer ? safeOfferHref(block.offer.href) : null;
  const until = validExpiry ? new Date(expiresMs).toLocaleTimeString(lang === 'pl' ? 'pl-PL' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <section aria-labelledby={titleId} className={`rounded-lg border bg-[var(--bg-input)] ${open ? 'border-brd-hi' : 'border-brd'}`}>
      <header className="flex items-start justify-between gap-3 border-b border-brd px-3.5 py-3">
        <div className="min-w-0">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-txt-muted">{strings.actionEyebrow}</p>
          <h3 id={titleId} className="m-0 mt-0.5 text-sm font-semibold text-txt-primary">{block.title}</h3>
          {block.offer && (offerHref ? (
            <Link href={offerHref} className={`mt-0.5 inline-flex min-h-[24px] items-center gap-1 rounded text-xs font-medium text-accent underline-offset-2 hover:underline ${FOCUS}`}>
              {block.offer.name}
              <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span className="mt-0.5 block text-xs text-txt-secondary">{block.offer.name}</span>
          ))}
        </div>
        {block.transition && (
          <p className="m-0 flex shrink-0 flex-wrap items-center justify-end gap-1 text-xs">
            <span className="rounded-full border border-brd px-2 py-0.5 text-txt-secondary">{block.transition.from}</span>
            <ArrowRight aria-hidden className="h-3.5 w-3.5 text-txt-muted" />
            <span className="sr-only"> {strings.becomes} </span>
            <span className="rounded-full border border-accent px-2 py-0.5 font-medium text-accent">{block.transition.to}</span>
          </p>
        )}
      </header>

      <div className="flex flex-col gap-3 px-3.5 py-3">
        {block.rows.length > 0 && (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {block.rows.map(([label, value], i) => (
              <div key={`${i}-${label}`} className="contents">
                <dt className="text-txt-muted">{label}</dt>
                <dd className="m-0 min-w-0 break-words text-right tabular-nums text-txt-value">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {block.table && <DataTable block={block.table} />}

        {block.notes.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 rounded-md bg-[var(--accent-tint)] p-2.5 text-xs leading-relaxed text-txt-secondary">
            {block.notes.map((note, i) => (
              <li key={`${i}-${note}`} className="flex gap-1.5">
                <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-brd px-3.5 py-3">
        {open && (
          <div className="flex flex-wrap items-center gap-2">
            {/* aria-disabled, not disabled: a disabled button drops keyboard focus mid-request. */}
            <button
              type="button"
              aria-disabled={busy}
              onClick={() => void post('confirm')}
              className={`min-h-[44px] cursor-pointer rounded-lg px-4 text-sm font-semibold transition-opacity duration-150 hover:opacity-90 aria-disabled:cursor-default aria-disabled:opacity-50 ${destructive ? 'bg-[var(--trend-down)] text-white dark:text-[#1a0508]' : 'text-white'} ${FOCUS}`}
              style={destructive ? undefined : { background: 'var(--am-gradient)' }}
            >
              {busy && outcome.action === 'confirm' ? strings.working : block.confirmLabel}
            </button>
            <button
              type="button"
              aria-disabled={busy}
              onClick={() => void post('cancel')}
              className={`min-h-[44px] cursor-pointer rounded-lg border border-brd-hi px-4 text-sm font-medium text-txt-secondary transition-colors duration-150 hover:text-txt-primary aria-disabled:cursor-default aria-disabled:opacity-50 ${FOCUS}`}
            >
              {strings.cancel}
            </button>
            {until && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-txt-muted">
                <Clock aria-hidden className="h-3.5 w-3.5" />
                {strings.validUntil(until)}
              </span>
            )}
          </div>
        )}
        <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="rounded text-sm focus:outline-none">
          {outcome.kind === 'done' && (
            <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--trend-up)]">
              <Check aria-hidden className="h-4 w-4 shrink-0" />
              <span className="font-medium">{outcome.message}</span>
              {outcome.href && (
                <Link href={outcome.href} className={`inline-flex min-h-[44px] items-center gap-1 rounded text-xs font-semibold text-accent underline-offset-2 hover:underline ${FOCUS}`}>
                  {strings.openResult}
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              )}
            </p>
          )}
          {outcome.kind === 'cancelled' && <Settled icon={X} text={strings.actionCancelled} />}
          {outcome.kind === 'used' && <Settled icon={Check} text={strings.actionUsed} />}
          {outcome.kind === 'expired' && <Settled icon={Clock} text={strings.actionExpired} />}
          {outcome.kind === 'failed' && (
            <p className="m-0 flex items-start gap-2 text-[var(--trend-down)]">
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              {outcome.message}
            </p>
          )}
        </div>
      </footer>
    </section>
  );
}

function Settled({ icon: Icon, text }: { icon: typeof Check; text: string }) {
  return (
    <p className="m-0 flex items-center gap-2 text-txt-muted">
      <Icon aria-hidden className="h-4 w-4" />
      {text}
    </p>
  );
}
