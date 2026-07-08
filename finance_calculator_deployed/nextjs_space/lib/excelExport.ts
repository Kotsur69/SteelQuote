// Eksport zestawienia do pliku Excel (.xlsx) w formacie KTS/GPAO.
// Odwrotność importu: bierze pozycje zestawienia (z kalkulatora) i produkuje
// wiersze o tych samych 37 kolumnach, co eksport z obecnego systemu.
//
// UWAGA — kody do zmapowania później:
// „Grupa materiałowa" emitowana jest jako surowy typ (HRS/CR/HDG) — BEZ zgadywania.
// Podmień na prawdziwe kody systemu (dla HRS w przykładzie było 'HRBL'), gdy je dostaniemy.
// „Kształt" kręgu (SHAPE_COIL) to placeholder — arkusz znamy z przykładu ('SH').
// Kolumny metadanych systemu (KTS ID, Spółka GPAO, Klient, Referencja składu,
// Kategoria, …) zostają PUSTE — nasza aplikacja ich nie przechowuje.

import * as XLSX from 'xlsx';
import type { SteelType } from './calculatorData';

// ─── Mapy: wartość w aplikacji → kod w formacie KTS/GPAO ───

// Bez zgadywania — surowy typ. Do zmapowania na kody systemu później (HRS→'HRBL' itd.).
const GROUP_BY_TYPE: Record<SteelType, string> = {
  HRS: 'HRS',
  CR: 'CR',
  HDG: 'HDG',
};

const SHAPE_SHEET = 'SH';   // arkusz (z przykładu)
const SHAPE_COIL = 'COIL';  // placeholder — realny kod kręgu do ustalenia

// Certyfikat (dopłata cert) → tekst atestu.
const ATEST_BY_CERT: Record<number, string> = {
  0: '2.2 EN 10204',
  5: '3.1 EN 10204', // z przykładu
  10: '3.2 EN 10204',
};

// Pakowanie: indeks przełącznika → kod + opis (opisy podane przez użytkownika).
const PACKING_CODES = ['S01', 'S03', 'S12', 'S13', 'SB2', 'SB3'] as const;
const PACKING_DESC: Record<string, string> = {
  S01: 'kantówki',
  S03: 'na kantówkach + korytka',
  S12: 'kantówki + papier góra i dół',
  S13: 'kantówki + papier góra i dół + korytka zabezpieczające',
  SB2: 'paleta + papier góra i dół',
  SB3: 'paleta + papier góra i dół + korytka zabezpieczające',
};

// Reprezentatywna maks. waga paczki (t) dla progu dopłaty SSC (sscMaxWeight).
const MAXWEIGHT_T_BY_VALUE: Record<number, number> = {
  20: 0.9,   // <1T
  10: 1.25,  // 1–1,5T
  7.5: 2.0,  // 1,5–2,25T
  5: 2.35,   // 2,2–2,5T
  0: 3.0,    // 2,5–3,5T (z przykładu: 3.000)
  '-3': 4.0, // >3,5T
};

// Stałe „spec standardowa" — wartości z przykładu, gdy aplikacja nie śledzi pola.
const DEFAULT_ZABEZPIECZENIE = 'NIEOLIWIONE';
const DEFAULT_JAKOSC = '1';
const DEFAULT_TOL_SZER_PLUS = 20;
const DEFAULT_TOL_SZER_MINUS = 0;
const DEFAULT_TOL_DL_PLUS = 15;
const DEFAULT_TOL_DL_MINUS = 0;

// 37 kolumn w dokładnej kolejności z eksportu systemowego (kol. 36 bez nagłówka).
export const KTS_HEADERS: string[] = [
  'KTS ID',
  'Spółka GPAO',
  'Informacja klienta',
  'KTS (GPAO)',
  'Kształt',
  'Grupa materiałowa',
  'Gatunek',
  'Powierzchnia',
  'Zabezpieczenie',
  'Pokrycie',
  'Jakość',
  'Zgrzew',
  'Atest',
  'Grubość',
  'Szerokość',
  'Tol.szer. (plus)',
  'Tol.szer. (minus)',
  'Długość',
  'Tol.długości (plus)',
  'Tol.długości (minus)',
  'Brzegowanie',
  'Płaskość',
  'Opis Płaskość',
  'Tolerancja płaskości',
  'Pakowanie',
  'Opis Pakowanie',
  'Maks. waga paczki',
  'Maks. sztuk/paczkę',
  'Towar Klienta',
  'Gatunek Klienta',
  'Klient',
  'REFERENCJA SKŁADU',
  'KATEGORIA',
  'Znakowanie',
  'Opis Znakowanie',
  '',
  'Komentarz',
];

