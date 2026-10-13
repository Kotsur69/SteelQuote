'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';
import type { SteelType } from '@/lib/calculatorData';
import { DEFAULT_PRICE_BOOK, PRICE_BOOK_STEEL_TYPES, type PriceBook, type PriceTableKey } from '@/lib/priceBook';
import { bookFromPayload, fetchPriceBookPayload, parsePriceBookPayload } from '@/lib/usePriceBook';
import { formatWarning } from '@/lib/translations';
import GradesSection from '@/components/priceBook/GradesSection';
import OptionsSection from '@/components/priceBook/OptionsSection';
import MatrixGrid from '@/components/priceBook/MatrixGrid';
import FallbacksSection from '@/components/priceBook/FallbacksSection';
import ChangeLog from '@/components/priceBook/ChangeLog';
import { EMPTY_DRAFT, diffDraft, withCell, type TypeDraft } from '@/components/priceBook/draft';

// Same palette per steel type as the calculator and /admin/ustawienia.
const TYPE_COLOR: Record<SteelType, string> = {
  HRS: 'var(--accent-hrs)',
  CR: 'var(--accent-cr)',
  HDG: 'var(--accent-hdg)',
  PICKLED: 'var(--accent-pickled)',
  TEARDROP: 'var(--accent-teardrop)',
  ZM: 'var(--accent-zm)',
};

type Drafts = Record<SteelType, TypeDraft>;
const emptyDrafts = (): Drafts =>
  Object.fromEntries(PRICE_BOOK_STEEL_TYPES.map((type) => [type, EMPTY_DRAFT])) as Drafts;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md">
      <h3 className="px-4 py-2.5 border-b border-[var(--border)] text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
        {title}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  );
}

// Shown by app/admin/cennik/page.tsx when the fresh DB check says the caller is not the superuser
// (the middleware only reads the token's `su` hint, which can be stale).
export function PriceBookForbidden() {
  const { t } = useLanguage();
  return (
    <AdminLayout>
      <div role="alert" className="mx-auto max-w-md rounded-md border border-[var(--accent-sum)] bg-[var(--bg-card)] p-6 text-center">
        <p className="font-mono text-3xl font-semibold text-[var(--accent-sum)]">403</p>
        <h2 className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{t.priceBook.forbiddenTitle}</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{t.priceBook.forbiddenText}</p>
      </div>
    </AdminLayout>
  );
}

