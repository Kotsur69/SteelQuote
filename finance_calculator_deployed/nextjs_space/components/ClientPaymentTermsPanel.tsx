'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { DEFAULT_SETTINGS } from '@/lib/currency';

interface ClientRow {
  id: number;
  company: string | null;
  nip: string | null;
  payment_term_days: number | null;
}

// Zakładka "Klienci" w Panelu Seniora — jedyne miejsce, w którym senior może dotknąć
// tabeli `clients`: wolno mu zmienić WYŁĄCZNIE payment_term_days (migracja 023), przez
// ten sam PATCH /api/admin/clients co panel admina (patrz app/api/admin/clients/route.ts —
// tam jest wymuszony podział pól per rola, nie tutaj). Admin edytuje pełne dane klienta
// w /admin/klienci; ten panel istnieje, bo senior nie ma dostępu do /admin (middleware).
export default function ClientPaymentTermsPanel() {
  const { t } = useLanguage();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalDefault, setGlobalDefault] = useState(DEFAULT_SETTINGS.paymentTermDays);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [clientsRes, settingsRes] = await Promise.all([
        fetch('/api/admin/clients'),
        fetch('/api/settings'),
      ]);
      if (clientsRes.ok) {
        const data = await clientsRes.json();
        setClients(data.clients as ClientRow[]);
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setGlobalDefault(data.settings.paymentTermDays);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return clients;
    return clients.filter(
      (c) => (c.company || '').toLowerCase().includes(q) || (c.nip || '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  const draftFor = (c: ClientRow) => drafts[c.id] ?? (c.payment_term_days === null ? '' : String(c.payment_term_days));

  const handleSave = async (c: ClientRow) => {
    setSavingId(c.id);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, payment_term_days: draftFor(c) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setClients((prev) => prev.map((row) => (row.id === c.id ? data.client : row)));
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[c.id];
          return next;
        });
        flash('success', t.common.save);
      } else {
        flash('error', data.error || t.admin.saveFailed);
      }
    } finally {
      setSavingId(null);
    }
  };

  const inputCls =
    'w-24 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)] font-mono text-right focus:border-[var(--accent-cr)] outline-none';

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
      {message && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded-lg border shadow-lg z-50 ${
          message.type === 'success'
            ? 'bg-[rgba(46,204,113,0.15)] border-[#2ecc71] text-[#2ecc71]'
            : 'bg-[rgba(245,71,90,0.15)] border-[#f5475a] text-[#f5475a]'
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)] flex-wrap">
        <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
        <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
          {t.client.paymentTermDays}
        </h2>
        <span className="text-[10px] text-[var(--text-secondary)] font-mono">
          {t.client.paymentTermDaysHint} ({globalDefault} {t.admin.settings.daysUnit})
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.client.searchPlaceholder}
          className="ml-auto bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent-cr)] outline-none"
        />
      </div>

      {loading ? (
        <div className="p-8 text-center text-[var(--text-secondary)]">{t.common.loading}</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-[var(--text-secondary)] text-sm">{t.admin.noClients}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)]">
                <th className="px-4 py-2.5 font-medium">{t.client.company}</th>
                <th className="px-4 py-2.5 font-medium">{t.client.nip}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t.client.paymentTermDays}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t.admin.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{c.company || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{c.nip || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min="0"
                      max="365"
                      placeholder={t.client.paymentTermDaysPlaceholder}
                      value={draftFor(c)}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      className={inputCls}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleSave(c)}
                      disabled={savingId === c.id}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)] hover:bg-[rgba(59,142,245,0.15)] transition-colors disabled:opacity-50"
                    >
                      {savingId === c.id ? '…' : t.common.save}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
