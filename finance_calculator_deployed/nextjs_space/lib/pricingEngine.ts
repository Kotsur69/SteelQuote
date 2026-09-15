// Silnik cenowy — jedyne źródło prawdy dla wzoru PGL + Σ Huta + marża + Σ SSC.
//
// Kalkulator (components/Calculator.tsx) woła te same funkcje na żywo, co migracja
// przeterminowanego PGL (patrz Calculator.tsx: staleOfferPglCheck w loadOffer()) —
// dzięki temu przeliczona pozycja NIGDY nie może dać innego wyniku niż ten sam zestaw
// danych wpisany ręcznie w kalkulatorze. Wszystkie funkcje są czyste (bez stanu/efektów),
// żeby dało się je bezpiecznie odpalić poza komponentem Reacta (np. w pętli po zestawieniu).
import {
  GRADE_TABLES,
  DIMENSION_MATRIX_HRS,
  DIMENSION_MATRIX_CR,
  DIMENSION_MATRIX_HDG,
  DIMENSION_MATRIX_PICKLED,
  DIMENSION_MATRIX_TEARDROP,
  DIMENSION_MATRIX_ZM,
  COATING_MATRIX_HDG,
  COATING_MATRIX_ZM,
  LENGTH_SURCHARGE_HRS,
  BASE_SURCHARGE_CR_HDG,
  PICKLING_SURCHARGE,
  getTeardropSurcharge,
  YIELD_GRADES,
  type SteelType,
  type ItemInputs,
} from './calculatorData';
import type { AppSettings } from './currency';

function activeDimensionMatrix(type: SteelType) {
  switch (type) {
    case 'CR': return DIMENSION_MATRIX_CR;
    case 'HDG': return DIMENSION_MATRIX_HDG;
    case 'PICKLED': return DIMENSION_MATRIX_PICKLED;
    case 'TEARDROP': return DIMENSION_MATRIX_TEARDROP;
    case 'ZM': return DIMENSION_MATRIX_ZM;
    default: return DIMENSION_MATRIX_HRS;
  }
}

export function getDimensionSurcharge(type: SteelType, th: number, w: number): number | null {
  for (const row of activeDimensionMatrix(type)) {
    if (th >= row.thicknessMin && th <= row.thicknessMax &&
        w >= row.widthMin && w <= row.widthMax) {
      return row.value;
    }
  }
  return null;
}

export function getCoatingSurcharge(
  th: number,
  coating: string,
  matrix: typeof COATING_MATRIX_HDG | typeof COATING_MATRIX_ZM
): number | null {
  for (const row of matrix) {
    const thRange = row.th as { min: number; max: number };
    if (th >= thRange.min && th <= thRange.max) {
      const val = row[coating];
      return typeof val === 'number' ? val : null;
    }
  }
  return null;
}

export function getPicklingSurcharge(th: number): number | null {
  for (const row of PICKLING_SURCHARGE) {
    if (th >= row.thicknessMin && th <= row.thicknessMax) return row.value;
  }
  return null;
}

export function getBaseLengthSurchargeHRS(th: number, len: number): number | null {
  for (const row of LENGTH_SURCHARGE_HRS) {
    if (th >= row.thMin && th <= row.thMax) {
      if (len >= 650 && len <= 999) return row.l1;
      if (len >= 1000 && len <= 1999) return row.l2;
      if (len >= 2000 && len <= 6000) return row.l3;
      if (len >= 6001 && len <= 8999) return row.l4;
      if (len >= 9000 && len <= 12300) return row.l5;
      return null;
    }
  }
  return null;
}

export function getBaseSurchargeCRHDG(th: number, w: number): number | null {
  for (const row of BASE_SURCHARGE_CR_HDG) {
    if (th >= row.thMin && th <= row.thMax) {
      if (w < 299) return row.w1;
      if (w >= 300 && w <= 599) return row.w2;
      if (w >= 600 && w <= 899) return row.w3;
      if (w >= 900 && w <= 1500) return row.w4;
      if (w > 1500) return row.w5;
      return null;
    }
  }
  return null;
}

