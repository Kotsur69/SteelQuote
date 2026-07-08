'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage, LanguageSelector } from '@/contexts/LanguageContext';
import Navigation from '@/components/Navigation';
import { ClientInfo } from '@/lib/pdfGenerator';
import { downloadServerPdf } from '@/lib/serverPdf';
import { useDarkMode } from '@/lib/useDarkMode';

type OfferStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'sent';
type FilterTab = 'pending' | 'reviewed' | 'all';

interface Offer {
  id: number;
  offer_name: string;
  offer_data: {
    currentType?: string;
    zestawienie?: Array<{
      id: number;
      type: string;
      grade: string;
      thickness: number;
      width: number;
      length: number;
      sumaHuta: number;
      sumaSSC: number;
      marza: number;
      finalPrice: number;
      tons: number;
      totalValue: number;
      pgl: number;
    }>;
    clientInfo?: ClientInfo;
  };
  status: OfferStatus;
  user_id: number | null;
  owner_name?: string | null;
  owner_email?: string | null;
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export default function SeniorPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [isDark, setIsDark] = useDarkMode();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('pending');
  const [role, setRole] = useState<string | null>(null);

  // Reject modal state
  const [rejectModalOfferId, setRejectModalOfferId] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectError, setRejectError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchOffers();
  }, []);

  useEffect(() => {
    if (rejectModalOfferId !== null && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [rejectModalOfferId]);

  const fetchOffers = async () => {
    try {
      const res = await fetch('/api/senior/offers');
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers);
        setRole(data.role);
      } else if (res.status === 403) {
        router.replace('/calculator');
      }
    } catch (error) {
      console.error('Error fetching senior offers:', error);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const handleApprove = async (offerId: number) => {
    if (!confirm(t.workflow.confirmApprove)) return;
    setActionLoading(offerId);
    try {
      const res = await fetch(`/api/offers/${offerId}/approve`, { method: 'POST' });
      if (res.ok) {
        showMessage('success', t.senior.offerApproved);
        fetchOffers();
      } else {
        const data = await res.json().catch(() => ({}));
        showMessage('error', data.error || t.workflow.actionFailed);
      }
    } catch {
      showMessage('error', t.workflow.actionFailed);
    } finally {
      setActionLoading(null);
    }
  };

  const openRejectModal = (offerId: number) => {
    setRejectModalOfferId(offerId);
    setRejectComment('');
    setRejectError('');
  };

  const closeRejectModal = () => {
    setRejectModalOfferId(null);
    setRejectComment('');
    setRejectError('');
  };

  const handleRejectSubmit = async () => {
    if (!rejectComment.trim()) {
      setRejectError(t.senior.rejectCommentRequired);
      return;
    }
    if (rejectModalOfferId === null) return;

    setActionLoading(rejectModalOfferId);
    try {
      const res = await fetch(`/api/offers/${rejectModalOfferId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectComment.trim() }),
      });
      if (res.ok) {
        showMessage('success', t.senior.offerRejected);
        closeRejectModal();
        fetchOffers();
      } else {
        const data = await res.json().catch(() => ({}));
        showMessage('error', data.error || t.workflow.actionFailed);
      }
    } catch {
      showMessage('error', t.workflow.actionFailed);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEdit = (offerId: number) => {
    router.push(`/calculator?edit=${offerId}`);
  };

  const handleExportPDF = async (offer: Offer) => {
    const emptyClientInfo: ClientInfo = {
      firstName: '', lastName: '', company: '', address: '', nip: '', phone: '', email: '',
    };
    showMessage('success', 'Generuję PDF...');
    try {
      await downloadServerPdf({
        offerName: offer.offer_name,
        offerId: offer.id,
        clientInfo: offer.offer_data.clientInfo || emptyClientInfo,
        zestawienie: offer.offer_data.zestawienie || [],
        createdAt: offer.created_at,
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      showMessage('error', (error as Error).message || 'Błąd generowania PDF');
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('pl-PL', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });

  const calculateOfferTotal = (offer: Offer) =>
    (offer.offer_data.zestawienie || []).reduce((s, i) => s + i.totalValue, 0);

  const getOfferItemCount = (offer: Offer) =>
    offer.offer_data.zestawienie?.length || 0;

  const statusBadgeClass = (status: OfferStatus): string => {
    switch (status) {
      case 'pending_review':
        return 'border-[var(--accent-hrs)] text-[var(--accent-hrs)] bg-[rgba(232,160,32,0.12)]';
      case 'approved':
        return 'border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.12)]';
      case 'rejected':
        return 'border-[var(--accent-sum)] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.12)]';
      case 'sent':
        return 'border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.12)]';
      default:
        return 'border-[var(--border-hi)] text-[var(--text-secondary)] bg-[rgba(125,136,170,0.10)]';
    }
  };

  // Filter offers by tab
  const filteredOffers = offers.filter((o) => {
    if (activeTab === 'pending') return o.status === 'pending_review';
    if (activeTab === 'reviewed') return o.status === 'approved' || o.status === 'rejected';
    return true;
  });

  const pendingCount = offers.filter((o) => o.status === 'pending_review').length;

  const cssVars = isDark
    ? {
        '--bg': '#0f1117', '--bg-panel': '#181c26', '--bg-card': '#1e2333',
        '--bg-input': '#141720', '--border': '#2a3048', '--border-hi': '#3d4a70',
        '--text-primary': '#e8ecf5', '--text-secondary': '#7b88aa', '--text-muted': '#4a536b',
        '--text-value': '#c8d4f0', '--accent-hrs': '#e8a020', '--accent-cr': '#3b8ef5',
        '--accent-hdg': '#2ecc71', '--accent-sum': '#f5475a',
      }
    : {
        '--bg': '#eef0f6', '--bg-panel': '#e2e6f0', '--bg-card': '#ffffff',
        '--bg-input': '#f4f5fa', '--border': '#b8c0d8', '--border-hi': '#7e90c0',
        '--text-primary': '#0d1220', '--text-secondary': '#2e3a5c', '--text-muted': '#6b789a',
        '--text-value': '#141e3a', '--accent-hrs': '#e8a020', '--accent-cr': '#3b8ef5',
        '--accent-hdg': '#2ecc71', '--accent-sum': '#f5475a',
      };

  return (
    <div
      className="min-h-screen p-7 font-sans"
      style={{ ...(cssVars as React.CSSProperties), background: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      {/* Header */}
      <header className="flex items-center gap-4 mb-7 pb-5 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center font-mono font-semibold text-[13px] text-white bg-gradient-to-br from-[#3b8ef5] to-[#e8a020]">
          SSC
        </div>
        <div>
          <h1 className="text-[17px] font-semibold tracking-wide text-[var(--text-primary)]">
            {t.senior.panelTitle}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
            {t.senior.subtitle} · {t.common.version}
          </p>
        </div>
        <LanguageSelector className="ml-auto" />
        <button
          onClick={() => setIsDark(!isDark)}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] flex items-center gap-1.5 hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors"
        >
          <span className="text-sm">{isDark ? '☀️' : '🌙'}</span>
          <span>{isDark ? t.header.light : t.header.dark}</span>
        </button>
        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/';
          }}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] hover:border-[var(--accent-sum)] hover:text-[var(--accent-sum)] transition-colors"
        >
          {t.common.logout}
        </button>
      </header>

      {/* Navigation */}
      <Navigation isDark={isDark} />

      {/* Message Toast */}
      {message && (
        <div
          className={`fixed top-4 right-4 px-4 py-3 rounded-lg border shadow-lg z-50 animate-[fadeIn_0.2s_ease] ${
            message.type === 'success'
              ? 'bg-[rgba(46,204,113,0.15)] border-[#2ecc71] text-[#2ecc71]'
              : 'bg-[rgba(245,71,90,0.15)] border-[#f5475a] text-[#f5475a]'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-5">
        {(['pending', 'reviewed', 'all'] as FilterTab[]).map((tab) => {
          const label =
            tab === 'pending'
              ? `${t.senior.pendingOnly} (${pendingCount})`
              : tab === 'reviewed'
                ? t.senior.reviewedByMe
                : t.senior.allOffers;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                activeTab === tab
                  ? 'bg-[rgba(59,142,245,0.12)] border-[#3b8ef5] text-[#3b8ef5]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Offers List */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-hrs)]" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
            {t.senior.pendingOffers}
          </h2>
          <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">
            {filteredOffers.length} {t.offers.items}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[var(--text-secondary)]">{t.common.loading}</div>
        ) : filteredOffers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[var(--text-secondary)] text-sm">{t.senior.noOffersPending}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filteredOffers.map((offer) => (
              <div
                key={offer.id}
                className={`p-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors ${
                  !isDark ? 'hover:bg-[rgba(0,0,0,0.02)]' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Offer name + status badge */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-medium text-[var(--text-primary)] truncate">
                        {offer.offer_name}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider border ${statusBadgeClass(
                          offer.status
                        )}`}
                      >
                        {t.offerStatus[offer.status]}
                      </span>
                    </div>

                    {/* Author */}
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)] font-mono">
                      👤 {t.senior.author}: {offer.owner_name || offer.owner_email || '—'}
                    </p>

                    {/* Rejection reason */}
                    {offer.status === 'rejected' && offer.rejection_reason && (
                      <p className="mt-1.5 text-[11px] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.08)] border border-[var(--accent-sum)] rounded px-2 py-1">
                        ✖ {t.workflow.rejectionReason}: {offer.rejection_reason}
                      </p>
                    )}

                    {/* Reviewed info */}
                    {offer.reviewed_at && offer.reviewer_name && (
                      <p className="mt-1 text-[11px] text-[var(--text-muted)] font-mono">
                        ✔ {t.workflow.reviewedBy}: {offer.reviewer_name} · {formatDate(offer.reviewed_at)}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-[var(--text-secondary)]">
                      <span>📅 {t.offers.createdAt}: {formatDate(offer.created_at)}</span>
                      <span>📦 {getOfferItemCount(offer)} {t.offers.items}</span>
                      <span className="font-mono text-[var(--accent-hrs)]">
                        💰 {calculateOfferTotal(offer).toFixed(2)} €
                      </span>
                    </div>

                    {/* Items preview */}
                    {offer.offer_data.zestawienie && offer.offer_data.zestawienie.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {offer.offer_data.zestawienie.slice(0, 3).map((item, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-1 rounded text-[10px] font-mono border ${
                              item.type === 'HRS'
                                ? 'border-[var(--accent-hrs)] text-[var(--accent-hrs)] bg-[rgba(232,160,32,0.08)]'
                                : item.type === 'CR'
                                  ? 'border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)]'
                                  : 'border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.08)]'
                            }`}
                          >
                            {item.type} {item.thickness}×{item.width}×{item.length} {item.grade}
                          </span>
                        ))}
                        {offer.offer_data.zestawienie.length > 3 && (
                          <span className="px-2 py-1 rounded text-[10px] font-mono text-[var(--text-muted)]">
                            +{offer.offer_data.zestawienie.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                    {/* PDF */}
                    <button
                      onClick={() => handleExportPDF(offer)}
                      disabled={!offer.offer_data.zestawienie || offer.offer_data.zestawienie.length === 0}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-[#2ecc71] text-[#2ecc71] bg-[rgba(46,204,113,0.08)] hover:bg-[rgba(46,204,113,0.15)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      📄 PDF
                    </button>

                    {/* Edit in calculator — only for pending_review */}
                    {offer.status === 'pending_review' && (
                      <button
                        onClick={() => handleEdit(offer.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)] hover:bg-[rgba(59,142,245,0.15)] transition-colors"
                      >
                        ✏️ {t.senior.editInCalculator}
                      </button>
                    )}

                    {/* Approve */}
                    {offer.status === 'pending_review' && (
                      <button
                        onClick={() => handleApprove(offer.id)}
                        disabled={actionLoading === offer.id}
                        className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.08)] hover:bg-[rgba(46,204,113,0.15)] transition-colors disabled:opacity-50"
                      >
                        ✔️ {t.workflow.approve}
                      </button>
                    )}

                    {/* Reject */}
                    {offer.status === 'pending_review' && (
                      <button
                        onClick={() => openRejectModal(offer.id)}
                        disabled={actionLoading === offer.id}
                        className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-sum)] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.08)] hover:bg-[rgba(245,71,90,0.15)] transition-colors disabled:opacity-50"
                      >
                        ✖️ {t.workflow.reject}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalOfferId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="w-full max-w-md rounded-lg border shadow-2xl p-6"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">
              {t.senior.rejectModalTitle}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              {offers.find((o) => o.id === rejectModalOfferId)?.offer_name}
            </p>

            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              {t.senior.rejectCommentLabel}
            </label>
            <textarea
              ref={textareaRef}
              value={rejectComment}
              onChange={(e) => {
                setRejectComment(e.target.value);
                setRejectError('');
              }}
              placeholder={t.senior.rejectCommentPlaceholder}
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1"
              style={{
                background: 'var(--bg-input)',
                borderColor: rejectError ? 'var(--accent-sum)' : 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            {rejectError && (
              <p className="text-[11px] text-[var(--accent-sum)] mt-1">{rejectError}</p>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={closeRejectModal}
                className="px-4 py-2 text-xs font-medium rounded border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={actionLoading !== null}
                className="px-4 py-2 text-xs font-medium rounded border border-[var(--accent-sum)] text-white bg-[var(--accent-sum)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {t.senior.confirmReject}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-8 pt-5 border-t border-[var(--border)] text-center">
        <p className="text-[10px] text-[var(--text-muted)] font-mono">
          © 2025 · Steel Surcharge Calculator · {t.common.version}
        </p>
      </footer>
    </div>
  );
}
