// Answer blocks: the structured parts of an assistant answer that the SERVER builds from tool
// results and the panel renders as-is (tables, offer cards, footer, clarification buttons).
// The model's prose never produces these - which is what keeps the data in an answer exact.
//
// Pure types, shared by the server tools and the browser components.

export interface TableBlock {
  type: 'table';
  title?: string;
  columns: string[];
  /** Pre-formatted cells; one array per row, same length as columns. */
  rows: string[][];
  /** Shown under the table when rows were cut: "5 z 12". */
  note?: string;
}

export interface OfferCard {
  id: number;
  name: string;
  client: string | null;
  owner: string | null;
  status: string;
  decision: string;
  tons: string;
  value: string;
  margin: string | null;
  created: string | null;
  /** Internal link to the offer in the calculator. */
  href: string;
}

export interface OffersBlock {
  type: 'offers';
  offers: OfferCard[];
  total: number;
}

export interface FooterLink {
  /** panel = /analytics deep link (plan 6.1), download = Excel export (D8). */
  kind: 'panel' | 'download';
  label: string;
  /** Internal path only - the panel refuses anything else. */
  href: string;
}

export interface FooterBlock {
  type: 'footer';
  lines: string[];
  links?: FooterLink[];
}

export interface ClarifyOption {
  label: string;
  /** Sent back as the user's next message when clicked. */
  value: string;
  /** Signed tool call the server runs for this choice (lib/assistant/tokens.ts). */
  followUp?: string;
}

export interface ClarifyBlock {
  type: 'clarify';
  options: ClarifyOption[];
}

export interface ChartPoint {
  label: string;
  /** null = nothing to compute for that bucket (drawn as a gap, never as zero). */
  value: number | null;
  /** The value formatted exactly as in the table. */
  text: string;
}

export interface ChartBlock {
  type: 'chart';
  /** bar for amounts and counts, line for rates and averages. */
  kind: 'bar' | 'line';
  title: string;
  points: ChartPoint[];
}

export interface FollowUpChip {
  label: string;
  /** Signed tool call; a chip never carries free text the model wrote. */
  followUp: string;
}

/** Proactive next steps (plan 6.2, D24): built by the server from the query that was run. */
export interface FollowUpsBlock {
  type: 'followups';
  question: string;
  chips: FollowUpChip[];
}

/** Same list as lib/assistant/actions/kinds.ts ACTION_KINDS (kept here so the browser bundle stays zod-free). */
export type ActionCardKind = 'draft' | 'edit' | 'duplicate' | 'submit' | 'send' | 'approve' | 'reject' | 'decision';

/**
 * A confirmation card (plan section 7): exactly what will happen if the user clicks confirm.
 * Built by the server from the checked proposal; the model never writes any of it. Confirm /
 * cancel post the token to /api/assistant/actions/<token>/(confirm|cancel).
 */
export interface ActionCardBlock {
  type: 'action';
  kind: ActionCardKind;
  title: string;
  /** Offer the card is about (absent for a new draft). */
  offer?: { name: string; href: string };
  /** Current -> new status, already worded for the UI. */
  transition?: { from: string; to: string };
  /** Label / value pairs, pre-formatted. */
  rows: [string, string][];
  /** Priced lines of a draft, or the changes of an edit. */
  table?: TableBlock;
  /** Things the user must know before confirming (one-time grade, defaults used, ...). */
  notes: string[];
  confirmLabel: string;
  token: string;
  /** ISO time after which the server refuses the card. */
  expiresAt: string;
}

export type AnswerBlock = TableBlock | OffersBlock | FooterBlock | ClarifyBlock | ChartBlock | FollowUpsBlock | ActionCardBlock;
