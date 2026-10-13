// Silnik cenowy — jedyne źródło prawdy dla wzoru PGL + Σ Huta + marża + Σ SSC.
//
// Kalkulator (components/Calculator.tsx) woła te same funkcje na żywo, co migracja
// przeterminowanego PGL (patrz Calculator.tsx: staleOfferPglCheck w loadOffer()) —
// dzięki temu przeliczona pozycja NIGDY nie może dać innego wyniku niż ten sam zestaw
// danych wpisany ręcznie w kalkulatorze. Wszystkie funkcje są czyste (bez stanu/efektów),
// żeby dało się je bezpiecznie odpalić poza komponentem Reacta (np. w pętli po zestawieniu).
//
// Every number comes from the price book passed in (lib/priceBook.ts); band boundaries stay
// in code. With DEFAULT_PRICE_BOOK the results are identical to the pre-price-book engine
// (tests/priceBook.test.ts compares against a frozen copy of it).
import type { SteelType, ItemInputs, Grade } from './calculatorData';
import type { AppSettings } from './currency';
import {
  DIMENSION_BANDS,
  COATING_BANDS,
  BASE_LENGTH_BANDS,
  BASE_WIDTH_BANDS,
  BASE_LENGTH_TYPES,
  PICKLING_BANDS,
  TEARDROP_BANDS,
  VALUE_COL,
  bookCell,
  scalarValue,
  findGrade,
  type PriceBook,
} from './priceBook';

export function getDimensionSurcharge(book: PriceBook, type: SteelType, th: number, w: number): number | null {
  for (const band of DIMENSION_BANDS[type] ?? DIMENSION_BANDS.HRS) {
    if (th >= band.thicknessMin && th <= band.thicknessMax &&
        w >= band.widthMin && w <= band.widthMax) {
      return bookCell(book, type, 'dimension', band.rowKey, band.colKey) ?? band.value;
    }
  }
  return null;
}

// null = the coating class is not available for this thickness (empty cell in the matrix).
export function getCoatingSurcharge(book: PriceBook, type: SteelType, th: number, coating: string): number | null {
  for (const band of COATING_BANDS[type] ?? []) {
    if (th >= band.thMin && th <= band.thMax) {
      const fallback = band.defaults[coating];
      if (typeof fallback !== 'number') return null;
      return bookCell(book, type, 'coating', band.rowKey, coating) ?? fallback;
    }
  }
  return null;
}

export function getPicklingSurcharge(book: PriceBook, type: SteelType, th: number): number | null {
  for (const band of PICKLING_BANDS) {
    if (th >= band.thMin && th <= band.thMax) {
      return bookCell(book, type, 'pickling', band.rowKey, VALUE_COL) ?? band.value;
    }
  }
  return null;
}

function lengthColumn(len: number): string | null {
  if (len >= 650 && len <= 999) return 'l1';
  if (len >= 1000 && len <= 1999) return 'l2';
  if (len >= 2000 && len <= 6000) return 'l3';
  if (len >= 6001 && len <= 8999) return 'l4';
  if (len >= 9000 && len <= 12300) return 'l5';
  return null;
}

function widthColumn(w: number): string | null {
  if (w < 299) return 'w1';
  if (w >= 300 && w <= 599) return 'w2';
  if (w >= 600 && w <= 899) return 'w3';
  if (w >= 900 && w <= 1500) return 'w4';
  if (w > 1500) return 'w5';
  return null;
}

export function getBaseLengthSurcharge(book: PriceBook, type: SteelType, th: number, len: number): number | null {
  for (const band of BASE_LENGTH_BANDS) {
    if (th >= band.thMin && th <= band.thMax) {
      const col = lengthColumn(len);
      if (col === null) return null;
      return bookCell(book, type, 'baseLength', band.rowKey, col) ?? band.defaults[col];
    }
  }
  return null;
}

export function getBaseWidthSurcharge(book: PriceBook, type: SteelType, th: number, w: number): number | null {
  for (const band of BASE_WIDTH_BANDS) {
    if (th >= band.thMin && th <= band.thMax) {
      const col = widthColumn(w);
      if (col === null) return null;
      return bookCell(book, type, 'baseWidth', band.rowKey, col) ?? band.defaults[col];
    }
  }
  return null;
}

export function computeCoatingSurcharge(book: PriceBook, type: SteelType, thickness: number, selectedCoating: string): number {
  if (type !== 'HDG' && type !== 'ZM') return 0;
  return getCoatingSurcharge(book, type, thickness, selectedCoating) || 0;
}

export function computePicklingSurcharge(book: PriceBook, type: SteelType, thickness: number): number {
  if (type !== 'PICKLED') return 0;
  return getPicklingSurcharge(book, type, thickness) || 0;
}

