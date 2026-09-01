'use client';

// The analytics panel, for every role.
//
// A junior gets their own book of business; a senior gets their own plus their team's
// (migration 019); admin gets the whole company. The salesperson filter and breakdown show for
// an admin or a senior with a team. The difference is decided on the server
// (lib/analyticsQuery.ts) - this page only stops drawing the controls that would do nothing.
//
// One fetch per filter change, and every figure on the page comes out of that one response, so
// the KPI tiles, the timeline and the tables can never disagree with each other.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage, LanguageSelector } from '@/contexts/LanguageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import Navigation from '@/components/Navigation';
import { useDarkMode } from '@/lib/useDarkMode';
import { useHighContrast } from '@/lib/useHighContrast';
import { getThemeVars } from '@/lib/themeVars';
import {
  MEASURES,
  OTHER_KEY,
  STEEL_TYPE_SERIES_ORDER,
  type AnalyticsPayload,
  type ClientDecision,
  type Dimension,
  type Measure,
} from '@/lib/analytics';
import {
  DECISION_COLOR,
  STATUS_COLOR,
  STEEL_TYPE_COLOR,
  categoricalColor,
} from '@/lib/chartColors';
import { exportAnalyticsToExcel } from '@/lib/analyticsExport';
import type { SteelType } from '@/lib/calculatorData';
import ChartFrame from '@/components/analytics/ChartFrame';
import FilterBar, {
  DEFAULT_UI_FILTERS,
  type AnalyticsUiFilters,
} from '@/components/analytics/FilterBar';
import KpiTiles from '@/components/analytics/KpiTiles';
import TimeSeriesPanel, {
  SPLITTABLE_MEASURES,
  type TimeChartKind,
} from '@/components/analytics/TimeSeriesPanel';
import BreakdownPanel, {
  type BreakdownChartKind,
} from '@/components/analytics/BreakdownPanel';
import WinLossPanel from '@/components/analytics/WinLossPanel';
import DataTablePanel from '@/components/analytics/DataTablePanel';
import { Segmented } from '@/components/analytics/controls';

/** UI filter state -> /api/analytics query string. Empty values are simply left out. */
function buildQuery(filters: AnalyticsUiFilters): string {
  const params = new URLSearchParams();
  params.set('preset', filters.preset);
  if (filters.preset === 'custom') {
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
  }
  params.set('basis', filters.basis);
  if (filters.granularity !== 'auto') params.set('granularity', filters.granularity);
  params.set('split', filters.split);
  if (filters.userIds.length) params.set('users', filters.userIds.join(','));
  if (filters.steelTypes.length) params.set('types', filters.steelTypes.join(','));
  if (filters.statuses.length) params.set('statuses', filters.statuses.join(','));
  if (filters.decisions.length) params.set('decisions', filters.decisions.join(','));
  if (filters.clientIds.length) params.set('clients', filters.clientIds.join(','));
  return params.toString();
}

