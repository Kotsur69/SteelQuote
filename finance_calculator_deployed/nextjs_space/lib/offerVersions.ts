// Etykieta numeru oferty i grupowanie wersji na listach (moje oferty / senior / admin).
// Wersja NIE zmienia realnego, liczbowego `id` wiersza (to nadal zwykly SERIAL, potrzebny
// do routingu i FK) - `root_offer_id` + `version_number` sluza wylacznie do wyliczenia
// etykiety typu "offer_30.2" i do zgrupowania rodziny ofert na liscie.
export interface VersionedOffer {
  id: number;
  root_offer_id: number | null;
  version_number: number;
}

export function offerNumberLabel(offer: VersionedOffer): string {
  const rootId = offer.root_offer_id ?? offer.id;
  return offer.version_number > 0 ? `offer_${rootId}.${offer.version_number}` : `offer_${rootId}`;
}

export interface OfferVersionGroup<T extends VersionedOffer> {
  // Najnowszy wpis rodziny (najwyzszy version_number) - to on jest "aktywna" oferta,
  // ktora widac jako glowna karte na liscie.
  primary: T;
  // Starsze wpisy tej samej rodziny (w tym oryginal, version_number = 0), od najnowszego
  // do najstarszego - to one chowaja sie pod rozwijanym "poprzednie wersje".
  history: T[];
}

// Zaklada, ze `offers` jest juz w docelowej kolejnosci wyswietlania (np. po sortowaniu) -
// kolejnosc grup podaza za pierwszym wystapieniem dowolnego czlonka rodziny w tej tablicy.
//
// Grupowanie po `root_offer_id ?? id` dziala nawet, gdy sam korzen NIE jest widoczny w
// przekazanej liscie (np. senior widzi tylko wersje w pending_review, a szkic-korzen do
// niego nie nalezy) - wersje i tak trafiaja do wspolnej rodziny.
export function groupOffersByVersion<T extends VersionedOffer>(offers: T[]): OfferVersionGroup<T>[] {
  const order: number[] = [];
  const families = new Map<number, T[]>();

  for (const o of offers) {
    const key = o.root_offer_id ?? o.id;
    let members = families.get(key);
    if (!members) {
      members = [];
      families.set(key, members);
      order.push(key);
    }
    members.push(o);
  }

  return order.map((key) => {
    const members = [...families.get(key)!].sort((a, b) => b.version_number - a.version_number);
    const [primary, ...history] = members;
    return { primary, history };
  });
}
