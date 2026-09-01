'use client';

// Every filter on the page, in one row above the charts - period first, because that is the
// question a reader changes most often, then the narrowing filters.
//
// Nothing here is applied optimistically in the browser: the state below is serialised into the
// /api/analytics query string and the server re-derives every figure. The salesperson filter is
// rendered for an admin or a senior with a team; the server clamps its ids to what the caller
// may actually see, so a junior (or a hand-edited query) gets nothing extra.

import { useLanguage } from '@/contexts/LanguageContext';
import {
  DATE_BASES,
  DIMENSIONS,
  GRANULARITIES,
  OFFER_STATUSES,
  CLIENT_DECISIONS,
  STEEL_TYPE_SERIES_ORDER,
  type AnalyticsFacets,
  type DateBasis,
  type Dimension,
  type Granularity,
} from '@/lib/analytics';
import { PERIOD_PRESETS, type PeriodPreset } from '@/lib/analyticsPeriods';
import { DECISION_COLOR, STATUS_COLOR, STEEL_TYPE_COLOR } from '@/lib/chartColors';
import { DateRange, MultiSelect, Segmented } from './controls';

export interface AnalyticsUiFilters {
  preset: PeriodPreset;
  from: string;
  to: string;
  basis: DateBasis;
  /** 'auto' lets the server fit the bucket size to the window length. */
  granularity: Granularity | 'auto';
  split: Dimension | 'none';
  userIds: string[];
  steelTypes: string[];
  statuses: string[];
  decisions: string[];
  clientIds: string[];
}

export const DEFAULT_UI_FILTERS: AnalyticsUiFilters = {
  preset: 'last90',
  from: '',
  to: '',
  basis: 'created',
  granularity: 'auto',
  split: 'steelType',
  userIds: [],
  steelTypes: [],
  statuses: [],
  decisions: [],
  clientIds: [],
};

interface FilterBarProps {
  value: AnalyticsUiFilters;
  onChange: (next: AnalyticsUiFilters) => void;
  facets: AnalyticsFacets;
  /** Admin, or a senior with a team - controls whether the salesperson filter/split show. */
  canFilterSalespeople: boolean;
  /** Resolved window, echoed back by the server - shown so a preset is never ambiguous. */
  period: { from: string | null; to: string | null };
}

