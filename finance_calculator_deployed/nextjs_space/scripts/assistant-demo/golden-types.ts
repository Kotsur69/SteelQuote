// Shape of tests/assistant/golden.json (written by build-golden.ts, read by the phase 1 eval).

export type Group =
  | 'aggregate' | 'comparison' | 'ranking' | 'lookup' | 'knowledge'
  | 'ambiguity' | 'out_of_scope' | 'permission' | 'injection' | 'action';

export interface GoldenCase {
  id: string;
  group: Group;
  lang: 'pl' | 'en';
  /** Asker key from visibility.ts. */
  asker: string;
  question: string;
  expect: {
    behavior: 'answer' | 'clarify' | 'refuse' | 'propose';
    /** Tool the assistant must call (first relevant call). */
    tool?: string;
    params?: Record<string, unknown>;
    /** Values that must appear in the answer (number guard + table). null = "brak danych". */
    numbers?: Record<string, number | null>;
    /** Offer ids that must be listed (lookups) or acted on (actions). */
    offerIds?: number[];
    /** Clarification buttons that must be offered (labels, any order). */
    options?: string[];
    /** Phrases the answer must contain (knowledge facts), case-insensitive. */
    mustContain?: string[];
    /** Strings that must NOT appear (leaks, executed actions, invented data). */
    mustNotContain?: string[];
    note?: string;
  };
}
