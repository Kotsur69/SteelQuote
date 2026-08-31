// Colours for the analytics charts.
//
// Every colour here is a `var(--accent-*)` reference, not a hex literal, so a series is
// painted with the exact same custom property the rest of the app uses for that thing - a
// steel type keeps its settings-panel colour, and light / dark / high-contrast all follow
// lib/themeVars.ts with no second palette to keep in sync. SVG `fill`/`stroke` resolve
// var() the same way any other CSS property does.
//
// Colour identity follows the ENTITY, never its rank: HDG is green whether it is the first
// or the last series on the chart, and filtering a series out never repaints the survivors.
//
// Palette validation (dataviz six-checks, adjacent pairs, surfaces #1e2333 dark / #ffffff
// light) on the six steel accents:
//   - CVD separation      PASS  worst adjacent deltaE 15.7 (deutan), tritan 10.2
//   - Normal-vision floor PASS  worst adjacent deltaE 15.9
//   - Chroma floor        PASS
//   - Lightness band      dark mode: HRS/HDG/TEARDROP sit at L 0.75 against a 0.48-0.67
//                         band - deliberately kept, because these are the app's own accents
//                         and contrast against the dark surface passes at >= 3:1 anyway.
//   - Contrast vs surface light mode: those same three land at 2.1-2.2:1, which obliges
//                         relief - provided by the always-present legend, the direct labels
//                         on <= 4 series, and the table view every panel can switch to.
// The 15.7 figure is what STEEL_TYPE_SERIES_ORDER buys: re-ordering the series (and nothing
// else) lifted the worst adjacent pair from 10.6 without altering a single hue.

import type { SteelType } from './calculatorData';
import type { ClientDecision, OfferStatus } from './analytics';

export const STEEL_TYPE_COLOR: Record<SteelType, string> = {
  HRS: 'var(--accent-hrs)',
  CR: 'var(--accent-cr)',
  HDG: 'var(--accent-hdg)',
  PICKLED: 'var(--accent-pickled)',
  TEARDROP: 'var(--accent-teardrop)',
  ZM: 'var(--accent-zm)',
};

// Same mapping the status badges use on the offers list and the admin dashboard.
export const STATUS_COLOR: Record<OfferStatus, string> = {
  draft: 'var(--text-secondary)',
  pending_review: 'var(--accent-hrs)',
  approved: 'var(--accent-hdg)',
  rejected: 'var(--accent-sum)',
  sent: 'var(--accent-cr)',
};

// Won / lost is a polarity, so it gets a two-pole treatment with a neutral middle, and it
// reuses the reserved status greens and reds rather than a categorical hue. Never colour
// alone: DECISION_ICON travels with it everywhere.
export const DECISION_COLOR: Record<ClientDecision, string> = {
  won: 'var(--accent-hdg)',
  lost: 'var(--accent-sum)',
  pending: 'var(--text-muted)',
};

export const DECISION_ICON: Record<ClientDecision, string> = {
  won: '✔',
  lost: '✖',
  pending: '…',
};

// Fixed order for dimensions with no colour of their own (salespeople, clients). Assigned by
// position and never cycled - the 8th entry onwards folds into "Other" instead.
export const CATEGORICAL_SERIES: string[] = [
  'var(--accent-pickled)',
  'var(--accent-hrs)',
  'var(--accent-teardrop)',
  'var(--accent-cr)',
  'var(--accent-hdg)',
  'var(--accent-zm)',
  'var(--accent-sum)',
];

export const OTHER_COLOR = 'var(--text-muted)';

/** Colour for slot `index` of a categorical dimension. Out of range = the "Other" grey. */
export function categoricalColor(index: number): string {
  return CATEGORICAL_SERIES[index] ?? OTHER_COLOR;
}

// Recessive chrome: the grid and axes must never compete with the marks.
export const GRID_COLOR = 'var(--border)';
export const AXIS_COLOR = 'var(--text-muted)';
export const TICK_COLOR = 'var(--text-secondary)';
export const SURFACE_COLOR = 'var(--bg-card)';

// Fill opacity for area/stacked marks. Low enough for the grid to stay visible through it,
// high enough for the hue to remain identifiable.
export const AREA_FILL_OPACITY = 0.18;
export const BAR_FILL_OPACITY = 0.85;

// A 2px surface-coloured gap between adjacent fills keeps stacked segments from bleeding
// into one another.
export const SEGMENT_STROKE_WIDTH = 2;
export const LINE_STROKE_WIDTH = 2;
export const DOT_RADIUS = 4;
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
