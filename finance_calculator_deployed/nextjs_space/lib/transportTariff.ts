// Cennik transportowy: odległość drogowa -> koszt -> €/t doliczane do ceny pozycji.
//
// Ten plik jest CZYSTY (żadnego I/O, żadnego Reacta) — to jedyne miejsce, gdzie żyje
// matematyka transportu, dzięki czemu kalkulator, API zapisu oferty i eksporty liczą
// dokładnie to samo.
//
// Model kosztu (decyzja usera 2026-09-10, patrz migrations/020_transport_tariff.sql):
//   trucks = ceil(tonyOferty / ładowność)   — nawet 1 t to CAŁA ciężarówka
//   koszt  = trucks * (stawkaPasma(km) + dopłatyPonadgabarytowe)
//   €/t    = koszt / tonyOferty / kursEurPln
//
// Stawki są w PLN (tak kwotuje je przewoźnik). EUR jest walutą silnika, więc przeliczenie
// dzieje się na samym końcu i jest zamrażane w ofercie razem z kursem.

export interface TariffBand {
  /** Dolna granica pasma w km — służy do wyświetlania i walidacji ciągłości, nie do dopasowania. */
  fromKm: number;
  /** Górna granica pasma w km włącznie. null = "i wszystko powyżej" (ostatnie pasmo). */
  toKm: number | null;
  /** Ryczałt za ciężarówkę w PLN. Dokładnie jedno z flatPln/perKmPln jest niepuste. */
  flatPln: number | null;
  /** Stawka kilometrowa w PLN/km. */
  perKmPln: number | null;
}

/** Cennik AMSteel (wysyłka z Krakowa) — używany, dopóki admin go nie zmieni w Ustawieniach. */
export const DEFAULT_TARIFF_BANDS: TariffBand[] = [
  { fromKm: 0, toKm: 100, flatPln: 1344, perKmPln: null },
  { fromKm: 100, toKm: 223, flatPln: 1680, perKmPln: null },
  { fromKm: 223, toKm: 350, flatPln: null, perKmPln: 7.5 },
  { fromKm: 350, toKm: null, flatPln: null, perKmPln: 6.5 },
];

export const DEFAULT_TRUCK_CAPACITY_T = 21;
export const DEFAULT_ORIGIN_ADDRESS = 'Kraków, Polska';
export const DEFAULT_OVERSIZE_LONG_PLN = 250;

/** Powyżej tej długości elementu (w metrach) dochodzi ryczałtowa dopłata. */
export const OVERSIZE_LONG_FROM_M = 13.6;
/** Powyżej tej długości (lub 2,4 m szerokości) przewoźnik wycenia indywidualnie. */
export const OVERSIZE_MANUAL_FROM_M = 15.1;
export const OVERSIZE_MANUAL_WIDTH_M = 2.4;

/**
 * Pasmo dla danej odległości: PIERWSZE (rosnąco) pasmo, które mieści km w swojej górnej
 * granicy. Celowo nie patrzymy na fromKm — przy dopasowaniu po obu granicach literówka
 * admina (dziura 223,5 km albo nachodzące pasma) dawałaby "brak stawki" zamiast ceny.
 * Ostatnie pasmo z toKm = null łapie wszystko, co zostało.
 */
export function findBand(distanceKm: number, bands: TariffBand[]): TariffBand | null {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
  const sorted = [...bands].sort((a, b) => a.fromKm - b.fromKm);
  for (const band of sorted) {
    if (band.toKm === null || distanceKm <= band.toKm) return band;
  }
  return null;
}

/** Cena przewozu JEDNEJ ciężarówki na daną odległość, w PLN. null = brak pasma w cenniku. */
export function pricePerTruckPln(distanceKm: number, bands: TariffBand[]): number | null {
  const band = findBand(distanceKm, bands);
  if (!band) return null;
  if (band.flatPln !== null) return band.flatPln;
  if (band.perKmPln !== null) return round2(distanceKm * band.perKmPln);
  return null;
}

export interface TransportInput {
  distanceKm: number;
  /** Suma ton CAŁEJ oferty (zestawienie + pozycja w edycji) — transport jest per oferta. */
  totalTons: number;
  truckCapacityT: number;
  bands: TariffBand[];
  /** Elementy 13,6-15,1 m: ryczałtowa dopłata do każdej ciężarówki. */
  hasLongElements: boolean;
  oversizeLongPln: number;
  eurPlnRate: number;
}

export interface TransportBreakdown {
  trucks: number;
  pricePerTruckPln: number;
  oversizePerTruckPln: number;
  totalPln: number;
  /** To trafia do stanu kalkulatora jako `transport` i wchodzi do ceny końcowej. */
  eurPerTon: number;
}

/**
 * Pełne wyliczenie transportu. Zwraca null, gdy danych nie da się użyć (brak pasma,
 * zerowy tonaż, niedodatnia ładowność) — wołający ma wtedy pokazać ręczne wpisanie
 * kwoty zamiast po cichu doliczyć 0.
 */
export function computeTransport(input: TransportInput): TransportBreakdown | null {
  const { distanceKm, totalTons, truckCapacityT, bands, hasLongElements, oversizeLongPln, eurPlnRate } = input;

  if (!Number.isFinite(totalTons) || totalTons <= 0) return null;
  if (!Number.isFinite(truckCapacityT) || truckCapacityT <= 0) return null;
  if (!Number.isFinite(eurPlnRate) || eurPlnRate <= 0) return null;

  const perTruck = pricePerTruckPln(distanceKm, bands);
  if (perTruck === null) return null;

  // Nawet ułamek ładowności to cała ciężarówka — klient płaci za komplet.
  const trucks = Math.ceil(totalTons / truckCapacityT);
  const oversizePerTruck = hasLongElements ? Math.max(0, oversizeLongPln) : 0;
  const totalPln = round2(trucks * (perTruck + oversizePerTruck));

  return {
    trucks,
    pricePerTruckPln: perTruck,
    oversizePerTruckPln: oversizePerTruck,
    totalPln,
    eurPerTon: round2(totalPln / totalTons / eurPlnRate),
  };
}

/**
 * Czy wymiary pozycji same z siebie wymuszają wycenę indywidualną. Pola kalkulatora są
 * w mm i w praktyce nie sięgają 13,6 m (tabela dopłat długościowych HRS kończy się na
 * 12 300 mm), więc handlowiec i tak zaznacza ponadgabaryt ręcznie — ta funkcja jest
 * siatką bezpieczeństwa na wypadek nietypowej pozycji, nie głównym mechanizmem.
 */
export function dimensionsRequireManualQuote(lengthMm: number, widthMm: number): boolean {
  return lengthMm / 1000 > OVERSIZE_MANUAL_FROM_M || widthMm / 1000 > OVERSIZE_MANUAL_WIDTH_M;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
