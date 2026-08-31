'use client';

// The headline row: the figures the seller came for, each with its change against the
// comparison period.
//
// These are stat tiles, not charts, and that is deliberate - "how many tons did I quote" is a
// single number, and a single number is read faster as text than as a bar of length one.
// Clicking a tile is a filter shortcut where one makes sense (won / lost narrow the whole
// page to that decision), so the tiles double as the drill-down entry point.

import type { AnalyticsKpi, ClientDecision } from '@/lib/analytics';
import type { Currency } from '@/lib/currency';
import type { Language } from '@/lib/translations';
import {
  CURRENCY_UNIT,
  computeDelta,
  formatDelta,
  formatInt,
  formatMoneyShort,
  formatPct,
  formatTons,
} from '@/lib/analyticsFormat';
import { DECISION_COLOR, DECISION_ICON } from '@/lib/chartColors';

interface Tile {
  key: string;
  label: string;
  value: string;
  unit?: string;
  accent?: string;
  icon?: string;
  /** Raw pair behind the change indicator. */
  current: number;
  previous: number | null;
  /** Decision this tile stands for, when clicking it should filter the page. */
  filterDecision?: ClientDecision;
  hint?: string;
}

interface KpiTilesProps {
  kpi: AnalyticsKpi;
  previousKpi: AnalyticsKpi | null;
  currency: Currency;
  language: Language;
  labels: {
    tonsOffered: string;
    tonsWon: string;
    tonsLost: string;
    tonsPending: string;
    winRateTons: string;
    offers: string;
    clients: string;
    valueOffered: string;
    avgMargin: string;
    vsPrevious: string;
    noComparison: string;
    decidedOffers: string;
  };
  onFilterDecision?: (decision: ClientDecision) => void;
}

