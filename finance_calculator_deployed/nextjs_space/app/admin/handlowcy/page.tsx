'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';

type Role = 'junior' | 'senior' | 'admin';

interface AdminUser {
  id: number;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  offers_total: number;
  offers_pending: number;
  offers_sent: number;
}

export default function AdminSalespeoplePage() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Formularz nowego konta
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'junior' as Role });

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      } else {
        flash('error', t.admin.loadFailed);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('new');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        flash('success', t.admin.userCreated);
        setForm({ email: '', password: '', full_name: '', role: 'junior' });
        fetchUsers();
      } else {
        flash('error', data.error || t.admin.saveFailed);
      }
    } finally {
      setBusy(null);
    }
  };

  const patchUser = async (id: number, body: Record<string, unknown>, okText: string) => {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        flash('success', okText);
        fetchUsers();
      } else {
        flash('error', data.error || t.admin.saveFailed);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRoleChange = (id: number, role: Role) =>
    patchUser(id, { role }, t.admin.userUpdated);

  const handleToggleActive = (u: AdminUser) => {
    if (u.is_active && !confirm(t.admin.confirmDeactivate)) return;
    patchUser(u.id, { is_active: !u.is_active }, u.is_active ? t.admin.userDeactivated : t.admin.userUpdated);
  };

  const inputCls =
    'w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-cr)] outline-none';

  return (
    <AdminLayout>
      {message && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded-lg border shadow-lg z-50 ${
          message.type === 'success'
            ? 'bg-[rgba(46,204,113,0.15)] border-[#2ecc71] text-[#2ecc71]'
            : 'bg-[rgba(245,71,90,0.15)] border-[#f5475a] text-[#f5475a]'
        }`}>
          {message.text}
        </div>
      )}

      {/* Formularz dodawania */}
      <form
        onSubmit={handleCreate}
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md p-4 mb-6"
      >
        <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)] mb-4">
          {t.admin.addSalesperson}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            className={inputCls} type="email" required placeholder={t.admin.email}
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className={inputCls} type="password" required placeholder={t.admin.password}
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <input
            className={inputCls} type="text" placeholder={t.admin.fullName}
            value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <select
            className={inputCls} value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="junior">{t.roles.junior}</option>
            <option value="senior">{t.roles.senior}</option>
            <option value="admin">{t.roles.admin}</option>
          </select>
        </div>
        <button
          type="submit" disabled={busy === 'new'}
          className="mt-4 px-4 py-2 bg-[var(--accent-cr)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {t.admin.save}
        </button>
      </form>

      {/* Lista */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
            {t.admin.navSalespeople}
          </h2>
          <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">
            {users.length}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[var(--text-secondary)]">{t.common.loading}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)]">
                  <th className="px-4 py-2.5 font-medium">{t.admin.fullName} / {t.admin.email}</th>
                  <th className="px-4 py-2.5 font-medium">{t.admin.role}</th>
                  <th className="px-4 py-2.5 font-medium">{t.admin.status}</th>
                  <th className="px-4 py-2.5 font-medium text-center">{t.admin.offersCount}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t.admin.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {users.map((u) => (
                  <tr key={u.id} className={u.is_active ? '' : 'opacity-50'}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-primary)]">
                        {u.full_name || '—'}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] font-mono">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-cr)]"
                        value={u.role} disabled={busy === u.id}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                      >
                        <option value="junior">{t.roles.junior}</option>
                        <option value="senior">{t.roles.senior}</option>
                        <option value="admin">{t.roles.admin}</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${
                        u.is_active
                          ? 'border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.12)]'
                          : 'border-[var(--text-muted)] text-[var(--text-muted)]'
                      }`}>
                        {u.is_active ? t.admin.active : t.admin.inactive}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-[var(--text-value)]">
                      {u.offers_total}
                      {u.offers_pending > 0 && (
                        <span className="ml-1 text-[10px] text-[var(--accent-hrs)]">
                          ({u.offers_pending} {t.workflow.awaitingReview.toLowerCase()})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <Link
                          href={`/admin/oferty?user_id=${u.id}`}
                          className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)] hover:bg-[rgba(59,142,245,0.15)] transition-colors"
                        >
                          {t.admin.viewOffers}
                        </Link>
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={busy === u.id}
                          className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-50 ${
                            u.is_active
                              ? 'border-[var(--accent-sum)] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.08)] hover:bg-[rgba(245,71,90,0.15)]'
                              : 'border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.08)] hover:bg-[rgba(46,204,113,0.15)]'
                          }`}
                        >
                          {u.is_active ? t.admin.deactivate : t.admin.activate}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
