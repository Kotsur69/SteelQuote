'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';
import TeamEditor from '@/components/TeamEditor';
import { formatTons, formatPct, formatInt, formatDate } from '@/lib/analyticsFormat';
import SalesPyramid from '@/components/SalesPyramid';
import { useAccessT } from '@/lib/i18n/access';
import type { AdminAccessConfig } from '@/lib/access/adminConfig';

interface MembershipBadge {
  flowId: number;
  flowName: string;
  roleId: number;
  roleName: string;
  levelCode: string;
}

/** Salespeople list filter: everyone, one flow, superusers, or accounts without any flow. */
type FlowFilter = 'all' | 'superuser' | 'none' | number;

interface AdminUser {
  id: number;
  email: string;
  full_name: string | null;
  is_superuser: boolean;
  memberships: MembershipBadge[];
  is_active: boolean;
  created_at: string;
  offers_total: number;
  offers_pending: number;
  offers_sent: number;
  // Performance aggregates (see GET /api/admin/users). Dates are YYYY-MM-DD or null.
  account_created_date: string | null;
  first_quote_date: string | null;
  last_quote_date: string | null;
  offers_won: number;
  offers_lost: number;
  offers_decision_pending: number;
  tons_offered: number;
  tons_won: number;
  tons_lost: number;
  tons_pending: number;
  avg_margin_pct: number | null;
}

/** won / (won + lost) as a percentage; null while nothing is decided. */
function winRateOffers(u: AdminUser): number | null {
  const decided = u.offers_won + u.offers_lost;
  return decided > 0 ? (u.offers_won / decided) * 100 : null;
}