export function computeCoatingSurcharge(type: SteelType, thickness: number, selectedCoating: string): number {
  if (type === 'HDG') return getCoatingSurcharge(thickness, selectedCoating, COATING_MATRIX_HDG) || 0;
  if (type === 'ZM') return getCoatingSurcharge(thickness, selectedCoating, COATING_MATRIX_ZM) || 0;
  return 0;
}

export function computePicklingSurcharge(type: SteelType, thickness: number): number {
  if (type !== 'PICKLED') return 0;
  return getPicklingSurcharge(thickness) || 0;
}

export function computeTeardropSurcharge(type: SteelType, width: number): number {
  return type === 'TEARDROP' ? getTeardropSurcharge(width) : 0;
}

// Dopłata bazowa SSC — 0 dla kręgów (isCoilMode), fallback 29 gdy poza tabelą (ta sama
// zasada co dotychczasowe baseSurchargeRaw ?? 29 w kalkulatorze).
export function computeBaseSurcharge(
  type: SteelType,
  thickness: number,
  width: number,
  length: number,
  isCoilMode: boolean
): number {
  if (isCoilMode) return 0;
  const raw = (type === 'HRS' || type === 'PICKLED' || type === 'TEARDROP')
    ? getBaseLengthSurchargeHRS(thickness, length)
    : getBaseSurchargeCRHDG(thickness, width);
  return raw ?? 29;
}

export function computeYieldValue(type: SteelType, gradeName: string): number {
  return type === 'HRS' && YIELD_GRADES.includes(gradeName) ? 7 : 0;
}

export function gradeValueFor(type: SteelType, gradeName: string): number {
  const grade = GRADE_TABLES[type]?.find((g) => g.name === gradeName);
  return grade ? grade.value : 0;
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
  type: SteelType,
  thickness: number,
  width: number,
  tolThick: number,
  cert: number,
  gradeValue: number,
  selectedCoating: string,
  toggles: SurchargeToggles
): number {
  const dim = getDimensionSurcharge(type, thickness, width);
  const effectiveDim = dim !== null ? dim : 0;
  const coatingSurcharge = computeCoatingSurcharge(type, thickness, selectedCoating);
  const picklingSurcharge = computePicklingSurcharge(type, thickness);
  const teardropSurcharge = computeTeardropSurcharge(type, width);

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

  const baseSurcharge = computeBaseSurcharge(type, thickness, width, length, isCoilMode);
  const yieldValue = computeYieldValue(type, gradeName);
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
 * (wymiary, gatunek, dopłaty) co przy pierwotnym dodaniu — patrz item.inputs.
 * Zwraca `null` dla pozycji sprzed wprowadzenia ItemInputs (brak zapisanej konfiguracji =
 * brak możliwości bezpiecznego przeliczenia; UI ma wtedy tylko podmienić pgl i oznaczyć
 * pozycję do ręcznego przeglądu, patrz legacyStaleItems w Calculator.tsx).
 */
export function computeItemPricing(
  item: RecomputableItem,
  newPgl: number,
  settings: AppSettings
): RecomputedItemPricing | null {
  const inp = item.inputs;
  if (!inp) return null;

  const gradeValue = inp.selectedGrade ? inp.selectedGrade.value : gradeValueFor(item.type, item.grade);
  const sumaHuta = computeSumaHuta(
    item.type, item.thickness, item.width, inp.tolThick, inp.cert,
    gradeValue, inp.selectedCoating, inp
  );
  const cenaWsadu = newPgl + sumaHuta;
  const { sumaSSC } = computeSumaSSC(
    item.type, item.thickness, item.width, item.length, !!item.isCoil, item.grade,
    cenaWsadu, settings.scrapPct, inp
  );
  const { marzaNetto, cenaKoncowa } = computeCenaKoncowa(cenaWsadu, inp.marginPct, inp.extra, inp.transport, sumaSSC);
  const totalValue = Math.round(cenaKoncowa * item.tons * 100) / 100;

  return { pgl: newPgl, sumaHuta, sumaSSC, marza: marzaNetto, finalPrice: cenaKoncowa, totalValue };
}