export default function FilterBar({
  value,
  onChange,
  facets,
  canFilterSalespeople,
  period,
}: FilterBarProps) {
  const { t } = useLanguage();
  const a = t.analytics;
  const set = <K extends keyof AnalyticsUiFilters>(key: K, next: AnalyticsUiFilters[K]) =>
    onChange({ ...value, [key]: next });

  const presetLabel: Record<PeriodPreset, string> = {
    today: a.presetToday,
    yesterday: a.presetYesterday,
    last7: a.presetLast7,
    last30: a.presetLast30,
    last90: a.presetLast90,
    last365: a.presetLast365,
    thisMonth: a.presetThisMonth,
    lastMonth: a.presetLastMonth,
    thisQuarter: a.presetThisQuarter,
    lastQuarter: a.presetLastQuarter,
    thisYear: a.presetThisYear,
    lastYear: a.presetLastYear,
    ytd: a.presetYtd,
    all: a.presetAll,
    custom: a.presetCustom,
  };

  const granularityLabel: Record<Granularity, string> = {
    day: a.granDay,
    week: a.granWeek,
    month: a.granMonth,
    quarter: a.granQuarter,
    year: a.granYear,
  };

  const basisLabel: Record<DateBasis, string> = {
    created: a.basisCreated,
    sent: a.basisSent,
    decided: a.basisDecided,
  };

  const dimensionLabel: Record<Dimension, string> = {
    steelType: a.dimSteelType,
    status: a.dimStatus,
    decision: a.dimDecision,
    salesperson: a.dimSalesperson,
    client: a.dimClient,
  };

  const isDirty =
    value.userIds.length > 0 ||
    value.steelTypes.length > 0 ||
    value.clientIds.length > 0 ||
    value.statuses.length > 0 ||
    value.decisions.length > 0;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md p-4 space-y-3">
      {/* Period */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-mono">
          {a.period}
        </span>
        <div className="flex flex-wrap gap-1">
          {PERIOD_PRESETS.map((preset) => {
            const isActive = preset === value.preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={isActive}
                onClick={() => set('preset', preset)}
                className={`px-2.5 py-1 rounded-[14px] text-[11px] font-mono border transition-colors ${
                  isActive
                    ? 'border-[#3b8ef5] text-[#3b8ef5] bg-[rgba(59,142,245,0.15)] font-bold'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
                }`}
              >
                {presetLabel[preset]}
              </button>
            );
          })}
        </div>

        {/* The resolved window, so "this quarter" always states the dates it means. */}
        {period.from && period.to && value.preset !== 'custom' && (
          <span className="text-[10px] font-mono text-[var(--text-muted)] tabular-nums">
            {period.from} … {period.to}
          </span>
        )}
      </div>

      {value.preset === 'custom' && (
        <DateRange
          fromLabel={a.from}
          toLabel={a.to}
          from={value.from}
          to={value.to}
          onChange={(from, to) => onChange({ ...value, from, to })}
        />
      )}

      {/* Bucket size, date basis, timeline split */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Segmented
          label={a.granularity}
          value={value.granularity}
          onChange={(next) => set('granularity', next)}
          options={[
            { value: 'auto' as const, label: 'auto' },
            ...GRANULARITIES.map((g) => ({ value: g, label: granularityLabel[g] })),
          ]}
        />
        <Segmented
          label={a.basis}
          value={value.basis}
          onChange={(next) => set('basis', next)}
          options={DATE_BASES.map((b) => ({ value: b, label: basisLabel[b] }))}
        />
        <Segmented
          label={a.splitBy}
          value={value.split}
          onChange={(next) => set('split', next)}
          options={[
            { value: 'none' as const, label: a.splitNone },
            ...DIMENSIONS.filter((d) => d !== 'salesperson' || canFilterSalespeople).map((d) => ({
              value: d,
              label: dimensionLabel[d],
            })),
          ]}
        />
      </div>

      {/* Narrowing filters */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border)]">
        {canFilterSalespeople && (
          <MultiSelect
            label={a.salespeople}
            options={facets.users.map((u) => ({ value: String(u.id), label: u.name }))}
            selected={value.userIds}
            onChange={(next) => set('userIds', next)}
            allLabel={a.allSelected}
            selectedLabel={a.selected}
          />
        )}

        <MultiSelect
          label={a.steelTypes}
          options={STEEL_TYPE_SERIES_ORDER.map((type) => ({
            value: type,
            label: type,
            color: STEEL_TYPE_COLOR[type],
          }))}
          selected={value.steelTypes}
          onChange={(next) => set('steelTypes', next)}
          allLabel={a.allSelected}
          selectedLabel={a.selected}
        />

        <MultiSelect
          label={a.statuses}
          options={OFFER_STATUSES.map((status) => ({
            value: status,
            label: t.offerStatus[status],
            color: STATUS_COLOR[status],
          }))}
          selected={value.statuses}
          onChange={(next) => set('statuses', next)}
          allLabel={a.allSelected}
          selectedLabel={a.selected}
        />

        <MultiSelect
          label={a.decisions}
          options={CLIENT_DECISIONS.map((decision) => ({
            value: decision,
            label:
              decision === 'won' ? a.decisionWon : decision === 'lost' ? a.decisionLost : a.decisionPending,
            color: DECISION_COLOR[decision],
          }))}
          selected={value.decisions}
          onChange={(next) => set('decisions', next)}
          allLabel={a.allSelected}
          selectedLabel={a.selected}
        />

        <MultiSelect
          label={a.clients}
          options={facets.clients.map((c) => ({ value: String(c.id), label: c.name }))}
          selected={value.clientIds}
          onChange={(next) => set('clientIds', next)}
          allLabel={a.allSelected}
          selectedLabel={a.selected}
          emptyLabel={a.noData}
        />

        {isDirty && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                userIds: [],
                steelTypes: [],
                statuses: [],
                decisions: [],
                clientIds: [],
              })
            }
            className="px-3 py-1.5 rounded-md border border-[var(--accent-sum)] text-[var(--accent-sum)] text-[11px] font-mono hover:bg-[rgba(245,71,90,0.10)] transition-colors"
          >
            ✕ {a.reset}
          </button>
        )}
      </div>
    </div>
  );
}