// Dopłata Łezka (TEARDROP) wg szerokości taśmy. Above the last band -> the editable
// "over 2050" fallback; a width falling between bands takes the first band's rate.
export function computeTeardropSurcharge(book: PriceBook, type: SteelType, width: number): number {
  if (type !== 'TEARDROP') return 0;
  for (const band of TEARDROP_BANDS) {
    if (width >= band.widthMin && width <= band.widthMax) {
      return bookCell(book, type, 'teardrop', band.rowKey, VALUE_COL) ?? band.value;
    }
  }
  const last = TEARDROP_BANDS[TEARDROP_BANDS.length - 1];
  if (width > last.widthMax) return scalarValue(book, type, 'teardropOver2050');
  const first = TEARDROP_BANDS[0];
  return bookCell(book, type, 'teardrop', first.rowKey, VALUE_COL) ?? first.value;
}

// Raw table value, null when outside the table (the calculator then shows a warning).
export function getBaseSurchargeRaw(book: PriceBook, type: SteelType, thickness: number, width: number, length: number): number | null {
  return BASE_LENGTH_TYPES.includes(type)
    ? getBaseLengthSurcharge(book, type, thickness, length)
    : getBaseWidthSurcharge(book, type, thickness, width);
}

// Dopłata bazowa SSC — 0 dla kręgów (isCoilMode), edytowalny fallback (domyślnie 29), gdy
// wymiary są poza tabelą.
export function computeBaseSurcharge(
  book: PriceBook,
  type: SteelType,
  thickness: number,
  width: number,
  length: number,
  isCoilMode: boolean
): number {
  if (isCoilMode) return 0;
  return getBaseSurchargeRaw(book, type, thickness, width, length) ?? scalarValue(book, type, 'baseFallback');
}

export function hasYieldSurcharge(book: PriceBook, type: SteelType, gradeName: string): boolean {
  return findGrade(book, type, gradeName)?.hasYieldSurcharge === true;
}

export function computeYieldValue(book: PriceBook, type: SteelType, gradeName: string): number {
  return hasYieldSurcharge(book, type, gradeName) ? scalarValue(book, type, 'yieldAmount') : 0;
}

export function gradeValueFor(book: PriceBook, type: SteelType, gradeName: string): number {
  return findGrade(book, type, gradeName)?.surcharge ?? 0;
}

// Grade surcharge for a live calculator selection: a grade from the book (active or retired)
// is priced from the book; a one-time grade keeps the value typed in for it.
export function effectiveGradeValue(book: PriceBook, type: SteelType, grade: Grade | null): number {
  if (!grade) return 0;
  return findGrade(book, type, grade.name)?.surcharge ?? grade.value;
}

type SurchargeToggles = Pick<
  ItemInputs,
  | 'crZabezp' | 'crOpak' | 'crPowierz' | 'crWykon' | 'crZgrzew'
  | 'hdgZabezp' | 'hdgOpak' | 'hdgPowierz' | 'hdgWykon' | 'hdgZgrzew'
  | 'zmZabezp' | 'zmOpak' | 'zmPowierz' | 'zmZgrzew'
>;

// Σ Huta — dopłaty niezależne od PGL (wymiar, gatunek, tolerancja, certyfikat, powłoka,
// trawienie, łezka i dopłaty zabezpieczenie/opakowanie/powierzchnia/wykończenie/zgrzew).
export function computeSumaHuta(
  book: PriceBook,
  type: SteelType,
  thickness: number,
  width: number,
  tolThick: number,
  cert: number,
  gradeValue: number,
  selectedCoating: string,
  toggles: SurchargeToggles
): number {
  const dim = getDimensionSurcharge(book, type, thickness, width);
  const effectiveDim = dim !== null ? dim : 0;
  const coatingSurcharge = computeCoatingSurcharge(book, type, thickness, selectedCoating);
  const picklingSurcharge = computePicklingSurcharge(book, type, thickness);
  const teardropSurcharge = computeTeardropSurcharge(book, type, width);

  let crExtra = 0;
  if (type === 'CR') {
    crExtra = toggles.crZabezp + toggles.crOpak + toggles.crPowierz + toggles.crWykon + toggles.crZgrzew;
  } else if (type === 'HDG') {
    crExtra = toggles.hdgZabezp + toggles.hdgOpak + toggles.hdgPowierz + toggles.hdgWykon + toggles.hdgZgrzew;
  } else if (type === 'ZM') {
    crExtra = toggles.zmZabezp + toggles.zmOpak + toggles.zmPowierz + toggles.zmZgrzew;
  }

  return 0 + effectiveDim + gradeValue + tolThick + cert + coatingSurcharge + crExtra
    + picklingSurcharge + teardropSurcharge;
}

