'use client';

import { useEffect, useState } from 'react';
import type { SteelType } from '@/lib/calculatorData';
import { PRICE_BOOK_STEEL_TYPES, type OptionGroup } from '@/lib/priceBook';
import type { Language, Translations } from '@/lib/translations';
import type { PriceBookLogEntry } from '@/app/api/price-book/route';
import { groupLabels } from '@/components/priceBook/OptionsSection';
import { bandLabel, formatPrice } from '@/components/priceBook/draft';

type Props = {
  /** Bumped after every save to re-fetch. */
  refreshKey: number;
  t: Translations;
  language: Language;
};

const LOCALE: Record<Language, string> = { pl: 'pl-PL', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' };

function describe(entry: PriceBookLogEntry, t: Translations, language: Language): string {
  if (entry.gradeName) return `${t.priceBook.gradeName} ${entry.gradeName}`;
  const row = entry.rowKey ?? '';
  const col = entry.colKey ?? '';
  switch (entry.tableKey) {
    case 'option': {
      const { title, labels } = groupLabels(row as OptionGroup, entry.steelType, t, language);
      return `${title}: ${labels[Number(col)] ?? col}`;
    }
    case 'dimension': return `${t.priceBook.matrixDimension}: ${bandLabel(row)} × ${bandLabel(col)}`;
    case 'coating': return `${t.priceBook.matrixCoating}: ${bandLabel(row)} × ${col}`;
    case 'baseLength': return `${t.priceBook.matrixBaseLength}: ${bandLabel(row)} × ${bandLabel(col)}`;
    case 'baseWidth': return `${t.priceBook.matrixBaseWidth}: ${bandLabel(row)} × ${bandLabel(col)}`;
    case 'pickling': return `${t.priceBook.matrixPickling}: ${bandLabel(row)}`;
    case 'teardrop': return `${t.priceBook.matrixTeardrop}: ${bandLabel(row)}`;
    case 'scalar':
      if (row === 'baseFallback') return t.priceBook.fallbackBase;
      if (row === 'yieldAmount') return t.priceBook.yieldAmount;
      return t.priceBook.fallbackTeardrop;
    default: return `${entry.tableKey}/${row}/${col}`;
  }
}

function actionLabel(action: string, t: Translations): string {
  const labels: Record<string, string> = {
    set: t.priceBook.actionSet,
    reset: t.priceBook.actionReset,
    grade_add: t.priceBook.actionGradeAdd,
    grade_surcharge: t.priceBook.actionGradeSurcharge,
    grade_yield: t.priceBook.actionGradeYield,
    grade_retire: t.priceBook.actionGradeRetire,
    grade_restore: t.priceBook.actionGradeRestore,
  };
  return labels[action] ?? action;
}

function change(entry: PriceBookLogEntry): string {
  const fmt = (v: number | null) => {
    if (v === null) return '—';
    if (entry.action === 'grade_yield') return v === 1 ? '✓' : '✗';
    return formatPrice(v);
  };
  if (entry.oldValue === null && entry.newValue === null) return '';
  return `${fmt(entry.oldValue)} → ${fmt(entry.newValue)}`;
}

// Last 200 changes, newest first, optionally one steel type.
export default function ChangeLog({ refreshKey, t, language }: Props) {
  const [typeFilter, setTypeFilter] = useState<SteelType | ''>('');
  const [entries, setEntries] = useState<PriceBookLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ log: '1' });
    if (typeFilter) params.set('type', typeFilter);
    fetch(`/api/price-book?${params}`, { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { log?: PriceBookLogEntry[] }) => {
        setEntries(Array.isArray(data.log) ? data.log : []);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === 'AbortError') return;
        console.error('Price book log request failed:', error);
        setFailed(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [typeFilter, refreshKey]);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
        {t.priceBook.logType}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as SteelType | '')}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[12px] font-mono text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cr)]"
        >
          <option value="">{t.priceBook.logAllTypes}</option>
          {PRICE_BOOK_STEEL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>

      {loading ? (
        <p className="text-[12px] text-[var(--text-secondary)]">{t.common.loading}</p>
      ) : failed ? (
        <p role="alert" className="text-[12px] text-[var(--accent-sum)]">{t.priceBook.loadFailed}</p>
      ) : entries.length === 0 ? (
        <p className="text-[12px] text-[var(--text-secondary)]">{t.priceBook.logEmpty}</p>
      ) : (
        <div className="max-h-[360px] overflow-auto rounded border border-[var(--border)]">
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-[var(--bg-card)]">
              <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                <th scope="col" className="px-3 py-2 text-left font-semibold">{t.priceBook.logWhen}</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">{t.priceBook.logWho}</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">{t.priceBook.logType}</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">{t.priceBook.logWhat}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t.priceBook.logChange}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[rgba(127,127,127,0.12)] last:border-b-0">
                  <td className="px-3 py-1.5 font-mono whitespace-nowrap text-[var(--text-secondary)]">
                    {new Date(e.changedAt).toLocaleString(LOCALE[language])}
                  </td>
                  <td className="px-3 py-1.5">{e.changedByName ?? e.changedByEmail ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono">{e.steelType}</td>
                  <td className="px-3 py-1.5">
                    {describe(e, t, language)}
                    <span className="ml-2 text-[10px] text-[var(--text-muted)]">{actionLabel(e.action, t)}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{change(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