export default function KpiTiles({
  kpi,
  previousKpi,
  currency,
  language,
  labels,
  onFilterDecision,
}: KpiTilesProps) {
  const money = currency === 'PLN' ? kpi.valueOfferedPln : kpi.valueOfferedEur;
  const moneyPrev = previousKpi
    ? currency === 'PLN'
      ? previousKpi.valueOfferedPln
      : previousKpi.valueOfferedEur
    : null;

  const tiles: Tile[] = [
    {
      key: 'tonsOffered',
      label: labels.tonsOffered,
      value: formatTons(kpi.tonsOffered, language),
      unit: 't',
      accent: 'var(--accent-cr)',
      current: kpi.tonsOffered,
      previous: previousKpi?.tonsOffered ?? null,
    },
    {
      key: 'tonsWon',
      label: labels.tonsWon,
      value: formatTons(kpi.tonsWon, language),
      unit: 't',
      accent: DECISION_COLOR.won,
      icon: DECISION_ICON.won,
      current: kpi.tonsWon,
      previous: previousKpi?.tonsWon ?? null,
      filterDecision: 'won',
      hint: `${formatInt(kpi.offersWon, language)} ${labels.offers.toLowerCase()}`,
    },
    {
      key: 'tonsLost',
      label: labels.tonsLost,
      value: formatTons(kpi.tonsLost, language),
      unit: 't',
      accent: DECISION_COLOR.lost,
      icon: DECISION_ICON.lost,
      current: kpi.tonsLost,
      previous: previousKpi?.tonsLost ?? null,
      filterDecision: 'lost',
      hint: `${formatInt(kpi.offersLost, language)} ${labels.offers.toLowerCase()}`,
    },
    {
      key: 'tonsPending',
      label: labels.tonsPending,
      value: formatTons(kpi.tonsPending, language),
      unit: 't',
      accent: DECISION_COLOR.pending,
      icon: DECISION_ICON.pending,
      current: kpi.tonsPending,
      previous: previousKpi?.tonsPending ?? null,
      filterDecision: 'pending',
      hint: `${formatInt(kpi.offersPending, language)} ${labels.offers.toLowerCase()}`,
    },
    {
      key: 'winRate',
      label: labels.winRateTons,
      value: formatPct(kpi.winRateTons, language),
      accent: 'var(--accent-hdg)',
      current: kpi.winRateTons ?? 0,
      previous: previousKpi?.winRateTons ?? null,
      hint: `${formatInt(kpi.offersWon + kpi.offersLost, language)} ${labels.decidedOffers}`,
    },
    {
      key: 'offers',
      label: labels.offers,
      value: formatInt(kpi.offers, language),
      accent: 'var(--accent-hrs)',
      current: kpi.offers,
      previous: previousKpi?.offers ?? null,
      hint:
        kpi.avgTonsPerOffer !== null
          ? `⌀ ${formatTons(kpi.avgTonsPerOffer, language)} t`
          : undefined,
    },
    {
      key: 'clients',
      label: labels.clients,
      value: formatInt(kpi.clients, language),
      accent: 'var(--accent-pickled)',
      current: kpi.clients,
      previous: previousKpi?.clients ?? null,
      hint: `${formatInt(kpi.clientsWon, language)} ${DECISION_ICON.won}`,
    },
    {
      key: 'value',
      label: labels.valueOffered,
      value: formatMoneyShort(money, language),
      unit: CURRENCY_UNIT[currency],
      accent: 'var(--accent-teardrop)',
      current: money,
      previous: moneyPrev,
    },
    {
      key: 'margin',
      label: labels.avgMargin,
      value: formatPct(kpi.avgMarginPct, language),
      accent: 'var(--accent-zm)',
      current: kpi.avgMarginPct ?? 0,
      previous: previousKpi?.avgMarginPct ?? null,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {tiles.map((tile) => (
        <KpiTile
          key={tile.key}
          tile={tile}
          language={language}
          labels={labels}
          onFilterDecision={onFilterDecision}
        />
      ))}
    </div>
  );
}

interface KpiTileProps {
  tile: Tile;
  language: Language;
  labels: KpiTilesProps['labels'];
  onFilterDecision?: (decision: ClientDecision) => void;
}

function KpiTile({ tile, language, labels, onFilterDecision }: KpiTileProps) {
  const delta = computeDelta(tile.current, tile.previous);
  const deltaText = formatDelta(delta, language);

  // Up is not automatically good: more lost tonnage is worse. Only the tiles where a rise is
  // genuinely an improvement get the positive colour, and the arrow always states the
  // direction in text as well, so the reading never rests on colour.
  const risingIsGood = tile.key !== 'tonsLost';
  const deltaColor =
    delta.direction === 'flat'
      ? 'var(--text-secondary)'
      : (delta.direction === 'up') === risingIsGood
        ? 'var(--accent-hdg)'
        : 'var(--accent-sum)';
  const arrow = delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '·';

  const isClickable = Boolean(tile.filterDecision && onFilterDecision);
  const Tag = isClickable ? 'button' : 'div';

  return (
    <Tag
      {...(isClickable
        ? {
            type: 'button' as const,
            onClick: () => onFilterDecision!(tile.filterDecision!),
            title: labels.vsPrevious,
          }
        : {})}
      className={`text-left bg-[var(--bg-card)] border border-[var(--border)] rounded-md p-4 transition-colors ${
        isClickable ? 'hover:border-[var(--border-hi)] cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: tile.accent }}
        />
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-mono truncate">
          {tile.label}
        </p>
      </div>

      <p className="mt-2 flex items-baseline gap-1">
        {tile.icon && (
          <span aria-hidden className="text-[13px]" style={{ color: tile.accent }}>
            {tile.icon}
          </span>
        )}
        <span
          className="text-2xl font-semibold font-mono tabular-nums"
          style={{ color: 'var(--text-primary)' }}
        >
          {tile.value}
        </span>
        {tile.unit && (
          <span className="text-[11px] font-mono text-[var(--text-secondary)]">{tile.unit}</span>
        )}
      </p>

      <p className="mt-1.5 flex items-center gap-1.5 text-[10px] font-mono">
        {deltaText ? (
          <>
            <span style={{ color: deltaColor }}>
              {arrow} {deltaText}
            </span>
            <span className="text-[var(--text-muted)] truncate">{labels.vsPrevious}</span>
          </>
        ) : (
          <span className="text-[var(--text-muted)]">{labels.noComparison}</span>
        )}
      </p>

      {tile.hint && (
        <p className="mt-1 text-[10px] font-mono text-[var(--text-muted)] truncate">{tile.hint}</p>
      )}
    </Tag>
  );
}
