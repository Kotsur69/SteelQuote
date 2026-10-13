'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';
import {
  REASON_LANGS,
  pickReasonLang,
  sortLostReasons,
  type LostReasonDef,
  type ReasonLabels,
  type ReasonLang,
} from '@/lib/lostReasons';
import { parseReasonLabels } from '@/lib/lostReasonValidation';
import LabelFields, { EMPTY_LABELS } from '@/components/lostReasons/LabelFields';
import ReasonRow, { type RowError } from '@/components/lostReasons/ReasonRow';
import { adminErrorText, lostReasonsAdminStrings } from '@/components/lostReasons/adminStrings';

type SendResult = { ok: boolean; data: Record<string, unknown> | null };

// How long a success / error note stays in the toolbar.
const MESSAGE_MS = 3500;

// Shown by app/admin/powody-przegranej/page.tsx when the fresh DB check says the caller is not
// the superuser (the middleware only reads the token's `su` hint, which can be stale).
export function LostReasonsForbidden() {
  const { t, language } = useLanguage();
  return (
    <AdminLayout>
      <div role="alert" className="mx-auto max-w-md rounded-md border border-[var(--accent-sum)] bg-[var(--bg-card)] p-6 text-center">
        <p className="font-mono text-3xl font-semibold text-[var(--accent-sum)]">403</p>
        <h2 className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{lostReasonsAdminStrings(language).title}</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{t.priceBook.forbiddenText}</p>
      </div>
    </AdminLayout>
  );
}

