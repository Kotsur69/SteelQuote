'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { reviewStrings } from '@/lib/reviewMessages';
import ValidationNotice, { type ValidationSnapshot } from '@/components/ValidationNotice';
import ApprovalBadges from '@/components/ApprovalBadges';
import type { ApprovalState } from '@/lib/access/workflow';
import { accessErrorText, useAccessT } from '@/lib/i18n/access';
import Modal from '@/components/Modal';

interface Props {
  offerId: number;
  // Unsaved edits: approve/reject act on the SAVED row, so they are blocked until saved.
  isDirty: boolean;
  onDone: () => void;
}

// Approve / reject controls shown in the calculator when an offer waits for the caller's level
// (or one they stand in for), plus why it needs validation (the rule engine's snapshot) and
// whether the rules changed since it was submitted. Sending stays with the offer's creator.
export default function OfferReviewBar({ offerId, isDirty, onDone }: Props) {
  const { language } = useLanguage();
  const at = useAccessT();
  const s = reviewStrings(language);
  const [validation, setValidation] = useState<ValidationSnapshot | null>(null);
  const [approval, setApproval] = useState<ApprovalState | null>(null);
  const [standInLevels, setStandInLevels] = useState<string | null>(null);

  // The SAVED version is what gets approved, so its evaluation is what the bar explains;
  // refreshed whenever the calculator has no unsaved edits (e.g. right after a save).
  useEffect(() => {
    if (isDirty) return;
    const controller = new AbortController();
    // A failed refetch or another offer must not leave the previous offer's notes on screen.
    setValidation(null);
    setApproval(null);
    setStandInLevels(null);
    fetch(`/api/offers/${offerId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const offer = data?.offer;
        setValidation((offer?.validation as ValidationSnapshot | undefined) ?? null);
        setApproval((offer?.actions?.approval as ApprovalState | undefined) ?? null);
        const pending = Array.isArray(offer?.steps)
          ? (offer.steps as { status: string; levelCode: string }[]).filter((st) => st.status === 'pending').map((st) => st.levelCode)
          : [];
        setStandInLevels(offer?.actions?.reviewAsStandIn === true ? pending.join(' + ') : null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [offerId, isDirty]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  const call = async (action: 'approve' | 'reject', body?: unknown): Promise<Record<string, unknown> | null> => {
    const res = await fetch(`/api/offers/${offerId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Re-routed to a higher level: show the new requirement instead of the stale one.
      if (data.code === 'rerouted' && data.validation) setValidation(data.validation as ValidationSnapshot);
      setError(accessErrorText(at, data, s.actionFailed));
      return null;
    }
    return data;
  };

  const post = async (action: 'approve' | 'reject', body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      if (!(await call(action, body))) return;
      onDone();
    } catch (err) {
      console.error(`Error during ${action}:`, err);
      setError(s.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  const closeReject = () => {
    setShowReject(false);
    setError(null);
  };

  const submitReject = () => {
    if (reason.trim().length === 0) {
      setError(s.rejectReasonRequired);
      return;
    }
    post('reject', { reason: reason.trim() });
  };

  return (
    <section className="mb-5 rounded-lg border border-[var(--accent-cr)] bg-[rgba(59,142,245,0.06)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => { closeReject(); post('approve'); }}
          disabled={busy || isDirty}
          className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.08)] hover:bg-[rgba(46,204,113,0.15)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ✔️ {s.approve}
        </button>
        <button
          onClick={() => { setError(null); setShowReject(true); }}
          disabled={busy || isDirty}
          className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-sum)] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.08)] hover:bg-[rgba(245,71,90,0.15)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ✖️ {s.reject}
        </button>
        {isDirty && (
          <span className="text-[11px] font-mono text-[var(--text-secondary)]">{s.saveFirst}</span>
        )}
        <ApprovalBadges approval={approval} audience="reviewer" standInLevels={standInLevels} />
      </div>
      {error && !showReject && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--accent-sum)]">{error}</p>
      )}
      <ValidationNotice validation={validation} />

      {showReject && (
        <Modal titleId="reject-dialog-title" onClose={closeReject} canClose={!busy}>
          <>
            <h3 id="reject-dialog-title" className="mb-3 text-lg font-semibold text-[var(--text-primary)]">{s.rejectTitle}</h3>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label={s.rejectReasonPlaceholder}
              placeholder={s.rejectReasonPlaceholder}
              rows={4}
              autoFocus
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-cr)]"
            />
            {error && <p role="alert" className="mt-2 text-[11px] text-[var(--accent-sum)]">{error}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={closeReject}
                disabled={busy}
                className="px-4 py-2 text-sm rounded border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-50"
              >
                {s.cancel}
              </button>
              <button
                onClick={submitReject}
                disabled={busy}
                className="px-4 py-2 text-sm rounded bg-[var(--accent-sum)] text-white font-medium disabled:opacity-50"
              >
                {s.reject}
              </button>
            </div>
          </>
        </Modal>
      )}
    </section>
  );
}
