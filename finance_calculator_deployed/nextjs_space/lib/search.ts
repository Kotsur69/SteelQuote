// W ILIKE znaki % i _ to wildcardy: % = dowolny ciag, _ = dowolny JEDEN znak.
// Handlowiec wpisujacy je w wyszukiwarke ma na mysli zwykle znaki, nie wzorzec.
//
// Bez tego:
//   "offer_14" pasowaloby takze do "offerA14" (podkreslenie = dowolny znak),
//   a wlasnie tak wygladaja NASZE nazwy zastepcze,
//   "10%" pasowaloby do wszystkiego, co zawiera "10".
//
// Backslash to domyslny znak ucieczki w Postgresie, wiec wystarczy poprzedzic nim
// kazdy znak specjalny. Sam backslash tez trzeba uciec, dlatego jest w klasie.
//
// Uwaga: ta sama (uciekniona) fraza idzie tez do porownania z ID (o.id::text = $n).
// To bezpieczne — ucieczka zmienia tylko frazy ze znakami specjalnymi, a te i tak
// nigdy nie sa rowne samym cyfrom ID.
export function escapeLikePattern(phrase: string): string {
  return phrase.replace(/[\\%_]/g, (char) => `\\${char}`);
}