export default function PriceBookPanel() {
  const { t, language } = useLanguage();
  const [book, setBook] = useState<PriceBook>(DEFAULT_PRICE_BOOK);
  const [migrated, setMigrated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activeType, setActiveType] = useState<SteelType>('HRS');
  const [drafts, setDrafts] = useState<Drafts>(emptyDrafts);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [logKey, setLogKey] = useState(0);

  useEffect(() => {
    (async () => {
      const payload = await fetchPriceBookPayload();
      if (payload) {
        setBook(bookFromPayload(payload));
        setMigrated(payload.migrated);
      } else {
        setLoadFailed(true);
      }
      setLoading(false);
    })();
  }, []);

  const diffs = useMemo(
    () => Object.fromEntries(PRICE_BOOK_STEEL_TYPES.map((type) => [type, diffDraft(book, type, drafts[type])])) as Record<SteelType, ReturnType<typeof diffDraft>>,
    [book, drafts]
  );
  const isDirty = (type: SteelType) => diffs[type].changeCount > 0 || diffs[type].invalidCount > 0;
  const anyDirty = PRICE_BOOK_STEEL_TYPES.some(isDirty);

  // Leaving the page with unsaved edits asks the browser's confirmation.
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [anyDirty]);

  const updateDraft = useCallback((update: (draft: TypeDraft) => TypeDraft) => {
    setDrafts((prev) => ({ ...prev, [activeType]: update(prev[activeType]) }));
    setMessage(null);
  }, [activeType]);

  const onCell = useCallback((id: string, raw: string) => {
    updateDraft((d) => withCell(d, id, raw));
  }, [updateDraft]);

  const type = activeType;
  const draft = drafts[type];
  const diff = diffs[type];
  const disabled = !migrated || loading || saving;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/price-book', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diff.body),
      });
      const data = await res.json().catch(() => null);
      // A committed save whose re-read failed answers { reload: true } - fetch the book again.
      const payload = res.ok ? (parsePriceBookPayload(data) ?? await fetchPriceBookPayload()) : null;
      if (!payload) {
        setMessage({ kind: 'error', text: `${t.priceBook.saveFailed}${data?.error ? `: ${data.error}` : ''}` });
        return;
      }
      setBook(bookFromPayload(payload));
      setDrafts((prev) => ({ ...prev, [type]: EMPTY_DRAFT }));
      setLogKey((k) => k + 1);
      setMessage({ kind: 'success', text: formatWarning(t.priceBook.saved, { type }) });
    } catch (error) {
      console.error('Price book save failed:', error);
      setMessage({ kind: 'error', text: t.priceBook.saveFailed });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!window.confirm(`${t.priceBook.discard}?`)) return;
    setDrafts((prev) => ({ ...prev, [type]: EMPTY_DRAFT }));
    setMessage(null);
  };

  const matrices: { table: PriceTableKey; title: string; rowHeader: string; colHeader: string }[] = [
    { table: 'dimension', title: t.priceBook.matrixDimension, rowHeader: t.priceBook.thicknessMm, colHeader: t.priceBook.widthMm },
    { table: 'coating', title: t.priceBook.matrixCoating, rowHeader: t.priceBook.thicknessMm, colHeader: t.huta.coating },
    { table: 'baseLength', title: t.priceBook.matrixBaseLength, rowHeader: t.priceBook.thicknessMm, colHeader: t.priceBook.lengthMm },
    { table: 'baseWidth', title: t.priceBook.matrixBaseWidth, rowHeader: t.priceBook.thicknessMm, colHeader: t.priceBook.widthMm },
    { table: 'pickling', title: t.priceBook.matrixPickling, rowHeader: t.priceBook.thicknessMm, colHeader: '' },
    { table: 'teardrop', title: t.priceBook.matrixTeardrop, rowHeader: t.priceBook.widthMm, colHeader: '' },
  ];
  const typeMatrices = matrices.filter((m) => DEFAULT_PRICE_BOOK[type].tables[m.table] !== undefined);
  const sectionProps = { type, book, draft, disabled, t, onCell };

  return (
    <AdminLayout>
      <div className="space-y-5 pb-24">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t.priceBook.title}</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-3xl">{t.priceBook.subtitle}</p>
        </div>

        {!migrated && (
          <p role="status" className="rounded border border-[var(--accent-hrs)] bg-[rgba(232,160,32,0.08)] px-4 py-2.5 text-xs text-[var(--text-primary)]">
            {t.priceBook.notMigrated}
          </p>
        )}
        {loadFailed && (
          <p role="alert" className="rounded border border-[var(--accent-sum)] px-4 py-2.5 text-xs text-[var(--accent-sum)]">{t.priceBook.loadFailed}</p>
        )}

        <div role="group" aria-label={t.priceBook.title} className="flex flex-wrap gap-2">
          {PRICE_BOOK_STEEL_TYPES.map((tab) => {
            const selected = tab === type;
            return (
              <button
                key={tab}
                type="button"
                aria-pressed={selected}
                onClick={() => { setActiveType(tab); setMessage(null); }}
                className={`relative flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-mono font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cr)] ${
                  selected ? 'bg-[rgba(59,142,245,0.10)] text-[var(--text-primary)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
                }`}
                style={selected ? { borderColor: TYPE_COLOR[tab] } : undefined}
              >
                <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: TYPE_COLOR[tab] }} />
                {tab}
                {isDirty(tab) && (
                  <span className="text-[10px] font-normal text-[var(--accent-hrs)]" title={t.priceBook.unsaved}>●<span className="sr-only"> {t.priceBook.unsaved}</span></span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">{t.common.loading}</p>
        ) : (
          <div className="space-y-5">
            <Section title={t.priceBook.sectionGrades}>
              <GradesSection key={type} type={type} book={book} draft={draft} disabled={disabled} t={t} onDraft={updateDraft} />
            </Section>
            <Section title={t.priceBook.sectionHuta}>
              <OptionsSection section="huta" language={language} {...sectionProps} />
            </Section>
            <Section title={t.priceBook.sectionSsc}>
              <OptionsSection section="ssc" language={language} {...sectionProps} />
            </Section>
            <Section title={t.priceBook.sectionMatrices}>
              <div className="space-y-6">
                {typeMatrices.map((m) => <MatrixGrid key={m.table} table={m.table} title={m.title} rowHeader={m.rowHeader} colHeader={m.colHeader} {...sectionProps} />)}
              </div>
            </Section>
            <Section title={t.priceBook.sectionFallbacks}>
              <FallbacksSection {...sectionProps} />
            </Section>
          </div>
        )}

        <Section title={t.priceBook.sectionLog}>
          <ChangeLog refreshKey={logKey} t={t} language={language} />
        </Section>
      </div>

      {/* Sticky save bar - one save per tab, sending only that type's diff. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--bg-panel)] px-7 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.25)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-[var(--text-secondary)]">
            {type} · {formatWarning(t.priceBook.changedCount, { count: diff.changeCount })}
            {diff.invalidCount > 0 && <span className="ml-2 text-[var(--accent-sum)]">· {t.priceBook.invalidValue}</span>}
          </span>
          <span aria-live="polite" className={`text-xs ${message?.kind === 'error' ? 'text-[var(--accent-sum)]' : 'text-[var(--accent-hdg)]'}`}>
            {message?.text}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={discard}
              disabled={saving || !isDirty(type)}
              className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <RotateCcw aria-hidden className="h-3.5 w-3.5" /> {t.priceBook.discard}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={disabled || diff.changeCount === 0 || diff.invalidCount > 0}
              className="inline-flex items-center gap-1.5 rounded border border-[#3b8ef5] bg-[rgba(59,142,245,0.15)] px-4 py-2 text-xs font-semibold text-[#3b8ef5] hover:bg-[rgba(59,142,245,0.25)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Save aria-hidden className="h-3.5 w-3.5" />
              {saving ? t.priceBook.saving : formatWarning(t.priceBook.save, { type })}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