// Editor of the lost-reason list: add (all four names required), rename, reorder, archive and
// restore. Every change saves immediately - the list is short and each edit stands alone.
export default function LostReasonsAdmin() {
  const { t, language } = useLanguage();
  const s = lostReasonsAdminStrings(language);
  const [reasons, setReasons] = useState<LostReasonDef[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [migrated, setMigrated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [newLabels, setNewLabels] = useState<ReasonLabels>(EMPTY_LABELS);
  const [addError, setAddError] = useState<{ text: string; lang: ReasonLang | null } | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  // One request at a time. A ref, not state: two clicks in the same tick must not both pass,
  // and row buttons stay enabled (disabling them would drop keyboard focus mid-reorder).
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/lost-reasons');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReasons(data.reasons);
      setUsage(data.usage ?? {});
      setMigrated(data.migrated !== false);
      setLoadFailed(false);
    } catch (error) {
      console.error('Error loading lost reasons:', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(id);
  }, [message]);

  const sorted = useMemo(() => sortLostReasons(reasons), [reasons]);
  const archivedCount = sorted.filter((r) => r.archived).length;
  const visible = showArchived ? sorted : sorted.filter((r) => !r.archived);
  const movable = sorted.filter((r) => !r.archived && !r.isSystem);
  const rowsDisabled = !migrated || loading;
  const disabled = busy || rowsDisabled;

  // Resolves to null when another request is still running (the click is dropped).
  const send = async (url: string, method: string, body: unknown): Promise<SendResult | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, data };
    } catch (error) {
      console.error(`Lost reasons ${method} failed:`, error);
      return { ok: false, data: null };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const replaceReason = (next: LostReasonDef) =>
    setReasons((prev) => prev.map((r) => (r.code === next.code ? next : r)));

  const add = async () => {
    const parsed = parseReasonLabels(newLabels);
    if (!parsed.ok) {
      setAddError({ text: adminErrorText(s, { code: parsed.error, lang: parsed.lang }), lang: parsed.lang });
      return;
    }
    const result = await send('/api/admin/lost-reasons', 'POST', { labels: parsed.labels });
    if (!result) return;
    const { ok, data } = result;
    if (!ok || !data?.reason) {
      const lang = typeof data?.lang === 'string' ? (data.lang as ReasonLang) : null;
      setAddError({ text: adminErrorText(s, data), lang });
      return;
    }
    setReasons((prev) => [...prev, data.reason as LostReasonDef]);
    setNewLabels(EMPTY_LABELS);
    setAddError(null);
    setMessage({ kind: 'success', text: s.added });
  };

  const saveLabels = async (code: string, labels: ReasonLabels): Promise<RowError | null> => {
    const parsed = parseReasonLabels(labels);
    if (!parsed.ok) return { text: adminErrorText(s, { code: parsed.error, lang: parsed.lang }), lang: parsed.lang };
    const result = await send(`/api/admin/lost-reasons/${encodeURIComponent(code)}`, 'PATCH', { labels: parsed.labels });
    if (!result) return { text: s.errors.busy, lang: null };
    const { ok, data } = result;
    if (!ok || !data?.reason) {
      return { text: adminErrorText(s, data), lang: typeof data?.lang === 'string' ? (data.lang as ReasonLang) : null };
    }
    replaceReason(data.reason as LostReasonDef);
    setMessage({ kind: 'success', text: s.saved });
    return null;
  };

  const toggleArchive = async (reason: LostReasonDef) => {
    if (busyRef.current) return;
    if (!reason.archived && !window.confirm(s.confirmArchive(reason.labels[pickReasonLang(language)]))) return;
    const result = await send(`/api/admin/lost-reasons/${encodeURIComponent(reason.code)}`, 'PATCH', { archived: !reason.archived });
    if (!result) return;
    const { ok, data } = result;
    if (!ok || !data?.reason) {
      setMessage({ kind: 'error', text: adminErrorText(s, data) });
      return;
    }
    replaceReason(data.reason as LostReasonDef);
    setMessage({ kind: 'success', text: s.saved });
  };

  // Swaps a reason with its active neighbour; archived rows keep their slots.
  const move = async (code: string, direction: -1 | 1) => {
    const index = movable.findIndex((r) => r.code === code);
    const neighbour = movable[index + direction];
    if (!neighbour) return;
    const order = sorted.map((r) => r.code);
    const a = order.indexOf(code);
    const b = order.indexOf(neighbour.code);
    [order[a], order[b]] = [order[b], order[a]];
    const result = await send('/api/admin/lost-reasons', 'PUT', { order });
    if (!result) return;
    const { ok, data } = result;
    const next = data?.reasons;
    if (!ok || !Array.isArray(next)) {
      setMessage({ kind: 'error', text: adminErrorText(s, data) });
      return;
    }
    setReasons(next as LostReasonDef[]);
  };

  return (
    <AdminLayout>
      <div className="space-y-5 max-w-6xl">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{s.title}</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-3xl leading-relaxed">{s.subtitle}</p>
        </div>

        {!migrated && (
          <p role="status" className="rounded border border-[var(--accent-hrs)] bg-[rgba(232,160,32,0.08)] px-4 py-2.5 text-xs text-[var(--text-primary)]">{s.notMigrated}</p>
        )}
        {loadFailed && (
          <p role="alert" className="rounded border border-[var(--accent-sum)] px-4 py-2.5 text-xs text-[var(--accent-sum)]">{s.loadFailed}</p>
        )}

        <fieldset disabled={disabled} className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-4">
          <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{s.addLegend}</legend>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); add(); }} noValidate>
            <LabelFields idPrefix="new-reason" value={newLabels} disabled={disabled} s={s} errorId={addError ? 'new-reason-error' : undefined} invalidLang={addError?.lang} onChange={(next) => { setNewLabels(next); setAddError(null); }} />
            <button type="submit" className="inline-flex items-center gap-1.5 rounded border border-[#3b8ef5] bg-[rgba(59,142,245,0.12)] px-4 py-1.5 text-xs font-semibold text-[#3b8ef5] hover:bg-[rgba(59,142,245,0.22)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cr)]">
              <Plus aria-hidden className="h-3.5 w-3.5" /> {s.add}
            </button>
          </form>
          {addError && <p id="new-reason-error" role="alert" className="mt-2 text-[11px] text-[var(--accent-sum)]">{addError.text}</p>}
        </fieldset>

        <section className="rounded-md border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              {s.showArchived(archivedCount)}
            </label>
            <span aria-live="polite" className={`ml-auto text-xs ${message?.kind === 'error' ? 'text-[var(--accent-sum)]' : 'text-[var(--accent-hdg)]'}`}>
              {message?.text}
            </span>
          </div>

          {loading ? (
            <p className="px-4 py-6 text-sm text-[var(--text-secondary)]">{t.common.loading}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                    <th scope="col" className="px-2 py-2 text-left font-semibold">{s.colOrder}</th>
                    {REASON_LANGS.map((lang) => (
                      <th key={lang} scope="col" className="px-3 py-2 text-left font-semibold">{s.langNames[lang]}</th>
                    ))}
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{s.colUsage}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold"><span className="sr-only">{s.colActions}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((reason) => {
                    const index = movable.findIndex((r) => r.code === reason.code);
                    return (
                      <ReasonRow
                        key={reason.code}
                        reason={reason}
                        usage={usage[reason.code] ?? 0}
                        canMoveUp={index > 0}
                        canMoveDown={index >= 0 && index < movable.length - 1}
                        disabled={rowsDisabled}
                        s={s}
                        onMove={(direction) => move(reason.code, direction)}
                        onSaveLabels={(labels) => saveLabels(reason.code, labels)}
                        onToggleArchive={() => toggleArchive(reason)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
