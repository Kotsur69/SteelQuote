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

export interface FooterBlock {
  type: 'footer';
  lines: string[];
}

export interface ClarifyBlock {
  type: 'clarify';
  /** Each option is sent back as the user's next message when clicked. */
  options: { label: string; value: string }[];
}

export type AnswerBlock = TableBlock | OffersBlock | FooterBlock | ClarifyBlock;
