'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';
import { ClientInfo } from '@/lib/pdfGenerator';
import { downloadServerPdf } from '@/lib/serverPdf';
import { exportOfferToExcel } from '@/lib/excelExport';

type OfferStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'sent';

interface AdminOffer {
  id: number;
  offer_name: string;
  offer_data: { zestawienie?: Array<{ totalValue: number }>; clientInfo?: ClientInfo };
  status: OfferStatus;
  user_id: number | null;
  owner_name: string | null;
  owner_email: string | null;
  created_at: string;
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
  const { t } = useLanguage();
  const searchParams = useSearchParams();

  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [filters, setFilters] = useState({
    status: '',
    user_id: searchParams.get('user_id') || '',
    date_from: '',
    date_to: '',
  });

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filters.status) qs.set('status', filters.status);
      if (filters.user_id) qs.set('user_id', filters.user_id);
      if (filters.date_from) qs.set('date_from', filters.date_from);
      if (filters.date_to) qs.set('date_to', filters.date_to);
      const res = await fetch(`/api/admin/offers?${qs.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers);
      } else {
        flash('error', t.admin.loadFailed);
      }
    } finally {
      setLoading(false);
    }
  };

  // Lista handlowców do filtra.
  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers(d.users || []));
  }, []);

  // Refetch przy zmianie filtrów.
  useEffect(() => { fetchOffers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters]);

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });

  const offerTotal = (o: AdminOffer) =>
    (o.offer_data.zestawienie || []).reduce((sum, it) => sum + it.totalValue, 0);

  const handleExportExcel = (o: AdminOffer) => {
    try {
      exportOfferToExcel(o.offer_name, o.offer_data.zestawienie);
    } catch (e) {
      console.error('Excel export error', e);
      flash('error', 'Błąd eksportu Excela');
    }
  };

  const handleExportPDF = async (o: AdminOffer) => {
    const empty: ClientInfo = { firstName: '', lastName: '', company: '', address: '', nip: '', phone: '', email: '' };
    flash('success', 'Generuję PDF...');
    try {
      await downloadServerPdf({
        offerName: o.offer_name,
        offerId: o.id,
        clientInfo: o.offer_data.clientInfo || empty,
        zestawienie: (o.offer_data.zestawienie as never) || [],
        createdAt: o.created_at,
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
          onClick={() => setFilters({ status: '', user_id: '', date_from: '', date_to: '' })}
          className="mt-3 px-3 py-1.5 text-xs font-medium rounded border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors"
        >
          {t.admin.clearFilters}
        </button>
      </div>

      {/* Lista */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
            {t.admin.navOffers}
          </h2>
          <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">{offers.length}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[var(--text-secondary)]">{t.common.loading}</div>
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
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{o.offer_name}</td>
                    <td className="px-4 py-3 text-[11px] text-[var(--text-secondary)] font-mono">
                      {o.owner_name || o.owner_email || t.admin.deletedUser}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${statusBadgeClass(o.status)}`}>
                        {t.offerStatus[o.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] font-mono text-xs">{formatDate(o.created_at)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--accent-hrs)]">
                      {offerTotal(o).toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
