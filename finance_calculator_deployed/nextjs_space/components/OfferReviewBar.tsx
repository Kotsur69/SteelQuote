'use client';

import { useState } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { reviewStrings } from '@/lib/reviewMessages';
import ReviewIssuesNotice from '@/components/ReviewIssuesNotice';
import type { ReviewableItem } from '@/lib/offerReview';

interface Props {
  offerId: number;
  // Unsaved edits: approve/reject act on the SAVED row, so they are blocked until saved.
  isDirty: boolean;
  items: ReviewableItem[];
  onDone: () => void;
}

// Approve / reject controls shown in the calculator when a senior or admin opened an offer
// that is pending review, plus the list of positions below the price guidelines.
export default function OfferReviewBar({ offerId, isDirty, items, onDone }: Props) {
  const { language } = useLanguage();
  const { settings } = useCurrency();
  const s = reviewStrings(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  const post = async (action: 'approve' | 'reject', body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/offers/${offerId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === 'string' ? data.error : s.actionFailed);
        return;
      }
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
      </div>
      {error && !showReject && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--accent-sum)]">{error}</p>
      )}
      <ReviewIssuesNotice items={items} settings={settings} language={language} />

      {showReject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onKeyDown={(e) => { if (e.key === 'Escape' && !busy) closeReject(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-dialog-title"
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl"
          >
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
          </div>
        </div>
      )}
    </section>
  );
}