export default function AdminSalespeoplePage() {
  const { t, language } = useLanguage();
  const at = useAccessT();
  // Flows, roles in flows and permissions - for the membership editor, team eligibility and the
  // pyramid. Loaded from the same endpoint as the Uprawnienia page.
  const [config, setConfig] = useState<AdminAccessConfig | null>(null);
  const [view, setView] = useState<'table' | 'pyramid'>('table');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Which senior's team panel is expanded under their row (one at a time).
  const [teamOpen, setTeamOpen] = useState<number | null>(null);
  // Which salesperson's performance strip is expanded (independent of teamOpen).
  const [perfOpen, setPerfOpen] = useState<number | null>(null);
  // Flow tab above the list - 'all' is also the clear action, no separate reset needed.
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('all');

  // Formularz nowego konta
  const [form, setForm] = useState({ email: '', password: '', full_name: '', is_superuser: false });

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

  const fetchConfig = async () => {
    const res = await fetch('/api/admin/access');
    if (res.ok) setConfig(await res.json());
  };

  useEffect(() => { fetchUsers(); fetchConfig(); }, []);

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
        setForm({ email: '', password: '', full_name: '', is_superuser: false });
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

  // Set / move / remove (roleId null) a user's role in one flow.
  const setMembership = async (userId: number, flowId: number, roleId: number | null) => {
    setBusy(userId);
    try {
      const res = await fetch('/api/admin/access/memberships', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, flowId, roleId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        flash('success', t.admin.userUpdated);
        fetchUsers();
        fetchConfig();
      } else {
        flash('error', data.error || t.admin.saveFailed);
      }
    } finally {
      setBusy(null);
    }
  };

  // Team leaders are the users who may approve in at least one flow (configuration, not a role name).
  const isApprover = (u: AdminUser) =>
    u.memberships.some((m) =>
      config?.flowRoles.some((fr) => fr.flowId === m.flowId && fr.roleId === m.roleId && fr.permissions.canApproveReject)
    );
  const rolesInFlow = (flowId: number) =>
    (config?.flowRoles ?? [])
      .filter((fr) => fr.flowId === flowId)
      .map((fr) => config?.roles.find((r) => r.id === fr.roleId))
      .filter((r): r is NonNullable<typeof r> => !!r && r.isActive);
  const activeFlows = (config?.flows ?? []).filter((f) => f.isActive);

  const handleToggleActive = (u: AdminUser) => {
    if (u.is_active && !confirm(t.admin.confirmDeactivate)) return;
    patchUser(u.id, { is_active: !u.is_active }, u.is_active ? t.admin.userDeactivated : t.admin.userUpdated);
  };

  const inputCls =
    'w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-cr)] outline-none';

  const matchesFilter = (u: AdminUser, filter: FlowFilter) =>
    filter === 'all' ||
    (filter === 'superuser' && u.is_superuser) ||
    (filter === 'none' && !u.is_superuser && u.memberships.length === 0) ||
    (typeof filter === 'number' && u.memberships.some((m) => m.flowId === filter));
  const filteredUsers = users.filter((u) => matchesFilter(u, flowFilter));
  const filterOptions: { key: FlowFilter; label: string }[] = [
    { key: 'all', label: t.admin.allSalespeople },
    ...activeFlows.map((f) => ({ key: f.id as FlowFilter, label: f.name })),
    { key: 'superuser', label: at.superuser },
    { key: 'none', label: at.noFlow },
  ];

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
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox" checked={form.is_superuser}
              onChange={(e) => setForm({ ...form, is_superuser: e.target.checked })}
              className="h-4 w-4"
            />
            {at.superuser}
          </label>
        </div>
        <button
          type="submit" disabled={busy === 'new'}
          className="mt-4 px-4 py-2 bg-[var(--accent-cr)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {t.admin.save}
        </button>
      </form>

      {/* Filtr roli — kliknięcie "Wszyscy" jest jednocześnie czyszczeniem filtra. */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filterOptions.map(({ key: rf, label }) => {
          const count = users.filter((u) => matchesFilter(u, rf)).length;
          const isActive = flowFilter === rf;
          return (
            <button
              key={String(rf)}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFlowFilter(rf)}
              className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                isActive
                  ? 'bg-[rgba(59,142,245,0.12)] border-[#3b8ef5] text-[#3b8ef5]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Table or pyramid (org chart per flow) of the same people. */}
      <div role="tablist" aria-label={`${at.pyramid.tableView} / ${at.pyramid.pyramidView}`} className="flex gap-2 mb-4">
        {(['table', 'pyramid'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
              view === v
                ? 'bg-[rgba(59,142,245,0.12)] border-[#3b8ef5] text-[#3b8ef5]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
            }`}
          >
            {v === 'table' ? at.pyramid.tableView : at.pyramid.pyramidView}
          </button>
        ))}
      </div>

      {view === 'pyramid' && config && <SalesPyramid config={config} />}

      {/* Lista */}
      <div className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden ${view === 'pyramid' ? 'hidden' : ''}`}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
            {t.admin.navSalespeople}
          </h2>
          <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">
            {filteredUsers.length}
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
                  <th className="px-4 py-2.5 font-medium text-center">{t.admin.perf.colWinRate}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t.admin.perf.colTonnage}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t.admin.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredUsers.map((u) => {
                  const rate = winRateOffers(u);
                  return (
                  <Fragment key={u.id}>
                  <tr className={u.is_active ? '' : 'opacity-50'}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-primary)]">
                        {u.full_name || '—'}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] font-mono">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {/* One role per flow; "—" removes the user from that flow. */}
                      <div className="flex flex-col gap-1.5 min-w-[220px]">
                        {activeFlows.map((flow) => {
                          const m = u.memberships.find((x) => x.flowId === flow.id);
                          return (
                            <label key={flow.id} className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                              <span className="w-24 truncate" title={flow.name}>{flow.name}</span>
                              <select
                                aria-label={`${flow.name} - ${at.role}`}
                                className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-cr)]"
                                value={m?.roleId ?? ''}
                                disabled={busy === u.id || !config}
                                onChange={(e) => setMembership(u.id, flow.id, e.target.value ? Number(e.target.value) : null)}
                              >
                                <option value="">{at.none}</option>
                                {rolesInFlow(flow.id).map((r) => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                              {m && <span className="font-mono text-[10px] text-[var(--text-muted)]">{m.levelCode}</span>}
                            </label>
                          );
                        })}
                        <button
                          type="button"
                          aria-pressed={u.is_superuser}
                          disabled={busy === u.id}
                          onClick={() => patchUser(u.id, { is_superuser: !u.is_superuser }, t.admin.userUpdated)}
                          className={`self-start mt-1 px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-wider transition-colors disabled:opacity-50 ${
                            u.is_superuser
                              ? 'border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.12)]'
                              : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {at.superuser}
                        </button>
                      </div>
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
                    <td className="px-4 py-3 text-center font-mono text-[var(--text-value)]">
                      {rate === null ? (
                        <span className="text-[var(--text-muted)]">—</span>
                      ) : (
                        <span className={rate >= 50 ? 'text-[var(--accent-hdg)]' : 'text-[var(--accent-sum)]'}>
                          {formatPct(rate, language)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--text-value)]">
                      {formatTons(u.tons_offered, language)} t
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setPerfOpen(perfOpen === u.id ? null : u.id)}
                          aria-expanded={perfOpen === u.id}
                          className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                            perfOpen === u.id
                              ? 'border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.15)]'
                              : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          📊 {t.admin.perf.performance} {perfOpen === u.id ? '▲' : '▼'}
                        </button>
                        {isApprover(u) && (
                          <button
                            onClick={() => setTeamOpen(teamOpen === u.id ? null : u.id)}
                            aria-expanded={teamOpen === u.id}
                            className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                              teamOpen === u.id
                                ? 'border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.15)]'
                                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            👥 {t.team.title} {teamOpen === u.id ? '▲' : '▼'}
                          </button>
                        )}
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
                  {perfOpen === u.id && (
                    <tr>
                      <td colSpan={7} className="px-4 py-4 bg-[var(--bg-panel)]">
                        <PerfDetail user={u} rate={rate} language={language} t={t} />
                      </td>
                    </tr>
                  )}
                  {isApprover(u) && teamOpen === u.id && (
                    <tr>
                      <td colSpan={7} className="px-4 py-4 bg-[var(--bg-panel)]">
                        <TeamEditor seniorId={u.id} compact />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

/** One labelled figure in the performance strip. */
function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'muted' }) {
  const color =
    tone === 'good' ? 'text-[var(--accent-hdg)]'
    : tone === 'bad' ? 'text-[var(--accent-sum)]'
    : tone === 'muted' ? 'text-[var(--text-muted)]'
    : 'text-[var(--text-value)]';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{label}</div>
      <div className={`font-mono text-sm mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

/** The strip that opens under a salesperson row: activity dates, offer outcomes, tonnage. */
function PerfDetail({
  user: u,
  rate,
  language,
  t,
}: {
  user: AdminUser;
  rate: number | null;
  language: Parameters<typeof formatTons>[1];
  t: ReturnType<typeof useLanguage>['t'];
}) {
  const hasQuotes = u.first_quote_date !== null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
      <Stat label={t.admin.perf.accountCreated} value={formatDate(u.account_created_date, language)} />
      <Stat
        label={t.admin.perf.firstQuote}
        value={hasQuotes ? formatDate(u.first_quote_date, language) : t.admin.perf.noQuotes}
        tone={hasQuotes ? undefined : 'muted'}
      />
      <Stat
        label={t.admin.perf.lastQuote}
        value={hasQuotes ? formatDate(u.last_quote_date, language) : t.admin.perf.noQuotes}
        tone={hasQuotes ? undefined : 'muted'}
      />
      <Stat
        label={t.admin.perf.winRateOffers}
        value={rate === null ? '—' : formatPct(rate, language)}
        tone={rate === null ? 'muted' : rate >= 50 ? 'good' : 'bad'}
      />
      <Stat label={t.admin.perf.avgMargin} value={formatPct(u.avg_margin_pct, language)} />
      <div className="hidden lg:block" />

      <Stat label={t.admin.perf.offersWon} value={formatInt(u.offers_won, language)} tone={u.offers_won > 0 ? 'good' : undefined} />
      <Stat label={t.admin.perf.offersLost} value={formatInt(u.offers_lost, language)} tone={u.offers_lost > 0 ? 'bad' : undefined} />
      <Stat label={t.admin.perf.offersAwaitingDecision} value={formatInt(u.offers_decision_pending, language)} />
      <Stat label={t.admin.perf.tonnageWon} value={`${formatTons(u.tons_won, language)} t`} tone={u.tons_won > 0 ? 'good' : undefined} />
      <Stat label={t.admin.perf.tonnageLost} value={`${formatTons(u.tons_lost, language)} t`} tone={u.tons_lost > 0 ? 'bad' : undefined} />
      <Stat label={t.admin.perf.tonnagePending} value={`${formatTons(u.tons_pending, language)} t`} />
    </div>
  );
}