// Zestaw wejść pozycji potrzebny do eksportu (podzbiór ItemInputs z kalkulatora).
export interface ExcelItemInputs {
  cert?: number;
  selectedCoating?: string;
  sscFlatness?: number;
  sscEdging?: number;
  sscPackingIdx?: number;
  sscMaxWeight?: number;
  crZgrzew?: number;
  hdgZgrzew?: number;
}

export interface ExcelExportItem {
  type: SteelType;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  isCoil?: boolean;
  coating?: string;
  inputs?: ExcelItemInputs;
}

// Zgrzew: dla CR/HDG z przełącznika, dla HRS domyślnie jak w przykładzie.
function weldText(item: ExcelExportItem): string {
  const v =
    item.type === 'CR' ? item.inputs?.crZgrzew
    : item.type === 'HDG' ? item.inputs?.hdgZgrzew
    : undefined;
  if (v === -3) return 'ZGRZEW DOZWOLONY';
  if (v === 0) return 'ZGRZEW INNY'; // 'other' — ZGADYWANE
  return 'ZGRZEW NIEDOZWOLONY'; // notAllowed / HRS / domyślnie (z przykładu)
}

// Płaskość → [kod, opis, tolerancja]. Kody laser/klient ZGADYWANE.
function flatnessCols(item: ExcelExportItem): [string, string, number] {
  const v = item.inputs?.sscFlatness ?? 0;
  if (v === 13) return ['L', 'Laser Flatness 1.3', 13]; // ZGADYWANE
  if (v === 8) return ['C', 'Customer Flatness', 8];     // ZGADYWANE
  return ['B', 'Normal Flatness', 23]; // EN standard (z przykładu)
}

// Buduje jeden wiersz (37 pól) w kolejności KTS_HEADERS.
function buildRow(item: ExcelExportItem): (string | number)[] {
  const coil = item.isCoil === true;
  const [flatCode, flatDesc, flatTol] = flatnessCols(item);
  const pIdx = item.inputs?.sscPackingIdx ?? 0;
  const pCode = PACKING_CODES[pIdx] ?? 'S01';
  const pDesc = PACKING_DESC[pCode] ?? '';
  const maxW = MAXWEIGHT_T_BY_VALUE[item.inputs?.sscMaxWeight ?? 0] ?? 3.0;
  const coating = item.type === 'HDG' ? (item.inputs?.selectedCoating || item.coating || '') : '';
  const atest = ATEST_BY_CERT[item.inputs?.cert ?? 5] ?? '3.1 EN 10204';
  const edging = (item.inputs?.sscEdging ?? 0) === 0 ? 'N' : 'T';

  return [
    '',                              // KTS ID
    '',                              // Spółka GPAO
    '',                              // Informacja klienta
    '',                              // KTS (GPAO)
    coil ? SHAPE_COIL : SHAPE_SHEET, // Kształt
    GROUP_BY_TYPE[item.type],        // Grupa materiałowa
    item.grade,                      // Gatunek
    '',                              // Powierzchnia
    DEFAULT_ZABEZPIECZENIE,          // Zabezpieczenie
    coating,                         // Pokrycie
    DEFAULT_JAKOSC,                  // Jakość
    weldText(item),                  // Zgrzew
    atest,                           // Atest
    item.thickness,                  // Grubość
    item.width,                      // Szerokość
    DEFAULT_TOL_SZER_PLUS,           // Tol.szer. (plus)
    DEFAULT_TOL_SZER_MINUS,          // Tol.szer. (minus)
    coil ? 0 : item.length,          // Długość
    coil ? 0 : DEFAULT_TOL_DL_PLUS,  // Tol.długości (plus)
    coil ? 0 : DEFAULT_TOL_DL_MINUS, // Tol.długości (minus)
    edging,                          // Brzegowanie
    flatCode,                        // Płaskość
    flatDesc,                        // Opis Płaskość
    flatTol,                         // Tolerancja płaskości
    pCode,                           // Pakowanie
    pDesc,                           // Opis Pakowanie
    maxW,                            // Maks. waga paczki
    '',                              // Maks. sztuk/paczkę
    '',                              // Towar Klienta
    '',                              // Gatunek Klienta
    '',                              // Klient
    '',                              // REFERENCJA SKŁADU
    '',                              // KATEGORIA
    '',                              // Znakowanie
    '',                              // Opis Znakowanie
    '',                              // (kolumna bez nagłówka)
    '',                              // Komentarz
  ];
}

// Buduje arkusz z pozycji zestawienia i pobiera plik .xlsx w przeglądarce.
export function exportZestawienieToExcel(items: ExcelExportItem[], offerName?: string): void {
  const rows = items.map(buildRow);
  const ws = XLSX.utils.aoa_to_sheet([KTS_HEADERS, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'KTS');
  const safe = (offerName || 'oferta').replace(/[^\w.-]+/g, '_');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${safe}_${stamp}.xlsx`);
}