export default function AnalyticsPage() {
  const { t, language } = useLanguage();
  const { currency, setCurrency } = useCurrency();
  const [isDark, setIsDark] = useDarkMode();
  const [highContrast, setHighContrast] = useHighContrast();
  const a = t.analytics;

  const [filters, setFilters] = useState<AnalyticsUiFilters>(DEFAULT_UI_FILTERS);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Panel-local view state. Not part of the query - switching a chart type or a measure only
  // re-reads what is already in memory.
  const [measure, setMeasure] = useState<Measure>('tons');
  const [timeKind, setTimeKind] = useState<TimeChartKind>('stackedBar');
  const [breakdownDimension, setBreakdownDimension] = useState<Dimension>('steelType');
  const [breakdownKind, setBreakdownKind] = useState<BreakdownChartKind>('bar');

  const query = useMemo(() => buildQuery(filters), [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/analytics?${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as AnalyticsPayload;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        // A stale panel showing last period's numbers under a new filter would be worse than
        // an explicit failure, so the message replaces the charts rather than sitting above
        // them.
        if (!cancelled) {
          setData(null);
          setError(a.loadFailed);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, a.loadFailed]);

  const cssVars = getThemeVars(isDark, highContrast);

  const measureLabel: Record<Measure, string> = {
    tons: a.mTons,
    value: a.mValue,
    offers: a.mOffers,
    clients: a.mClients,
    marginPct: a.mMarginPct,
  };

  const dimensionLabel: Record<Dimension, string> = {
    steelType: a.dimSteelType,
    status: a.dimStatus,
    decision: a.dimDecision,
    salesperson: a.dimSalesperson,
    client: a.dimClient,
  };

  const decisionLabel = (decision: ClientDecision) =>
    decision === 'won' ? a.decisionWon : decision === 'lost' ? a.decisionLost : a.decisionPending;

  /**
   * Colour for a key of a dimension. Steel types, statuses and decisions have a colour of their
   * own and keep it wherever they appear; salespeople and clients get a positional colour from
   * the fixed categorical order.
   */
  const colorForDimension = useCallback(
    (dimension: Dimension) => (key: string, index: number) => {
      if (key === OTHER_KEY) return 'var(--text-muted)';
      if (dimension === 'steelType') return STEEL_TYPE_COLOR[key as SteelType] ?? 'var(--accent-cr)';
      if (dimension === 'status')
        return STATUS_COLOR[key as keyof typeof STATUS_COLOR] ?? 'var(--accent-cr)';
      if (dimension === 'decision')
        return DECISION_COLOR[key as ClientDecision] ?? 'var(--text-muted)';
      return categoricalColor(index);
    },
    []
  );

  const groupsFor = (dimension: Dimension) => {
    if (!data) return [];
    switch (dimension) {
      case 'steelType':
        return data.bySteelType;
      case 'status':
        return data.byStatus;
      case 'decision':
        return data.byDecision;
      case 'salesperson':
        return data.bySalesperson;
      case 'client':
        return data.byClient;
    }
  };

  /** Clicking a breakdown entry narrows the whole page to it, the way a report should drill. */
  const drillInto = (dimension: Dimension, key: string) => {
    if (key === OTHER_KEY) return;
    switch (dimension) {
      case 'steelType':
        setFilters((f) => ({ ...f, steelTypes: [key] }));
        break;
      case 'status':
        setFilters((f) => ({ ...f, statuses: [key] }));
        break;
      case 'decision':
        setFilters((f) => ({ ...f, decisions: [key] }));
        break;
      case 'salesperson':
        if (data?.scope.canFilterSalespeople) setFilters((f) => ({ ...f, userIds: [key] }));
        break;
      case 'client':
        setFilters((f) => ({ ...f, clientIds: [key] }));
        break;
    }
  };

  const handleExport = () => {
    if (!data) return;
    exportAnalyticsToExcel(data, currency, {
      summary: a.panelBreakdown,
      offers: a.kpiOffers,
      period: a.period,
      measureTons: a.mTons,
      measureValue: a.mValue,
      offersCount: a.offersCount,
      clients: a.clients,
      won: a.decisionWon,
      lost: a.decisionLost,
      pending: a.decisionPending,
      winRate: a.winRate,
      margin: a.mMarginPct,
      steelType: a.dimSteelType,
      status: a.dimStatus,
      decision: a.dimDecision,
      salesperson: a.dimSalesperson,
      client: a.dimClient,
      offerName: t.offers.offerName,
      createdAt: t.admin.createdAt,
      sentAt: a.basisSent,
      decidedAt: a.basisDecided,
      total: a.total,
    });
  };

  const timeSplitKeys =
    data && SPLITTABLE_MEASURES.includes(measure) && filters.split !== 'none'
      ? data.splitKeys
      : [];
  const timeLegend = timeSplitKeys.map((entry, index) => ({
    key: entry.key,
    label: entry.label,
    color: colorForDimension(filters.split as Dimension)(entry.key, index),
  }));

  const breakdownGroups = groupsFor(breakdownDimension);
  const breakdownLegend = breakdownGroups.map((group, index) => ({
    key: group.key,
    label: group.label,
    color: colorForDimension(breakdownDimension)(group.key, index),
  }));

  const hasRows = (data?.rows.length ?? 0) > 0;

  return (
    <div
      className="min-h-screen p-7 font-sans"
      style={{
        ...(cssVars as React.CSSProperties),
        background: 'var(--bg)',
        color: 'var(--text-primary)',
      }}
    >
      <header className="flex items-center gap-4 mb-7 pb-5 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center font-mono font-semibold text-[13px] text-white bg-gradient-to-br from-[#3b8ef5] to-[#e8a020]">
          SSC
        </div>
        <div>
          <h1 className="text-[17px] font-semibold tracking-wide text-[var(--text-primary)]">
            {a.title}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
            {a.subtitle} · {t.common.version}
          </p>
        </div>

        <LanguageSelector className="ml-auto" />

        {/* Currency switch, same as the calculator: EUR is the stored truth, PLN a display
            layer converted with each offer's own frozen rate. */}
        <Segmented
          value={currency}
          onChange={(next) => setCurrency(next)}
          options={[
            { value: 'EUR' as const, label: '€' },
            { value: 'PLN' as const, label: 'zł' },
          ]}
        />

        <button
          onClick={() => setIsDark(!isDark)}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] flex items-center gap-1.5 hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors"
        >
          <span className="text-sm">{isDark ? '☀️' : '🌙'}</span>
          <span>{isDark ? t.header.light : t.header.dark}</span>
        </button>
        <button
          onClick={() => setHighContrast(!highContrast)}
          className={`rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono flex items-center gap-1.5 border-2 transition-colors ${
            highContrast
              ? 'bg-black text-white border-black'
              : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span className="text-sm">🔲</span>
          <span>{highContrast ? t.header.highContrastOn : t.header.highContrastOff}</span>
        </button>
        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/';
          }}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] hover:border-[var(--accent-sum)] hover:text-[var(--accent-sum)] transition-colors"
        >
          {t.common.logout}
        </button>
      </header>

      <Navigation isDark={isDark} highContrast={highContrast} />

      <div className="space-y-5">
        <FilterBar
          value={filters}
          onChange={setFilters}
          facets={data?.facets ?? { users: [], clients: [], steelTypes: STEEL_TYPE_SERIES_ORDER }}
          canFilterSalespeople={data?.scope.canFilterSalespeople ?? false}
          period={data?.period ?? { from: null, to: null }}
        />

        {error && (
          <p className="px-4 py-3 rounded-md border-l-[3px] border-[var(--accent-sum)] bg-[rgba(245,71,90,0.10)] text-xs font-mono text-[var(--text-primary)]">
            {error}
          </p>
        )}

        {loading && !data && (
          <p className="p-8 text-center text-[var(--text-secondary)] font-mono text-xs">
            {t.common.loading}
          </p>
        )}

        {data && (
          <>
            <KpiTiles
              kpi={data.kpi}
              previousKpi={data.previousKpi}
              currency={currency}
              language={language}
              labels={{
                tonsOffered: a.kpiTonsOffered,
                tonsWon: a.kpiTonsWon,
                tonsLost: a.kpiTonsLost,
                tonsPending: a.kpiTonsPending,
                winRateTons: a.kpiWinRateTons,
                offers: a.kpiOffers,
                clients: a.kpiClients,
                valueOffered: a.kpiValueOffered,
                avgMargin: a.kpiAvgMargin,
                vsPrevious: a.vsPrevious,
                noComparison: a.noComparison,
                decidedOffers: a.decidedOffers,
              }}
              onFilterDecision={(decision) => setFilters((f) => ({ ...f, decisions: [decision] }))}
            />

            <ChartFrame
              title={a.panelTimeline}
              legend={timeLegend}
              empty={!hasRows}
              emptyLabel={a.noData}
              controls={
                <>
                  <Segmented
                    label={a.measure}
                    value={measure}
                    onChange={setMeasure}
                    options={MEASURES.map((m) => ({ value: m, label: measureLabel[m] }))}
                  />
                  <Segmented
                    label={a.chartType}
                    value={timeKind}
                    onChange={setTimeKind}
                    options={[
                      { value: 'line' as const, label: a.chartLine },
                      { value: 'area' as const, label: a.chartArea },
                      { value: 'stackedArea' as const, label: a.chartStackedArea },
                      { value: 'bar' as const, label: a.chartBar },
                      { value: 'stackedBar' as const, label: a.chartStackedBar },
                    ]}
                  />
                </>
              }
            >
              <TimeSeriesPanel
                series={data.series}
                splitKeys={timeSplitKeys}
                colorFor={colorForDimension(filters.split as Dimension)}
                measure={measure}
                kind={timeKind}
                granularity={data.filters.granularity}
                currency={currency}
                language={language}
                measureLabel={measureLabel[measure]}
                totalLabel={a.total}
              />
            </ChartFrame>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ChartFrame
                title={a.panelBreakdown}
                accent="var(--accent-hrs)"
                legend={breakdownKind === 'bar' ? undefined : breakdownLegend}
                empty={!hasRows}
                emptyLabel={a.noData}
                controls={
                  <>
                    <Segmented
                      label={a.dimension}
                      value={breakdownDimension}
                      onChange={setBreakdownDimension}
                      options={(
                        ['steelType', 'status', 'decision', 'client'] as Dimension[]
                      )
                        .concat(data.scope.canFilterSalespeople ? ['salesperson'] : [])
                        .map((d) => ({ value: d, label: dimensionLabel[d] }))}
                    />
                    <Segmented
                      label={a.chartType}
                      value={breakdownKind}
                      onChange={setBreakdownKind}
                      options={[
                        { value: 'bar' as const, label: a.chartHorizontalBar },
                        { value: 'pie' as const, label: a.chartPie },
                        { value: 'donut' as const, label: a.chartDonut },
                        { value: 'table' as const, label: a.showTable },
                      ]}
                    />
                  </>
                }
              >
                <BreakdownPanel
                  groups={breakdownGroups}
                  colorFor={colorForDimension(breakdownDimension)}
                  measure={measure}
                  kind={breakdownKind}
                  currency={currency}
                  language={language}
                  measureLabel={measureLabel[measure]}
                  totalLabel={a.total}
                  onSelect={(key) => drillInto(breakdownDimension, key)}
                  labels={{ winRate: a.winRate, offersCount: a.offersCount }}
                />
              </ChartFrame>

              <ChartFrame
                title={a.panelWinLoss}
                accent="var(--accent-hdg)"
                empty={!hasRows}
                emptyLabel={a.noData}
              >
                <WinLossPanel
                  kpi={data.kpi}
                  series={data.series}
                  granularity={data.filters.granularity}
                  language={language}
                  labels={{
                    won: a.decisionWon,
                    lost: a.decisionLost,
                    pending: a.decisionPending,
                    winRate: a.kpiWinRateTons,
                    offersCount: a.offersCount,
                  }}
                  onFilterDecision={(decision) =>
                    setFilters((f) => ({ ...f, decisions: [decision] }))
                  }
                />
              </ChartFrame>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ChartFrame
                title={a.panelTopClients}
                accent="var(--accent-pickled)"
                empty={data.byClient.length === 0}
                emptyLabel={a.noData}
              >
                <BreakdownPanel
                  groups={data.byClient}
                  colorFor={colorForDimension('client')}
                  measure={measure}
                  kind="table"
                  currency={currency}
                  language={language}
                  measureLabel={measureLabel[measure]}
                  totalLabel={a.total}
                  onSelect={(key) => drillInto('client', key)}
                  labels={{ winRate: a.winRate, offersCount: a.offersCount }}
                />
              </ChartFrame>

              {/* A one-person breakdown says nothing, so this needs a team: admin or a senior
                  who has one. */}
              {data.scope.canFilterSalespeople && (
                <ChartFrame
                  title={a.panelTopSalespeople}
                  accent="var(--accent-zm)"
                  empty={data.bySalesperson.length === 0}
                  emptyLabel={a.noData}
                >
                  <BreakdownPanel
                    groups={data.bySalesperson}
                    colorFor={colorForDimension('salesperson')}
                    measure={measure}
                    kind="table"
                    currency={currency}
                    language={language}
                    measureLabel={measureLabel[measure]}
                    totalLabel={a.total}
                    onSelect={(key) => drillInto('salesperson', key)}
                    labels={{ winRate: a.winRate, offersCount: a.offersCount }}
                  />
                </ChartFrame>
              )}
            </div>

            <ChartFrame
              title={a.panelDataTable}
              accent="var(--accent-teardrop)"
              empty={!hasRows}
              emptyLabel={a.noData}
              controls={
                <button
                  type="button"
                  onClick={handleExport}
                  className="px-3 py-1.5 rounded-md border border-[var(--accent-hdg)] text-[var(--accent-hdg)] text-[11px] font-mono hover:bg-[rgba(46,204,113,0.10)] transition-colors"
                >
                  📊 {a.exportXlsx}
                </button>
              }
            >
              <DataTablePanel
                rows={data.rows}
                currency={currency}
                language={language}
                showOwner={data.scope.canFilterSalespeople}
                labels={{
                  offerName: t.offers.offerName,
                  salesperson: a.dimSalesperson,
                  client: a.dimClient,
                  steelType: a.dimSteelType,
                  tons: a.mTons,
                  value: a.mValue,
                  margin: a.mMarginPct,
                  status: a.dimStatus,
                  decision: a.dimDecision,
                  createdAt: t.admin.createdAt,
                  statusLabel: (status) => t.offerStatus[status],
                  decisionLabel,
                  truncated: (count, total) => `${count} / ${total}`,
                }}
              />
            </ChartFrame>
          </>
        )}
      </div>
    </div>
  );
}
