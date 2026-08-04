'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';

interface Client {
  id: number;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  nip: string | null;
  address: string | null;
  sap_id: string | null;
  phone: string | null;
  email: string | null;
  offers_count: number;
}

interface Contact {
  id: number;
  client_id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

const EMPTY = {
  id: null as number | null,
  first_name: '', last_name: '', company: '', nip: '', address: '', sap_id: '', phone: '', email: '',
};

const EMPTY_CONTACT_FORM = { first_name: '', last_name: '', phone: '', email: '' };

export default function AdminClientsPage() {
  const { t } = useLanguage();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Kontakty firm — pobierane raz, zgrupowane po client_id, żeby rozwinięcie wiersza
  // firmy nie odpytywało API za każdym kliknięciem.
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT_FORM);
  const [editingContact, setEditingContact] = useState<{ id: number } & typeof EMPTY_CONTACT_FORM | null>(null);
  const [contactBusy, setContactBusy] = useState(false);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/admin/clients');
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients);
      } else {
        flash('error', t.admin.loadFailed);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchContacts = async () => {
    const res = await fetch('/api/admin/contacts');
    if (res.ok) {
      const data = await res.json();
      setContacts(data.contacts);
    }
  };

  useEffect(() => { fetchClients(); fetchContacts(); }, []);

  const contactsByClient = useMemo(() => {
    const map = new Map<number, Contact[]>();
    for (const contact of contacts) {
      const list = map.get(contact.client_id);
      if (list) list.push(contact);
      else map.set(contact.client_id, [contact]);
    }
    return map;
  }, [contacts]);

  const toggleExpanded = (clientId: number) => {
    setExpandedClientId((current) => (current === clientId ? null : clientId));
    setContactForm(EMPTY_CONTACT_FORM);
    setEditingContact(null);
  };

  const handleAddContact = async (clientId: number) => {
    if (contactForm.first_name.trim() === '' && contactForm.last_name.trim() === '') return;
    setContactBusy(true);
    try {
      const res = await fetch('/api/admin/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, ...contactForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        flash('success', t.admin.contactCreated);
        setContactForm(EMPTY_CONTACT_FORM);
        fetchContacts();
      } else {
        flash('error', data.error || t.admin.saveFailed);
      }
    } finally {
      setContactBusy(false);
    }
  };

  const handleEditContactSave = async () => {
    if (!editingContact) return;
    setContactBusy(true);
    try {
      const res = await fetch('/api/admin/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingContact),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        flash('success', t.admin.contactUpdated);
        setEditingContact(null);
        fetchContacts();
      } else {
        flash('error', data.error || t.admin.saveFailed);
      }
    } finally {
      setContactBusy(false);
    }
  };

  const handleDeleteContact = async (id: number) => {
    if (!confirm(t.admin.confirmDeleteContact)) return;
    setContactBusy(true);
    try {
      const res = await fetch(`/api/admin/contacts?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        flash('success', t.admin.contactDeleted);
        if (editingContact?.id === id) setEditingContact(null);
        fetchContacts();
      } else {
        flash('error', t.admin.saveFailed);
      }
    } finally {
      setContactBusy(false);
    }
  };

  const editing = form.id !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/admin/clients', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        flash('success', editing ? t.admin.clientUpdated : t.admin.clientCreated);
        setForm(EMPTY);
        fetchClients();
        // Zapis klienta synchronizuje kontakt główny do client_contacts po stronie
        // serwera (patrz lib/clientDirectory.ts:syncPrimaryContact) — odśwież lokalną
        // listę, żeby było to widać bez ręcznego przeładowania strony.
        fetchContacts();
      } else {
        flash('error', data.error || t.admin.saveFailed);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (c: Client) => {
    setForm({
      id: c.id,
      first_name: c.first_name || '', last_name: c.last_name || '', company: c.company || '',
      nip: c.nip || '', address: c.address || '', sap_id: c.sap_id || '',
      phone: c.phone || '', email: c.email || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t.admin.confirmDeleteClient)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        flash('success', t.admin.clientDeleted);
        if (form.id === id) setForm(EMPTY);
        if (expandedClientId === id) setExpandedClientId(null);
        fetchClients();
        // ON DELETE CASCADE w client_contacts (migracja 010) usuwa kontakty tej
        // firmy razem z nią — odśwież lokalną listę, żeby nie zostały widoczne.
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

      {/* Formularz dodawania/edycji */}
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md p-4 mb-6"
      >
        <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)] mb-4">
          {editing ? t.admin.editClient : t.admin.addClient}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <input className={inputCls} placeholder={t.admin.company}
            value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <input className={inputCls} placeholder={t.admin.firstName}
            value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <input className={inputCls} placeholder={t.admin.lastName}
            value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <input className={inputCls} placeholder={t.admin.nip}
            value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} />
          <input className={inputCls} placeholder={t.client.sapId}
            value={form.sap_id} onChange={(e) => setForm({ ...form, sap_id: e.target.value })} />
          <input className={inputCls} placeholder={t.admin.phone}
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className={inputCls} type="email" placeholder={t.admin.clientEmailLabel}
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={`${inputCls} sm:col-span-2 lg:col-span-3`} placeholder={t.admin.address}
            value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={busy}
            className="px-4 py-2 bg-[var(--accent-cr)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {t.admin.save}
          </button>
          {editing && (
            <button type="button" onClick={() => setForm(EMPTY)}
              className="px-4 py-2 border border-[var(--border)] text-[var(--text-secondary)] rounded-md text-sm font-medium hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors">
              {t.admin.cancel}
            </button>
          )}
        </div>
      </form>

      {/* Lista */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
            {t.admin.navClients}
          </h2>
          <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">{clients.length}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[var(--text-secondary)]">{t.common.loading}</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-secondary)] text-sm">{t.admin.noClients}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)]">
                  <th className="px-4 py-2.5 font-medium">{t.admin.company}</th>
                  <th className="px-4 py-2.5 font-medium">{t.admin.firstName} {t.admin.lastName}</th>
                  <th className="px-4 py-2.5 font-medium">{t.admin.nip}</th>
                  <th className="px-4 py-2.5 font-medium">{t.client.sapId}</th>
                  <th className="px-4 py-2.5 font-medium">{t.admin.phone} / {t.admin.clientEmailLabel}</th>
                  <th className="px-4 py-2.5 font-medium text-center">{t.admin.offersCount}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t.admin.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {clients.map((c) => (
                  <Fragment key={c.id}>
                  <tr>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{c.company || '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{c.nip || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{c.sap_id || '—'}</td>
                    <td className="px-4 py-3 text-[11px] text-[var(--text-secondary)] font-mono">
                      <div>{c.phone || '—'}</div>
                      <div>{c.email || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-[var(--text-value)]">{c.offers_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => toggleExpanded(c.id)} disabled={busy}
                          className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50">
                          👤 {t.admin.navContacts} ({contactsByClient.get(c.id)?.length || 0})
                        </button>
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
                  {expandedClientId === c.id && (
                    <tr>
                      <td colSpan={7} className="px-4 py-4 bg-[var(--bg-input)] border-b border-[var(--border)]">
                        <div className="space-y-2">
                          {(contactsByClient.get(c.id) || []).length === 0 ? (
                            <div className="text-xs text-[var(--text-secondary)]">{t.admin.noClientContacts}</div>
                          ) : (
                            (contactsByClient.get(c.id) || []).map((contact) =>
                              editingContact?.id === contact.id ? (
                                <div key={contact.id} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-center">
                                  <input className={inputCls} placeholder={t.admin.firstName}
                                    value={editingContact.first_name}
                                    onChange={(e) => setEditingContact({ ...editingContact, first_name: e.target.value })} />
                                  <input className={inputCls} placeholder={t.admin.lastName}
                                    value={editingContact.last_name}
                                    onChange={(e) => setEditingContact({ ...editingContact, last_name: e.target.value })} />
                                  <input className={inputCls} placeholder={t.admin.phone}
                                    value={editingContact.phone}
                                    onChange={(e) => setEditingContact({ ...editingContact, phone: e.target.value })} />
                                  <input className={inputCls} type="email" placeholder={t.admin.clientEmailLabel}
                                    value={editingContact.email}
                                    onChange={(e) => setEditingContact({ ...editingContact, email: e.target.value })} />
                                  <div className="flex gap-2">
                                    <button onClick={handleEditContactSave} disabled={contactBusy}
                                      className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent-cr)] text-white hover:opacity-90 transition-opacity disabled:opacity-50">
                                      {t.admin.save}
                                    </button>
                                    <button onClick={() => setEditingContact(null)} disabled={contactBusy}
                                      className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                                      {t.admin.cancel}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div key={contact.id} className="flex items-center gap-3 text-xs">
                                  <span className="flex-1 text-[var(--text-primary)]">
                                    {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || '—'}
                                  </span>
                                  <span className="flex-1 font-mono text-[var(--text-secondary)]">{contact.phone || '—'}</span>
                                  <span className="flex-1 font-mono text-[var(--text-secondary)]">{contact.email || '—'}</span>
                                  <button
                                    onClick={() => setEditingContact({
                                      id: contact.id,
                                      first_name: contact.first_name || '',
                                      last_name: contact.last_name || '',
                                      phone: contact.phone || '',
                                      email: contact.email || '',
                                    })}
                                    disabled={contactBusy}
                                    className="px-2 py-1 rounded border border-[var(--accent-cr)] text-[var(--accent-cr)] hover:bg-[rgba(59,142,245,0.08)] transition-colors disabled:opacity-50">
                                    ✏️
                                  </button>
                                  <button onClick={() => handleDeleteContact(contact.id)} disabled={contactBusy}
                                    className="px-2 py-1 rounded border border-[var(--accent-sum)] text-[var(--accent-sum)] hover:bg-[rgba(245,71,90,0.08)] transition-colors disabled:opacity-50">
                                    🗑️
                                  </button>
                                </div>
                              )
                            )
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-center pt-2 border-t border-[var(--border)]">
                            <input className={inputCls} placeholder={t.admin.firstName}
                              value={contactForm.first_name}
                              onChange={(e) => setContactForm({ ...contactForm, first_name: e.target.value })} />
                            <input className={inputCls} placeholder={t.admin.lastName}
                              value={contactForm.last_name}
                              onChange={(e) => setContactForm({ ...contactForm, last_name: e.target.value })} />
                            <input className={inputCls} placeholder={t.admin.phone}
                              value={contactForm.phone}
                              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
                            <input className={inputCls} type="email" placeholder={t.admin.clientEmailLabel}
                              value={contactForm.email}
                              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                            <button onClick={() => handleAddContact(c.id)} disabled={contactBusy}
                              className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent-cr)] text-white hover:opacity-90 transition-opacity disabled:opacity-50">
                              + {t.admin.addContact}
                            </button>
                          </div>
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
    </AdminLayout>
  );
}
