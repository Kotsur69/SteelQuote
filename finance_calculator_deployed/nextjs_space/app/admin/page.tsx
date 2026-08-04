'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';

type OfferStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'sent';
const STATUSES: OfferStatus[] = ['draft', 'pending_review', 'approved', 'rejected', 'sent'];

const STATUS_ACCENT: Record<OfferStatus, string> = {
  draft: 'var(--text-secondary)',
  pending_review: 'var(--accent-hrs)',
  approved: 'var(--accent-hdg)',
  rejected: 'var(--accent-sum)',
  sent: 'var(--accent-cr)',
};

export default function AdminDashboardPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [totalOffers, setTotalOffers] = useState(0);
  const [byStatus, setByStatus] = useState<Record<OfferStatus, number>>({
    draft: 0, pending_review: 0, approved: 0, rejected: 0, sent: 0,
  });
  const [activeSalespeople, setActiveSalespeople] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [offersRes, usersRes] = await Promise.all([
          fetch('/api/admin/offers'),
          fetch('/api/admin/users'),
        ]);
        if (offersRes.ok) {
          const { offers } = await offersRes.json();
          setTotalOffers(offers.length);
          const counts: Record<OfferStatus, number> = {
            draft: 0, pending_review: 0, approved: 0, rejected: 0, sent: 0,
          };
          for (const o of offers) counts[o.status as OfferStatus]++;
          setByStatus(counts);
        }
        if (usersRes.ok) {
          const { users } = await usersRes.json();
          setActiveSalespeople(
            users.filter((u: { is_active: boolean; role: string }) => u.is_active && u.role !== 'admin').length
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AdminLayout>
      {loading ? (
        <div className="p-8 text-center text-[var(--text-secondary)]">{t.common.loading}</div>
      ) : (
        <div className="space-y-6">
          {/* Kafelki podsumowania */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/admin/oferty"
              className="block bg-[var(--bg-card)] border border-[var(--border)] rounded-md p-5 transition-colors hover:border-[var(--border-hi)] hover:bg-[rgba(255,255,255,0.03)]"
            >
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-mono">
                {t.admin.totalOffers}
              </p>
              <p className="text-3xl font-semibold text-[var(--text-primary)] mt-2 font-mono">
                {totalOffers}
              </p>
            </Link>
            <Link
              href="/admin/handlowcy"
              className="block bg-[var(--bg-card)] border border-[var(--border)] rounded-md p-5 transition-colors hover:border-[var(--border-hi)] hover:bg-[rgba(255,255,255,0.03)]"
            >
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-mono">
                {t.admin.activeSalespeople}
              </p>
              <p className="text-3xl font-semibold text-[var(--accent-hdg)] mt-2 font-mono">
                {activeSalespeople}
              </p>
            </Link>
          </div>

          {/* Oferty wg statusu */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
              <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
                {t.admin.offersByStatus}
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-[var(--border)]">
              {STATUSES.map((s) => (
                <Link
                  key={s}
                  href={`/admin/oferty?status=${s}`}
                  className="group block p-4 text-center transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                >
                  <p
                    className="text-2xl font-semibold font-mono"
                    style={{ color: STATUS_ACCENT[s] }}
                  >
                    {byStatus[s]}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mt-1 transition-colors group-hover:text-[var(--text-primary)]">
                    {t.offerStatus[s]}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
