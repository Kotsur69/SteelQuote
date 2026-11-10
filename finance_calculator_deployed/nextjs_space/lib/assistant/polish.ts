// Polish name matching for find_people / find_clients (docs/ai-assistant-plan.md section 4).
//
// Users write "oferty Marka", "dla Stalprofilu", "od Anny Kowalskiej", often without diacritics
// ("lukasz zak"). The database has no `unaccent`, so matching happens here, in JS, over the
// (small, already visibility-scoped) candidate list:
//   1. both sides are lower-cased and stripped of diacritics,
//   2. every word is reduced to a crude stem (case endings dropped, the fleeting "e" removed:
//      Marek / Marka / Markowi -> "mark"),
//   3. EVERY query word has to match some word of the candidate.
// The result is always a list of candidates - the caller turns 2+ into clarification buttons
// (plan rule 3.8), so an over-eager stem can cost a question but never a wrong answer.

const DIACRITICS: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
};

/** Lower-case, Polish diacritics folded, any other combining mark removed. */
export function foldDiacritics(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => DIACRITICS[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Legal-form noise in company names: "Stalprofil Sp. z o.o." must match "Stalprofil".
const LEGAL_WORDS = new Set(['sp', 'z', 'o', 'oo', 'sa', 'sc', 'sj', 'j', 'k', 'spk', 'spolka', 'gmbh', 'sro', 'as', 'ltd']);

/** Words of a name: folded, split on anything that is not a letter or digit. */
export function nameTokens(text: string, dropLegal = false): string[] {
  const tokens = foldDiacritics(text).split(/[^a-z0-9]+/).filter(Boolean);
  if (!dropLegal) return tokens;
  const kept = tokens.filter((t) => !LEGAL_WORDS.has(t));
  // A name made only of such words ("SA") keeps them, or it would match nothing.
  return kept.length > 0 ? kept : tokens;
}

// Longest first, so "-owi" wins over "-i". Covers the cases people actually type for names:
// genitive (Marka, Anny, Kowalskiej, Wiśniewskiego), dative (Markowi), instrumental (Markiem,
// Anną), locative (Stalprofilu, Marku), and nominative -a / -ia / -i / -y.
const SUFFIXES = [
  'iego', 'owie', 'ach', 'ami', 'ego', 'iej', 'iem', 'owi', 'ej', 'em', 'ia', 'ie', 'om',
  'a', 'e', 'i', 'u', 'y',
];
const MIN_STEM = 3;
const isVowel = (ch: string) => 'aeiouy'.includes(ch);

/** Crude stem of one folded word. Deliberately aggressive - see the note at the top. */
export function stem(token: string): string {
  let out = token;
  for (const suffix of SUFFIXES) {
    if (out.endsWith(suffix) && out.length - suffix.length >= MIN_STEM) {
      out = out.slice(0, -suffix.length);
      break;
    }
  }
  // Fleeting vowel: Marek -> Marka, Żurawiec -> Żurawca, Paweł -> Pawła. Dropping the "(i)e"
  // in front of a final consonant makes the nominative and the inflected forms meet.
  const m = /^(.*[^aeiouy])(ie|e)([^aeiouy])$/.exec(out);
  if (m && (m[1] + m[3]).length >= MIN_STEM) out = m[1] + m[3];
  // Trailing soft "i" left by the suffix pass (odlewni|a -> odlewn).
  if (out.length > MIN_STEM && out.endsWith('i') && !isVowel(out[out.length - 2])) out = out.slice(0, -1);
  return out;
}

/** Edit distance, capped: false as soon as the words are further apart than `max`. */
function withinDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = row[0];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/** How well one query word matches one candidate word: 3 exact, 2 same stem, 1 prefix / typo. */
function tokenScore(query: string, candidate: string): number {
  if (query === candidate) return 3;
  if (stem(query) === stem(candidate)) return 2;
  if (query.length >= 3 && candidate.startsWith(query)) return 1;
  // One typo is forgiven only on longer words; on short ones it would match half the list.
  if (query.length >= 5 && withinDistance(query, candidate, 1)) return 1;
  return 0;
}

export interface NameMatch<T> {
  item: T;
  /** Higher is better; comparable only within one matchNames call. */
  score: number;
  /** Every word of the candidate name was matched (the query names it in full). */
  full: boolean;
}

/**
 * Candidates whose name matches EVERY word of the query, best first.
 * `dropLegal` ignores company legal forms on both sides (client names).
 */
export function matchNames<T>(
  query: string,
  items: readonly T[],
  nameOf: (item: T) => string,
  dropLegal = false
): NameMatch<T>[] {
  const queryTokens = nameTokens(query, dropLegal);
  if (queryTokens.length === 0) return [];

  const matches: NameMatch<T>[] = [];
  for (const item of items) {
    const candidateTokens = nameTokens(nameOf(item), dropLegal);
    const used = new Set<number>();
    let score = 0;
    let ok = true;
    for (const q of queryTokens) {
      let best = 0;
      let bestIndex = -1;
      candidateTokens.forEach((c, i) => {
        if (used.has(i)) return;
        const s = tokenScore(q, c);
        if (s > best) {
          best = s;
          bestIndex = i;
        }
      });
      if (best === 0) {
        ok = false;
        break;
      }
      used.add(bestIndex);
      score += best;
    }
    if (ok) matches.push({ item, score, full: used.size === candidateTokens.length });
  }

  return matches.sort((a, b) => Number(b.full) - Number(a.full) || b.score - a.score);
}

/**
 * The candidates worth showing: when the query names someone in full ("Marek Nowak"), partial
 * hits are noise; otherwise ("Marek") every match stays and the user picks.
 */
export function bestMatches<T>(matches: NameMatch<T>[]): NameMatch<T>[] {
  const full = matches.filter((m) => m.full);
  return full.length > 0 ? full : matches;
}
