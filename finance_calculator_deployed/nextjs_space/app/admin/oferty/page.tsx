'use client';

import { Fragment, Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';
import { ClientInfo, normalizeClientInfo } from '@/lib/pdfGenerator';
import { downloadServerPdf } from '@/lib/serverPdf';
import { attachNotesToZestawienie } from '@/lib/itemNotes';
import type { ItemInputs } from '@/lib/calculatorData';
import { exportOfferToExcel } from '@/lib/excelExport';
import { useOfferSearch } from '@/lib/useOfferSearch';
import OfferSearchInput from '@/components/OfferSearchInput';
import { offerNumberLabel, groupOffersByVersion } from '@/lib/offerVersions';
import {
  formatOfferMoney,
  formatOfferMoneyCeil,
  offerTotalUnit,
  offerCurrency,
  offerRate,
  type Currency,
} from '@/lib/currency';

type OfferStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'sent';

interface AdminOffer {
  id: number;
  offer_name: string | null;
  display_name: string;
  // displayCurrency/eurPlnRate: waluta handlowca i kurs zamrożony przy zapisie oferty.
  // Starsze oferty ich nie mają -> EUR.
  offer_data: {
    zestawienie?: Array<{ totalValue: number }>;
    clientInfo?: ClientInfo;
    displayCurrency?: Currency;
    eurPlnRate?: number;
  };
  status: OfferStatus;
  user_id: number | null;
  owner_name: string | null;
  owner_email: string | null;
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  root_offer_id: number | null;
  version_number: number;
}

interface UserOption { id: number; email: string; full_name: string | null; }

const STATUSES: OfferStatus[] = ['draft', 'pending_review', 'approved', 'rejected', 'sent'];

function statusBadgeClass(status: OfferStatus): string {
  switch (status) {
    case 'pending_review': return 'border-[var(--accent-hrs)] text-[var(--accent-hrs)] bg-[rgba(232,160,32,0.12)]';
    case 'approved': return 'border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.12)]';
    case 'rejected': return 'border-[var(--accent-sum)] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.12)]';
    case 'sent': return 'border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.12)]';
    default: return 'border-[var(--border-hi)] text-[var(--text-secondary)] bg-[rgba(125,136,170,0.10)]';
  }
}

function AdminOffersContent() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [filters, setFilters] = useState({
    status: searchParams.get('status') || '',
    user_id: searchParams.get('user_id') || '',
    date_from: '',
    date_to: '',
    reviewed_by_me: false,
  });

  type QuickTab = 'pendingReview' | 'awaitingSend' | 'reviewedByMe' | 'all';
  const activeQuickTab: QuickTab =
    filters.reviewed_by_me
      ? 'reviewedByMe'
      : filters.status === 'pending_review'
        ? 'pendingReview'
        : filters.status === 'approved'
          ? 'awaitingSend'
          : 'all';

  const selectQuickTab = (tab: QuickTab) => {
    setFilters({
      status: tab === 'pendingReview' ? 'pending_review' : tab === 'awaitingSend' ? 'approved' : '',
      user_id: '',
      date_from: '',
      date_to: '',
      reviewed_by_me: tab === 'reviewedByMe',
    });
  };

  // Reject modal state (mirrors senior panel).
  const [rejectModalOfferId, setRejectModalOfferId] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectError, setRejectError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Której rodziny ofert (id najnowszej wersji) ma rozwiniętą historię poprzednich wersji.
  const [expandedVersionsKey, setExpandedVersionsKey] = useState<number | null>(null);

  // Szukanie po nazwie własnej, nazwie zastępczej ("offer_30") albo numerze oferty.
  // Filtruje baza (?q=) — ta sama fraza działa tak samo jak w /offers i /senior.
  const { search, setSearch, debouncedSearch, beginRequest } = useOfferSearch();

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const fetchOffers = async () => {
    setLoading(true);
    // Odpowiedź na starszą frazę nie może nadpisać nowszej — patrz useOfferSearch.
    const isCurrent = beginRequest();
    try {
      const qs = new URLSearchParams();
      if (filters.status) qs.set('status', filters.status);
      if (filters.user_id) qs.set('user_id', filters.user_id);
      if (filters.date_from) qs.set('date_from', filters.date_from);
      if (filters.date_to) qs.set('date_to', filters.date_to);
      if (filters.reviewed_by_me) qs.set('reviewed_by_me', '1');
      // Szukanie łączy się z filtrami przez AND — fraza zawęża to, co już wybrano.
      if (debouncedSearch) qs.set('q', debouncedSearch);
      const res = await fetch(`/api/admin/offers?${qs.toString()}`);
      if (!isCurrent()) return;
      if (res.ok) {
        const data = await res.json();
        if (!isCurrent()) return;
        setOffers(data.offers);
      } else {
        flash('error', t.admin.loadFailed);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  // Lista handlowców do filtra.
  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers(d.users || []));
  }, []);

  // Refetch przy zmianie filtrów albo frazy szukania.
  useEffect(() => { fetchOffers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters, debouncedSearch]);

  useEffect(() => {
    if (rejectModalOfferId !== null && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [rejectModalOfferId]);

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });

  const offerTotal = (o: AdminOffer) =>
    (o.offer_data.zestawienie || []).reduce((sum, it) => sum + it.totalValue, 0);

  // Grupowanie: najnowsza wersja każdej rodziny jako wiersz w tabeli, starsze (w tym
  // oryginał) pod rozwijanym "poprzednie wersje" — patrz lib/offerVersions.ts.
  const offerGroups = groupOffersByVersion(offers);

  const handleEdit = (offerId: number) => {
    router.push(`/calculator?edit=${offerId}`);
  };

  const handleApprove = async (offerId: number) => {
    if (!confirm(t.workflow.confirmApprove)) return;
    setActionLoading(offerId);
    try {
      const res = await fetch(`/api/offers/${offerId}/approve`, { method: 'POST' });
      if (res.ok) {
        flash('success', t.senior.offerApproved);
        fetchOffers();
      } else {
        const data = await res.json().catch(() => ({}));
        flash('error', data.error || t.workflow.actionFailed);
      }
    } catch {
      flash('error', t.workflow.actionFailed);
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
        flash('success', t.senior.offerRejected);
        closeRejectModal();
        fetchOffers();
      } else {
        const data = await res.json().catch(() => ({}));
        flash('error', data.error || t.workflow.actionFailed);
      }
    } catch {
      flash('error', t.workflow.actionFailed);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSend = async (offerId: number) => {
    setActionLoading(offerId);
    try {
      const res = await fetch(`/api/offers/${offerId}/send`, { method: 'POST' });
      if (res.ok) {
        flash('success', t.workflow.sent);
        fetchOffers();
      } else {
        const data = await res.json().catch(() => ({}));
        flash('error', data.error || t.workflow.actionFailed);
      }
    } catch {
      flash('error', t.workflow.actionFailed);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportExcel = (o: AdminOffer) => {
    try {
      exportOfferToExcel(o.display_name, o.offer_data.zestawienie);
    } catch (e) {
      console.error('Excel export error', e);
      flash('error', 'Błąd eksportu Excela');
    }
  };

  const handleExportPDF = async (o: AdminOffer) => {
    flash('success', 'Generuję PDF...');
    try {
      await downloadServerPdf({
        offerName: o.display_name,
        offerId: o.id,
        clientInfo: normalizeClientInfo(o.offer_data.clientInfo),
        // offer_data.zestawienie jest tu celowo słabo otypowane (tylko totalValue) — resztę
        // pól (w tym `inputs` do budowy Uwagi) dostarcza faktyczny JSON z bazy w runtime.
        zestawienie: (attachNotesToZestawienie((o.offer_data.zestawienie || []) as { type?: string; inputs?: ItemInputs }[], t, language) as never),
        createdAt: o.created_at,
        // Waluta i kurs z SAMEJ oferty, nie z bieżących ustawień.
        currency: offerCurrency(o.offer_data),
        eurPlnRate: offerRate(o.offer_data),
        language,
      });
    } catch (e) {
      console.error('PDF error', e);
      flash('error', (e as Error).message || 'Błąd generowania PDF');
    }
  };

  const inputCls =
    'bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-cr)] outline-none';

  return (
    <>
      {message && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded-lg border shadow-lg z-50 ${
          message.type === 'success'
            ? 'bg-[rgba(46,204,113,0.15)] border-[#2ecc71] text-[#2ecc71]'
            : 'bg-[rgba(245,71,90,0.15)] border-[#f5475a] text-[#f5475a]'
        }`}>
          {message.text}
        </div>
      )}

      {/* Szybkie zakładki */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {([
          { tab: 'pendingReview' as const, label: t.senior.pendingOnly },
          { tab: 'awaitingSend' as const, label: t.senior.awaitingSend },
          { tab: 'reviewedByMe' as const, label: t.senior.reviewedByMe },
          { tab: 'all' as const, label: t.senior.allOffers },
        ]).map(({ tab, label }) => (
          <button
            key={tab}
            onClick={() => selectQuickTab(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
              activeQuickTab === tab
                ? 'bg-[rgba(59,142,245,0.12)] border-[#3b8ef5] text-[#3b8ef5]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filtry */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select className={inputCls} value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">{t.admin.allStatuses}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t.offerStatus[s]}</option>)}
          </select>
          <select className={inputCls} value={filters.user_id}
            onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}>
            <option value="">{t.admin.allSalespeople}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
          <input className={inputCls} type="date" value={filters.date_from}
            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
            aria-label={t.admin.dateFrom} title={t.admin.dateFrom} />
          <input className={inputCls} type="date" value={filters.date_to}
            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
            aria-label={t.admin.dateTo} title={t.admin.dateTo} />
        </div>
        <button
          onClick={() => selectQuickTab('all')}
          className="mt-3 px-3 py-1.5 text-xs font-medium rounded border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors"
        >
          {t.admin.clearFilters}
        </button>
      </div>

      {/* Lista */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)] flex-wrap">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
            {t.admin.navOffers}
          </h2>
          <OfferSearchInput
            value={search}
            onChange={setSearch}
            placeholder={t.offers.searchPlaceholder}
            clearLabel={t.common.cancel}
            className="ml-auto"
          />
          <span className="text-[10px] text-[var(--text-secondary)] font-mono">{offers.length}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[var(--text-secondary)]">{t.common.loading}</div>
        ) : offers.length === 0 && search ? (
          // Pusto Z POWODU frazy, nie z powodu filtrów — inaczej admin szuka błędu tam, gdzie go nie ma.
          <div className="p-8 text-center text-[var(--text-secondary)] text-sm">{t.offers.searchNoResults}</div>
        ) : offers.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-secondary)] text-sm">{t.admin.noOffersFound}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)]">
                  <th className="px-4 py-2.5 font-medium">{t.offers.title}</th>
                  <th className="px-4 py-2.5 font-medium">{t.admin.owner}</th>
                  <th className="px-4 py-2.5 font-medium">{t.admin.status}</th>
                  <th className="px-4 py-2.5 font-medium">{t.admin.createdAt}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t.offers.totalValue}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t.admin.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {offerGroups.map(({ primary: o, history }) => (
                  <Fragment key={o.id}>
                  <tr
                    onClick={() => { if (o.status !== 'sent') handleEdit(o.id); }}
                    className={o.status !== 'sent' ? 'cursor-pointer hover:bg-[rgba(255,255,255,0.02)]' : ''}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {o.display_name}
                      {/* Stały numer oferty pod nazwą — dyskretny, pokazywany ZAWSZE, żeby stał
                          w każdym wierszu tabeli w tym samym miejscu. */}
                      <span className="block mt-0.5 text-[10px] font-mono font-normal text-[var(--text-secondary)] opacity-60">
                        {offerNumberLabel(o)}
                      </span>
                      {history.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedVersionsKey(expandedVersionsKey === o.id ? null : o.id); }}
                          className="block mt-1 text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          🕓 {history.length} {history.length === 1
                            ? (language === 'pl' ? 'poprzednia wersja' : 'previous version')
                            : (language === 'pl' ? 'poprzednie wersje' : 'previous versions')}
                          {' '}
                          <span className="text-[8px]">{expandedVersionsKey === o.id ? '▲' : '▼'}</span>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[var(--text-secondary)] font-mono">
                      {o.owner_name || o.owner_email || t.admin.deletedUser}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${statusBadgeClass(o.status)}`}>
                        {t.offerStatus[o.status]}
                      </span>
                      {o.status === 'rejected' && o.rejection_reason && (
                        <p className="mt-1 text-[10px] text-[var(--accent-sum)] max-w-[220px]">
                          ✖ {o.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] font-mono text-xs">{formatDate(o.created_at)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--accent-hrs)]">
                      {formatOfferMoneyCeil(offerTotal(o), o.offer_data)} {offerTotalUnit(o.offer_data)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleExportExcel(o)}
                        disabled={!o.offer_data.zestawienie || o.offer_data.zestawienie.length === 0}
                        className="px-3 py-1.5 text-xs font-medium rounded border border-[#1f8f4e] text-[#1f8f4e] bg-[rgba(31,143,78,0.08)] hover:bg-[rgba(31,143,78,0.15)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mr-1.5"
                      >
                        📊 Excel
                      </button>
                      <button
                        onClick={() => handleExportPDF(o)}
                        disabled={!o.offer_data.zestawienie || o.offer_data.zestawienie.length === 0}
                        className="px-3 py-1.5 text-xs font-medium rounded border border-[#2ecc71] text-[#2ecc71] bg-[rgba(46,204,113,0.08)] hover:bg-[rgba(46,204,113,0.15)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        📄 PDF
                      </button>
                      {/* Edycja: admin poprawia ofertę w KAŻDYM statusie, nie tylko w pending_review.
                          Wyjątek: 'sent' — to, co poszło do klienta, zostaje nietknięte. */}
                      {o.status !== 'sent' && (
                        <button
                          onClick={() => handleEdit(o.id)}
                          className="ml-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)] hover:bg-[rgba(59,142,245,0.15)] transition-colors"
                        >
                          ✏️ {t.senior.editInCalculator}
                        </button>
                      )}
                      {o.status === 'pending_review' && (
                        <>
                          <button
                            onClick={() => handleApprove(o.id)}
                            disabled={actionLoading === o.id}
                            className="ml-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.08)] hover:bg-[rgba(46,204,113,0.15)] transition-colors disabled:opacity-50"
                          >
                            ✔️ {t.workflow.approve}
                          </button>
                          <button
                            onClick={() => openRejectModal(o.id)}
                            disabled={actionLoading === o.id}
                            className="ml-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-sum)] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.08)] hover:bg-[rgba(245,71,90,0.15)] transition-colors disabled:opacity-50"
                          >
                            ✖️ {t.workflow.reject}
                          </button>
                        </>
                      )}
                      {/* Wyślij do klienta — dowolna oferta approved, admin nie musi być właścicielem */}
                      {o.status === 'approved' && (
                        <button
                          onClick={() => handleSend(o.id)}
                          disabled={actionLoading === o.id}
                          className="ml-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-cr)] text-white bg-[var(--accent-cr)] hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          📨 {t.workflow.sendToClient}
                        </button>
                      )}
                    </td>
                  </tr>
                  {history.length > 0 && expandedVersionsKey === o.id && (
                    <tr>
                      <td colSpan={6} className="px-4 py-2 bg-[var(--bg-panel)]">
                        <div className="space-y-1.5 pl-3 border-l-2 border-[var(--border)]">
                          {history.map((v) => (
                            <div
                              key={v.id}
                              onClick={() => { if (v.status !== 'sent') handleEdit(v.id); }}
                              className={`flex items-center justify-between gap-3 flex-wrap text-xs ${v.status !== 'sent' ? 'cursor-pointer hover:bg-[rgba(255,255,255,0.03)]' : ''}`}
                            >
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="font-mono text-[var(--text-secondary)]">{offerNumberLabel(v)}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border ${statusBadgeClass(v.status)}`}
                                >
                                  {t.offerStatus[v.status]}
                                </span>
                                <span className="text-[var(--text-secondary)]">
                                  {v.owner_name || v.owner_email || t.admin.deletedUser}
                                </span>
                                <span className="text-[var(--text-muted)]">{formatDate(v.created_at)}</span>
                                <span className="font-mono text-[var(--accent-hrs)]">
                                  💰 {formatOfferMoneyCeil(offerTotal(v), v.offer_data)} {offerTotalUnit(v.offer_data)}
                                </span>
                              </div>
                              <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                {v.status !== 'sent' && (
                                  <button
                                    onClick={() => handleEdit(v.id)}
                                    className="px-2 py-1 text-[10px] rounded border border-[var(--accent-cr)] text-[var(--accent-cr)] hover:bg-[rgba(59,142,245,0.1)] transition-colors"
                                  >
                                    ✏️
                                  </button>
                                )}
                                <button
                                  onClick={() => handleExportPDF(v)}
                                  disabled={!v.offer_data.zestawienie || v.offer_data.zestawienie.length === 0}
                                  className="px-2 py-1 text-[10px] rounded border border-[#2ecc71] text-[#2ecc71] hover:bg-[rgba(46,204,113,0.1)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  📄
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
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
              {offers.find((o) => o.id === rejectModalOfferId)?.display_name}
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
    </>
  );
}

export default function AdminOffersPage() {
  return (
    <AdminLayout>
      <Suspense fallback={null}>
        <AdminOffersContent />
      </Suspense>
    </AdminLayout>
  );
}