type SscToggles = Pick<
  ItemInputs,
  'sscLenTol' | 'sscFlatness' | 'sscSurface' | 'sscMaxWeight' | 'sscMarking' | 'sscEdging' | 'sscPacking' | 'sscLabels'
>;

// Σ SSC — jedyny człon zależny od PGL to złom (scrapAmount = % ceny wsadu = PGL + Σ Huta),
// więc to jedyna część Σ SSC, która realnie się zmienia przy migracji przeterminowanego PGL.
export function computeSumaSSC(
  book: PriceBook,
  type: SteelType,
  thickness: number,
  width: number,
  length: number,
  isCoilMode: boolean,
  gradeName: string,
  cenaWsadu: number,
  scrapPct: number,
  toggles: SscToggles
): { sumaSSC: number; scrapAmount: number } {
  const scrapAmount = Math.round(cenaWsadu * (scrapPct / 100));
  if (isCoilMode) return { sumaSSC: 0, scrapAmount: 0 };

  const baseSurcharge = computeBaseSurcharge(book, type, thickness, width, length, isCoilMode);
  const yieldValue = computeYieldValue(book, type, gradeName);
  const sumaSSC = baseSurcharge + toggles.sscLenTol + toggles.sscFlatness + toggles.sscSurface +
    toggles.sscMaxWeight + toggles.sscMarking + toggles.sscEdging + yieldValue +
    toggles.sscPacking + toggles.sscLabels + scrapAmount;
  return { sumaSSC, scrapAmount };
}

export function computeCenaKoncowa(
  cenaWsadu: number,
  marginPct: number,
  extra: number,
  transport: number,
  sumaSSC: number
): { marzaNetto: number; cenaKoncowa: number } {
  const marzaNetto = cenaWsadu * (marginPct / 100);
  const cenaKoncowa = cenaWsadu + marzaNetto + extra + transport + sumaSSC;
  return { marzaNetto, cenaKoncowa };
}

// Kształt wystarczający do przeliczenia pozycji zestawienia — celowo NIE importuje
// ZestawienieItem z components/Calculator.tsx (uniknięcie cyklu importów silnik <-> UI);
// każdy prawdziwy ZestawienieItem spełnia ten kształt strukturalnie.
export interface RecomputableItem {
  type: SteelType;
  thickness: number;
  width: number;
  length: number;
  grade: string;
  tons: number;
  isCoil?: boolean;
  inputs?: ItemInputs;
}

export interface RecomputedItemPricing {
  pgl: number;
  sumaHuta: number;
  sumaSSC: number;
  marza: number;
  finalPrice: number;
  totalValue: number;
}

/**
 * Przelicza pozycję zestawienia pod NOWE pgl, zachowując dokładnie tę samą konfigurację
 * (wymiary, gatunek, dopłaty) co przy pierwotnym dodaniu — patrz item.inputs. The stored
 * option values and grade value are kept as saved (never re-resolved from the book); only
 * the lookups that are not stored on the item (dimension, coating, base, yield...) come
 * from `book`.
 * Zwraca `null` dla pozycji sprzed wprowadzenia ItemInputs (brak zapisanej konfiguracji =
 * brak możliwości bezpiecznego przeliczenia; UI ma wtedy tylko podmienić pgl i oznaczyć
 * pozycję do ręcznego przeglądu, patrz legacyStaleItems w Calculator.tsx).
 */
export function computeItemPricing(
  item: RecomputableItem,
  newPgl: number,
  settings: AppSettings,
  book: PriceBook
): RecomputedItemPricing | null {
  const inp = item.inputs;
  if (!inp) return null;

  const gradeValue = inp.selectedGrade ? inp.selectedGrade.value : gradeValueFor(book, item.type, item.grade);
  const sumaHuta = computeSumaHuta(
    book, item.type, item.thickness, item.width, inp.tolThick, inp.cert,
    gradeValue, inp.selectedCoating, inp
  );
  const cenaWsadu = newPgl + sumaHuta;
  const { sumaSSC } = computeSumaSSC(
    book, item.type, item.thickness, item.width, item.length, !!item.isCoil, item.grade,
    cenaWsadu, settings.scrapPct, inp
  );
  const { marzaNetto, cenaKoncowa } = computeCenaKoncowa(cenaWsadu, inp.marginPct, inp.extra, inp.transport, sumaSSC);
  const totalValue = Math.round(cenaKoncowa * item.tons * 100) / 100;

  return { pgl: newPgl, sumaHuta, sumaSSC, marza: marzaNetto, finalPrice: cenaKoncowa, totalValue };
}
