'use client';

// The row-level data behind every chart on the page.
//
// This is the panel that makes the rest of the page checkable: a figure that looks wrong can be
// traced to the offers that produced it. It is also the standing table view the accessibility
// pass requires, so nothing on this page is readable only as colour.
//
// Sorting is client-side. The rows are already in memory - the whole period came down in one
// response - and a round trip per column click would be slower and no more correct.

import { useMemo, useState } from 'react';
import type { AnalyticsRow } from '@/lib/analytics';
import type { Currency } from '@/lib/currency';
import type { Language } from '@/lib/translations';
import { STATUS_COLOR, DECISION_COLOR, DECISION_ICON, STEEL_TYPE_COLOR } from '@/lib/chartColors';
import { CURRENCY_UNIT, formatDate, formatMoney, formatPct, formatTons } from '@/lib/analyticsFormat';

type SortKey = 'label' | 'tons' | 'value' | 'margin' | 'created' | 'client' | 'owner';

interface DataTablePanelProps {
  rows: AnalyticsRow[];
  currency: Currency;
  language: Language;
  showOwner: boolean;
  /** Beyond this many rows the table is capped; the export carries the full set. */
  limit?: number;
  labels: {
    offerName: string;
    salesperson: string;
    client: string;
    steelType: string;
    tons: string;
    value: string;
    margin: string;
    status: string;
    decision: string;
    createdAt: string;
    statusLabel: (status: AnalyticsRow['status']) => string;
    decisionLabel: (decision: AnalyticsRow['decision']) => string;
    truncated: (shown: number, total: number) => string;
  };
}

const DEFAULT_LIMIT = 200;

export default function DataTablePanel({
  rows,
  currency,
  language,
  showOwner,
  limit = DEFAULT_LIMIT,
  labels,
}: DataTablePanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const value = (row: AnalyticsRow) =>
      currency === 'PLN' ? row.valuePln : row.valueEur;

    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'label':
          cmp = a.label.localeCompare(b.label, language);
          break;
        case 'tons':
          cmp = a.tons - b.tons;
          break;
        case 'value':
          cmp = value(a) - value(b);
          break;
        case 'margin':
          // Offers with no recorded margin sort to the end either way rather than pretending
          // to be 0%.
          cmp = (a.marginPct ?? -1) - (b.marginPct ?? -1);
          break;
        case 'client':
          cmp = (a.clientCompany ?? '').localeCompare(b.clientCompany ?? '', language);
          break;
        case 'owner':
          cmp = (a.ownerName ?? '').localeCompare(b.ownerName ?? '', language);
          break;
        case 'created':
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
      }
      if (cmp === 0) cmp = a.id - b.id;
      return cmp * dir;
    });
  }, [rows, sortKey, sortDir, currency, language]);

  const shown = sorted.slice(0, limit);

  const sort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const Header = ({ column, label, align = 'left' }: { column: SortKey; label: string; align?: 'left' | 'right' }) => (
    <th className={`py-1.5 px-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => sort(column)}
        className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
      >
        {label}
        <span className="text-[8px]">
          {sortKey === column ? (sortDir === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  );

  return (
    <div>
      <table className="w-full text-[11px] font-mono border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
            <Header column="label" label={labels.offerName} />
            {showOwner && <Header column="owner" label={labels.salesperson} />}
            <Header column="client" label={labels.client} />
            <th className="py-1.5 px-2 font-medium text-left">{labels.steelType}</th>
            <Header column="tons" label={labels.tons} align="right" />
            <Header column="value" label={`${labels.value} (${CURRENCY_UNIT[currency]})`} align="right" />
            <Header column="margin" label={labels.margin} align="right" />
            <th className="py-1.5 px-2 font-medium text-left">{labels.status}</th>
            <th className="py-1.5 px-2 font-medium text-left">{labels.decision}</th>
            <Header column="created" label={labels.createdAt} align="right" />
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.id} className="border-t border-[var(--border)]">
              <td className="py-1.5 px-2 text-[var(--text-primary)] whitespace-nowrap">
                {row.label}
              </td>
              {showOwner && (
                <td className="py-1.5 px-2 text-[var(--text-secondary)] truncate max-w-[140px]">
                  {row.ownerName ?? '—'}
                </td>
              )}
              <td className="py-1.5 px-2 text-[var(--text-secondary)] truncate max-w-[180px]">
                {row.clientCompany ?? '—'}
              </td>
              <td className="py-1.5 px-2">
                <span className="flex flex-wrap gap-1">
                  {row.steelTypes.map((type) => (
                    <span
                      key={type}
                      className="px-1.5 py-0.5 rounded text-[9.5px] border"
                      style={{
                        color: STEEL_TYPE_COLOR[type],
                        borderColor: STEEL_TYPE_COLOR[type],
                      }}
                    >
                      {type}
                    </span>
                  ))}
                </span>
              </td>
              <td className="py-1.5 px-2 text-right text-[var(--text-primary)] tabular-nums">
                {formatTons(row.tons, language)}
              </td>
              <td className="py-1.5 px-2 text-right text-[var(--text-primary)] tabular-nums">
                {formatMoney(currency === 'PLN' ? row.valuePln : row.valueEur, language)}
              </td>
              <td className="py-1.5 px-2 text-right text-[var(--text-secondary)] tabular-nums">
                {formatPct(row.marginPct, language)}
              </td>
              <td className="py-1.5 px-2 whitespace-nowrap">
                <span style={{ color: STATUS_COLOR[row.status] }}>
                  {labels.statusLabel(row.status)}
                </span>
              </td>
              <td className="py-1.5 px-2 whitespace-nowrap">
                <span style={{ color: DECISION_COLOR[row.decision] }}>
                  {DECISION_ICON[row.decision]} {labels.decisionLabel(row.decision)}
                </span>
              </td>
              <td className="py-1.5 px-2 text-right text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                {formatDate(row.createdAt, language)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sorted.length > shown.length && (
        <p className="mt-3 text-[10px] font-mono text-[var(--text-muted)]">
          {labels.truncated(shown.length, sorted.length)}
        </p>
      )}
    </div>
  );
}
