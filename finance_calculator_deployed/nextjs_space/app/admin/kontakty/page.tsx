'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';

interface Contact {
  id: number;
  client_id: number;
  company: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

const EMPTY = {
  id: null as number | null,
  first_name: '', last_name: '', phone: '', email: '',
};

// Zakładka admina "Kontakty" — pełen CRUD nad client_contacts (edycja/usuwanie).
// Dodawanie nowych kontaktów robi handlowiec w kalkulatorze (przycisk "Zapisz kontakt
// do firmy", POST /api/clients/contacts) — tutaj admin tylko poprawia albo usuwa to,
// co już powstało, patrz /api/admin/contacts.
export default function AdminContactsPage() {
  const { t } = useLanguage();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/admin/contacts');
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts);
      } else {
        flash('error', t.admin.loadFailed);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContacts(); }, []);

  const editing = form.id !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        flash('success', t.admin.contactUpdated);
        setForm(EMPTY);
        fetchContacts();
      } else {
        flash('error', data.error || t.admin.saveFailed);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (c: Contact) => {
    setForm({
      id: c.id,
      first_name: c.first_name || '', last_name: c.last_name || '',
      phone: c.phone || '', email: c.email || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t.admin.confirmDeleteContact)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/contacts?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        flash('success', t.admin.contactDeleted);
        if (form.id === id) setForm(EMPTY);
        fetchContacts();
      } else {
        flash('error', t.admin.saveFailed);
      }
    } finally {
      setBusy(false);
    }
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

      {editing && (
        <form
          onSubmit={handleSubmit}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md p-4 mb-6"
        >
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)] mb-4">
            {t.admin.editContact}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input className={inputCls} placeholder={t.admin.firstName}
              value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <input className={inputCls} placeholder={t.admin.lastName}
              value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            <input className={inputCls} placeholder={t.admin.phone}
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className={inputCls} type="email" placeholder={t.admin.clientEmailLabel}
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={busy}
              className="px-4 py-2 bg-[var(--accent-cr)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {t.admin.save}
            </button>
            <button type="button" onClick={() => setForm(EMPTY)}
              className="px-4 py-2 border border-[var(--border)] text-[var(--text-secondary)] rounded-md text-sm font-medium hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors">
              {t.admin.cancel}
            </button>
          </div>
        </form>
      )}

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
            {t.admin.navContacts}
          </h2>
          <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">{contacts.length}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[var(--text-secondary)]">{t.common.loading}</div>
        ) : contacts.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-secondary)] text-sm">{t.admin.noContacts}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)]">
                  <th className="px-4 py-2.5 font-medium">{t.admin.company}</th>
                  <th className="px-4 py-2.5 font-medium">{t.admin.person}</th>
                  <th className="px-4 py-2.5 font-medium">{t.admin.phone} / {t.admin.clientEmailLabel}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t.admin.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{c.company || '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[var(--text-secondary)] font-mono">
                      <div>{c.phone || '—'}</div>
                      <div>{c.email || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => handleEdit(c)} disabled={busy}
                          className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)] hover:bg-[rgba(59,142,245,0.15)] transition-colors disabled:opacity-50">
                          ✏️ {t.common.edit}
                        </button>
                        <button onClick={() => handleDelete(c.id)} disabled={busy}
                          className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-sum)] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.08)] hover:bg-[rgba(245,71,90,0.15)] transition-colors disabled:opacity-50">
                          🗑️ {t.common.delete}
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
