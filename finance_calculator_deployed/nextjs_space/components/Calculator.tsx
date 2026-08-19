'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import NumericField from '@/components/NumericField';
import {
  GRADE_TABLES,
  DIMENSION_MATRIX_HRS,
  DIMENSION_MATRIX_CR,
  DIMENSION_MATRIX_HDG,
  DIMENSION_MATRIX_PICKLED,
  DIMENSION_MATRIX_TEARDROP,
  DIMENSION_MATRIX_ZM,
  MIN_THICKNESS_HRS,
  MIN_THICKNESS_CR,
  MIN_THICKNESS_HDG,
  MIN_THICKNESS_PICKLED,
  MIN_THICKNESS_TEARDROP,
  MIN_THICKNESS_ZM,
  COATING_MATRIX_HDG,
  COATING_MATRIX_ZM,
  LENGTH_SURCHARGE_HRS,
  BASE_SURCHARGE_CR_HDG,
  PICKLING_SURCHARGE,
  TEARDROP_FLAT_SURCHARGE,
  TOL_THICK_OPTIONS,
  YIELD_GRADES,
  SCRAP_CONSTANT,
  SteelType,
  Grade,
  ItemInputs,
  CERT_OPTIONS,
  CR_PROTECTION_OPTIONS,
  HDG_PROTECTION_OPTIONS,
  ZM_PROTECTION_OPTIONS,
  SSC_MAX_WEIGHT_OPTIONS,
  SSC_PACKING_OPTIONS,
  getHutaSscToggleOptions,
} from '@/lib/calculatorData';
import { attachNotesToZestawienie } from '@/lib/itemNotes';
import { offerNumberLabel } from '@/lib/offerVersions';
import { useLanguage, LanguageSelector } from '@/contexts/LanguageContext';
import { useCurrency, CurrencySelector } from '@/contexts/CurrencyContext';
import { pglBaseForType } from '@/lib/currency';
import { formatWarning } from '@/lib/translations';
import {
  ClientInfo,
  EMPTY_CLIENT_INFO,
  normalizeClientInfo,
  hasRequiredCompanyDetails,
} from '@/lib/pdfGenerator';
import ClientCombobox from '@/components/ClientCombobox';
import ContactCombobox from '@/components/ContactCombobox';
import type { ContactSuggestion } from '@/lib/useContactLookup';
import type { ClientSuggestion } from '@/lib/useClientLookup';
import { downloadServerPdf } from '@/lib/serverPdf';
import { exportZestawienieToExcel } from '@/lib/excelExport';
import { useDarkMode } from '@/lib/useDarkMode';
import { useHighContrast } from '@/lib/useHighContrast';
import { getThemeVars } from '@/lib/themeVars';

interface ZestawienieItem {
  id: number;
  type: SteelType;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  sumaHuta: number;
  sumaSSC: number;
  marza: number;
  finalPrice: number;
  tons: number;
  totalValue: number;
  pgl: number;
  isCoil?: boolean;
  coating?: string;
  // Snapshot wszystkich przełączników dopłat, żeby edycja pozycji odtworzyła
  // dokładnie jej konfigurację (opcjonalny — stare zapisane oferty go nie mają).
  inputs?: ItemInputs;
}

export default function Calculator() {
  // Language
  const { t, language } = useLanguage();

  // Waluta wyświetlania. EUR pozostaje jedynym źródłem prawdy — stan poniżej trzyma
  // wyłącznie €/t, a PLN jest nakładką na wyświetlanie (toDisplay) i na wejście (fromDisplay).
  const {
    currency,
    setCurrency,
    rate,
    settings,
    refreshSettings,
    setRateOverride,
    toDisplay,
    fromDisplay,
    symbol,
  } = useCurrency();

  // Kwota do wyświetlenia. W EUR zwracamy surową wartość, żeby widok był identyczny
  // jak dotąd (dopłaty są całkowite). W PLN pokazujemy grosze.
  const money = useCallback(
    (eur: number) => (currency === 'EUR' ? String(eur) : toDisplay(eur).toFixed(2)),
    [currency, toDisplay]
  );
  // Kwoty, które i dziś mają dwa miejsca po przecinku (sumy, ceny).
  const money2 = useCallback((eur: number) => toDisplay(eur).toFixed(2), [toDisplay]);
  // Cena końcowa: zaokrąglenie W GÓRĘ do pełnej jednostki (decyzja biznesowa — nigdy nie
  // zaniżać ceny). Tylko dla ceny końcowej, reszta kwot zostaje na money/money2.
  const moneyCeil = useCallback((eur: number) => String(Math.ceil(toDisplay(eur))), [toDisplay]);
  // Sama waluta, bez "/t" — dla wartości pozycji i sumy zestawienia, które są kwotą
  // całkowitą (cena × tony), a nie ceną jednostkową.
  const currencyUnit = currency === 'PLN' ? 'zł' : '€';
  // Wartość dla pola <input type="number">. Zaokrąglamy do groszy, żeby nie pokazać
  // 2773.5000000000005 po przemnożeniu przez kurs.
  const moneyInput = useCallback(
    (eur: number) => (currency === 'EUR' ? eur : Math.round(toDisplay(eur) * 100) / 100),
    [currency, toDisplay]
  );

  // Steel type
  const [currentType, setCurrentType] = useState<SteelType>('HRS');
  
  // Theme
  const [isDark, setIsDark] = useDarkMode();
  const [highContrast, setHighContrast] = useHighContrast();
  
  // Input parameters - defaults for HRS
  const [thickness, setThickness] = useState(4);
  const [width, setWidth] = useState(1500);
  const [length, setLength] = useState(3000);
  const [isCoilMode, setIsCoilMode] = useState(false);
  const [gradeInput, setGradeInput] = useState('S235JR+N');
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>({ name: 'S235JR+N', value: 24 });
  
  // Huta surcharges
  const [tolThick, setTolThick] = useState(0);
  const [tolThickIdx, setTolThickIdx] = useState(0);
  const [cert, setCert] = useState(5);
  const [selectedCoating, setSelectedCoating] = useState('Z275');
  
  // CR specific
  const [crZabezp, setCrZabezp] = useState(0);
  const [crOpak, setCrOpak] = useState(5);
  const [crOpakIdx, setCrOpakIdx] = useState(1); // paperPlastic
  const [crPowierz, setCrPowierz] = useState(0);
  const [crWykon, setCrWykon] = useState(0);
  const [crWykonIdx, setCrWykonIdx] = useState(0); // normalFinish
  const [crZgrzew, setCrZgrzew] = useState(-3);
  
  // HDG specific
  const [hdgZabezp, setHdgZabezp] = useState(0);
  const [hdgZabezpIdx, setHdgZabezpIdx] = useState(3); // CE (value 0)
  const [hdgOpak, setHdgOpak] = useState(5);
  const [hdgOpakIdx, setHdgOpakIdx] = useState(1); // paperPlastic
  const [hdgPowierz, setHdgPowierz] = useState(0);
  const [hdgWykon, setHdgWykon] = useState(0);
  const [hdgZgrzew, setHdgZgrzew] = useState(-3);

  // ZM specific (Magnelis) — bez osobnego "wykonania", tylko 4 grupy dopłat
  const [zmZabezp, setZmZabezp] = useState(0);
  const [zmZabezpIdx, setZmZabezpIdx] = useState(2); // CE (value 0)
  const [zmOpak, setZmOpak] = useState(5);
  const [zmOpakIdx, setZmOpakIdx] = useState(1); // paperPlastic
  const [zmPowierz, setZmPowierz] = useState(0);
  const [zmZgrzew, setZmZgrzew] = useState(-3);

  // SSC surcharges
  const [sscLenTol, setSscLenTol] = useState(0);
  const [sscFlatness, setSscFlatness] = useState(0);
  const [sscSurface, setSscSurface] = useState(10);
  const [sscMaxWeight, setSscMaxWeight] = useState(0);
  const [sscMarking, setSscMarking] = useState(0);
  const [sscEdging, setSscEdging] = useState(0);
  const [sscPacking, setSscPacking] = useState(0);
  const [sscPackingIdx, setSscPackingIdx] = useState(0); // S01
  const [sscLabels, setSscLabels] = useState(0);
  
  // Summary
  const [pglBase, setPglBase] = useState(645);
  const [marginPct, setMarginPct] = useState(7);
  const [extra, setExtra] = useState(0);
  const [transport, setTransport] = useState(20);
  const [tons, setTons] = useState(1);
  
  // Zestawienie
  const [zestawienie, setZestawienie] = useState<ZestawienieItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  // true gdy edytowana pozycja nie ma zapisanego snapshotu .inputs (oferta sprzed v1.3) —
  // przełączniki dopłat NIE zostały odtworzone, tylko zostawione takie, jakie były w
  // kalkulatorze wcześniej. Zapis takiej pozycji może po cichu policzyć inną cenę.
  const [legacyEditWarning, setLegacyEditWarning] = useState(false);
  
  // Offer management
  const searchParams = useSearchParams();
  const router = useRouter();
  const [currentOfferId, setCurrentOfferId] = useState<number | null>(null);
  // Dwie osobne nazwy, bo znaczą co innego:
  //   currentOfferName    = display_name z bazy (nazwa własna ALBO "offer_<ID>") — tylko do pokazania.
  //   currentOfferRawName = to, co handlowiec naprawdę wpisał ('' = nie wpisał nic).
  // Odsyłanie display_name z powrotem do API zamroziłoby "offer_14" jako nazwę własną.
  const [currentOfferName, setCurrentOfferName] = useState<string>('');
  const [currentOfferRawName, setCurrentOfferRawName] = useState<string>('');
  // Etykieta typu "offer_27.1" — liczona z root_offer_id + version_number, bo surowe `id`
  // wiersza (np. 30) nie ma nic wspólnego z numerem, który handlowiec widzi na liście ofert.
  const [currentOfferLabel, setCurrentOfferLabel] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveOfferName, setSaveOfferName] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Client info
  const [clientInfo, setClientInfo] = useState<ClientInfo>(EMPTY_CLIENT_INFO);
  const [showClientInfo, setShowClientInfo] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);

  // Klasy panelu klienta wyciągnięte do stałych. Ten sam długi string powtarzał się
  // przy każdym z ośmiu pól; rozjazd choćby w jednym rozsypywał spójność panelu,
  // a przy dokładaniu SAP_ID trzeba by go było skopiować po raz dziewiąty.
  const fieldLabelClass =
    'text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]';
  const sectionLegendClass =
    'mb-3 text-[10px] font-semibold tracking-widest uppercase text-[var(--text-primary)]';
  const clientFieldClass = `bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[#a78bfa] outline-none transition-colors w-full disabled:cursor-not-allowed
    ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`;

  // Dane kontaktowe są opcjonalne (przy części firm po prostu niepotrzebne), ale
  // wpisywanie ich "w powietrze", zanim wiadomo czyje one są, tworzyłoby kontakty
  // bez właściciela. Firma + NIP to minimum, które przypina je do konkretnego klienta.
  const isContactUnlocked = hasRequiredCompanyDetails(clientInfo);

  // Wybór podpowiedzi nadpisuje KOMPLET danych firmy, nie tylko pole, w którym
  // szukano. O to chodzi w podpowiedziach: jedno kliknięcie zamiast czterech
  // przepisywanych ręcznie pól. Dane kontaktowe zostają nietknięte — w katalogu
  // siedzi kontakt sprzed miesięcy, a ofertę może dziś prowadzić kto inny.
  const applyClientSuggestion = (client: ClientSuggestion) => {
    setClientInfo(prev => ({
      ...prev,
      company: client.company,
      nip: client.nip,
      address: client.address,
      sapId: client.sapId,
    }));
  };

  // Wybór osoby z listy uzupełnia KOMPLET danych kontaktowych. Dane firmy zostają
  // nietknięte — kontakt zawsze należy do firmy już wskazanej wyżej, więc nie ma
  // czego w niej podmieniać.
  const applyContactSuggestion = (contact: ContactSuggestion) => {
    setClientInfo(prev => ({
      ...prev,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      email: contact.email,
    }));
  };
  const [pdfLoading, setPdfLoading] = useState(false);
  
  // Grade dropdown
  const [showGradeDropdown, setShowGradeDropdown] = useState(false);
  const gradeInputRef = useRef<HTMLInputElement>(null);
  const calculatorTopRef = useRef<HTMLDivElement>(null);
  
  // Get active matrices based on type
  const activeDimensionMatrix = useMemo(() => {
    switch (currentType) {
      case 'CR': return DIMENSION_MATRIX_CR;
      case 'HDG': return DIMENSION_MATRIX_HDG;
      case 'PICKLED': return DIMENSION_MATRIX_PICKLED;
      case 'TEARDROP': return DIMENSION_MATRIX_TEARDROP;
      case 'ZM': return DIMENSION_MATRIX_ZM;
      default: return DIMENSION_MATRIX_HRS;
    }
  }, [currentType]);

  const activeMinThickness = useMemo(() => {
    switch (currentType) {
      case 'CR': return MIN_THICKNESS_CR;
      case 'HDG': return MIN_THICKNESS_HDG;
      case 'PICKLED': return MIN_THICKNESS_PICKLED;
      case 'TEARDROP': return MIN_THICKNESS_TEARDROP;
      case 'ZM': return MIN_THICKNESS_ZM;
      default: return MIN_THICKNESS_HRS;
    }
  }, [currentType]);
  
  const activeGradeTable = useMemo(() => GRADE_TABLES[currentType], [currentType]);
  
  // Get dimension surcharge
  const getDimensionSurcharge = useCallback((th: number, w: number): number | null => {
    for (const row of activeDimensionMatrix) {
      if (th >= row.thicknessMin && th <= row.thicknessMax &&
          w >= row.widthMin && w <= row.widthMax) {
        return row.value;
      }
    }
    return null;
  }, [activeDimensionMatrix]);
  
  // Get min thickness for width
  const getMinThicknessForWidth = useCallback((w: number): number | null => {
    for (const rule of activeMinThickness) {
      if (w >= rule.widthMin && w <= rule.widthMax) {
        return rule.minThickness;
      }
    }
    return null;
  }, [activeMinThickness]);
  
  // Get coating surcharge for HDG or ZM (matrix wybierana wg aktywnego typu)
  const getCoatingSurcharge = useCallback((th: number, coating: string, matrix: typeof COATING_MATRIX_HDG | typeof COATING_MATRIX_ZM): number | null => {
    for (const row of matrix) {
      const thRange = row.th as { min: number; max: number };
      if (th >= thRange.min && th <= thRange.max) {
        const val = row[coating];
        return typeof val === 'number' ? val : null;
      }
    }
    return null;
  }, []);

  // Trawienie (PICKLED) — dopłata zależna wyłącznie od grubości.
  const getPicklingSurcharge = useCallback((th: number): number | null => {
    for (const row of PICKLING_SURCHARGE) {
      if (th >= row.thicknessMin && th <= row.thicknessMax) return row.value;
    }
    return null;
  }, []);
  
  // Get base length surcharge for HRS
  const getBaseLengthSurchargeHRS = useCallback((th: number, len: number): number | null => {
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
  }, []);
  
  // Get base surcharge for CR/HDG
  const getBaseSurchargeCRHDG = useCallback((th: number, w: number): number | null => {
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
  }, []);
  
  // Calculate dimension surcharge and warning
  const dimSurcharge = getDimensionSurcharge(thickness, width);
  const minTh = getMinThicknessForWidth(width);
  
  const warningText = useMemo(() => {
    if (dimSurcharge !== null) return null;
    
    if (minTh !== null) {
      if (thickness < minTh) {
        return formatWarning(t.warnings.minThickness, {
          width,
          minTh: minTh.toFixed(2),
          thickness: thickness.toFixed(2)
        });
      } else {
        let maxTh: number | null = null;
        for (const row of activeDimensionMatrix) {
          if (width >= row.widthMin && width <= row.widthMax) {
            if (maxTh === null || row.thicknessMax > maxTh) maxTh = row.thicknessMax;
          }
        }
        if (maxTh !== null && maxTh < 99) {
          return formatWarning(t.warnings.maxThickness, {
            width,
            maxTh: maxTh.toFixed(2),
            thickness: thickness.toFixed(2)
          });
        }
        return formatWarning(t.warnings.outOfRange, {
          thickness: thickness.toFixed(2),
          width
        });
      }
    }
    return formatWarning(t.warnings.widthOutOfRange, { width });
  }, [dimSurcharge, thickness, width, minTh, activeDimensionMatrix, t.warnings]);
  
  // Calculate coating surcharge for HDG or ZM
  const coatingSurcharge = useMemo(() => {
    if (currentType === 'HDG') return getCoatingSurcharge(thickness, selectedCoating, COATING_MATRIX_HDG) || 0;
    if (currentType === 'ZM') return getCoatingSurcharge(thickness, selectedCoating, COATING_MATRIX_ZM) || 0;
    return 0;
  }, [currentType, thickness, selectedCoating, getCoatingSurcharge]);

  // Trawienie — tylko PICKLED, zależne wyłącznie od grubości (nie toggle, jak dimSurcharge)
  const picklingSurcharge = useMemo(() => {
    if (currentType !== 'PICKLED') return 0;
    return getPicklingSurcharge(thickness) || 0;
  }, [currentType, thickness, getPicklingSurcharge]);

  // Dopłata Łezka — stała, tylko TEARDROP
  const teardropSurcharge = currentType === 'TEARDROP' ? TEARDROP_FLAT_SURCHARGE : 0;

  // Calculate base surcharge
  const baseSurchargeRaw = useMemo(() => {
    if (isCoilMode) return null;
    if (currentType === 'HRS' || currentType === 'PICKLED' || currentType === 'TEARDROP') {
      return getBaseLengthSurchargeHRS(thickness, length);
    }
    return getBaseSurchargeCRHDG(thickness, width);
  }, [currentType, thickness, length, width, isCoilMode, getBaseLengthSurchargeHRS, getBaseSurchargeCRHDG]);
  const baseSurcharge = isCoilMode ? 0 : (baseSurchargeRaw ?? 29);

  const baseSurchargeWarning = useMemo(() => {
    if (isCoilMode || baseSurchargeRaw !== null) return null;
    return formatWarning(t.warnings.baseSurchargeFallback, {
      thickness: thickness.toFixed(2),
      value: 29,
    });
  }, [isCoilMode, baseSurchargeRaw, thickness, t.warnings]);
  
  // Check yield visibility
  const showYield = currentType === 'HRS' && YIELD_GRADES.includes(gradeInput);
  const yieldValue = showYield ? 7 : 0;
  
  // Calculate HUTA sum
  const sumaHuta = useMemo(() => {
    const effectiveDim = dimSurcharge !== null ? dimSurcharge : 0;
    const gradeSurcharge = selectedGrade ? selectedGrade.value : 0;

    let crExtra = 0;
    if (currentType === 'CR') {
      crExtra = crZabezp + crOpak + crPowierz + crWykon + crZgrzew;
    } else if (currentType === 'HDG') {
      crExtra = hdgZabezp + hdgOpak + hdgPowierz + hdgWykon + hdgZgrzew;
    } else if (currentType === 'ZM') {
      crExtra = zmZabezp + zmOpak + zmPowierz + zmZgrzew;
    }

    return 0 + effectiveDim + gradeSurcharge + tolThick + cert + coatingSurcharge + crExtra
      + picklingSurcharge + teardropSurcharge;
  }, [dimSurcharge, selectedGrade, tolThick, cert, coatingSurcharge, currentType,
      crZabezp, crOpak, crPowierz, crWykon, crZgrzew,
      hdgZabezp, hdgOpak, hdgPowierz, hdgWykon, hdgZgrzew,
      zmZabezp, zmOpak, zmPowierz, zmZgrzew,
      picklingSurcharge, teardropSurcharge]);
  
  // Calculate SSC sum
  const sumaSSC = useMemo(() => {
    if (isCoilMode) return 0;
    return baseSurcharge + sscLenTol + sscFlatness + sscSurface + sscMaxWeight +
           sscMarking + sscEdging + yieldValue + sscPacking + sscLabels + SCRAP_CONSTANT;
  }, [baseSurcharge, sscLenTol, sscFlatness, sscSurface, sscMaxWeight,
      sscMarking, sscEdging, yieldValue, sscPacking, sscLabels, isCoilMode]);
  
  // Calculate final values
  const cenaWsadu = pglBase + sumaHuta;
  const marzaNetto = cenaWsadu * (marginPct / 100);
  const cenaKoncowa = cenaWsadu + marzaNetto + extra + transport + sumaSSC;
  
  // Filtered grades for dropdown
  const filteredGrades = useMemo(() => {
    const q = gradeInput.toLowerCase().trim();
    if (q.length === 0) return activeGradeTable;
    return activeGradeTable.filter(g => g.name.toLowerCase().includes(q));
  }, [gradeInput, activeGradeTable]);
  
  // Select grade from dropdown
  const selectGrade = (grade: Grade) => {
    setGradeInput(grade.name);
    setSelectedGrade(grade);
    setShowGradeDropdown(false);
  };
  
  // Select steel type
  const selectType = (type: SteelType) => {
    setCurrentType(type);

    // PGL bazowe jest per-typ (HRS/CR/HDG mają różne ceny wsadu) — resetuje się razem
    // z resztą pól specyficznych dla typu, tak samo jak grubość/szerokość/gatunek niżej.
    setPglBase(pglBaseForType(type, settings));

    // Reset grade
    const defaultGrades: Record<SteelType, string | null> = {
      HRS: 'S235JR+N', CR: 'DC01', HDG: 'DX51D+Z',
      PICKLED: 'S235JR+N', TEARDROP: null, ZM: 'DX51D+ZM',
    };
    const defaultName = defaultGrades[type];
    const defaultEntry = defaultName
      ? GRADE_TABLES[type].find(g =>
          g.name.replace(/\s/g, '').toLowerCase() === defaultName.replace(/\s/g, '').toLowerCase()
        ) || GRADE_TABLES[type][0] || null
      : null;

    setGradeInput(defaultEntry ? defaultEntry.name : '');
    setSelectedGrade(defaultEntry);

    // Set default dimensions per steel type
    if (type === 'HRS' || type === 'PICKLED') {
      setThickness(4);
      setWidth(1500);
      setLength(3000);
      setSscSurface(10); // Improved = default for HRS/PICKLED
    } else if (type === 'CR') {
      setThickness(1.5);
      setWidth(1500);
      setLength(3000);
      setSscSurface(0);
    } else if (type === 'HDG' || type === 'ZM') {
      setThickness(2);
      setWidth(1500);
      setLength(3000);
      setSscSurface(0);
    } else if (type === 'TEARDROP') {
      // Matryca TEARDROP jest aliasem HRS (min. grubość 1.60mm przy 1500mm) — domyślne
      // 1.5mm dawałoby fałszywe ostrzeżenie "za mała grubość" od razu po wyborze zakładki.
      setThickness(4);
      setWidth(1500);
      setLength(3000);
      setSscSurface(0);
    }

    // Reset tolerances
    setTolThick(0);
    setTolThickIdx(0);
    setCert(type === 'CR' || type === 'ZM' ? 0 : 5);

    // Reset SSC options to defaults
    setSscLenTol(0);
    setSscFlatness(0);
    setSscMaxWeight(0);
    setSscMarking(0);
    setSscEdging(0);
    setSscPacking(0);
    setSscPackingIdx(0); // S01
    setSscLabels(0);

    // Reset coating for HDG
    if (type === 'HDG') {
      setSelectedCoating('Z275');
      setHdgZabezp(0);
      setHdgZabezpIdx(3); // CE
      setHdgOpak(5);
      setHdgOpakIdx(1); // paperPlastic
      setHdgPowierz(0);
      setHdgWykon(0);
      setHdgZgrzew(-3);
    }

    // Reset CR-specific
    if (type === 'CR') {
      setCrZabezp(0);
      setCrOpak(5);
      setCrOpakIdx(1); // paperPlastic
      setCrPowierz(0);
      setCrWykon(0);
      setCrWykonIdx(0); // normalFinish
      setCrZgrzew(-3);
    }

    // Reset ZM-specific (protection/packaging/surface/weld + coating)
    if (type === 'ZM') {
      setSelectedCoating('ZM120');
      setZmZabezp(0);
      setZmZabezpIdx(2); // CE
      setZmOpak(5);
      setZmOpakIdx(1); // paperPlastic
      setZmPowierz(0);
      setZmZgrzew(-3);
    }
  };
  
  // Toggle button component - uses index-based tracking for groups with duplicate values
  const ToggleGroup = ({ options, value, onChange, selectedIdx, onChangeIdx }: {
    options: { label: string; value: number; title?: string }[];
    value: number;
    onChange?: (v: number) => void;
    selectedIdx?: number;
    onChangeIdx?: (v: number, idx: number) => void;
  }) => (
    <div className="toggle-group flex flex-wrap gap-[3px] ml-auto justify-end">
      {options.map((opt, idx) => {
        // Use index-based matching if selectedIdx is provided, otherwise fall back to value matching
        const isActive = selectedIdx !== undefined 
          ? idx === selectedIdx 
          : opt.value === value;
        return (
          <button
            key={`${idx}-${opt.label}`}
            title={opt.title}
            onClick={() => {
              if (onChangeIdx) {
                onChangeIdx(opt.value, idx);
              } else if (onChange) {
                onChange(opt.value);
              }
            }}
            className="toggle-btn px-[7px] py-[3px] rounded text-[9.5px] font-mono font-medium border transition-all whitespace-nowrap"
            style={isActive
              ? {
                  backgroundColor: 'rgba(59,142,245,0.15)',
                  borderColor: '#3b8ef5',
                  color: '#3b8ef5',
                  fontWeight: 700,
                }
              : {
                  backgroundColor: highContrast ? (isDark ? '#000000' : '#ffffff') : isDark ? 'var(--bg-input)' : '#f4f5fa',
                  borderColor: highContrast ? (isDark ? '#ffffff' : '#000000') : isDark ? 'var(--border)' : '#9aa4c4',
                  color: highContrast ? (isDark ? '#ffffff' : '#000000') : isDark ? 'var(--text-secondary)' : '#2e3a5c',
                }
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
  
  // Add to zestawienie
  const addToZestawienie = () => {
    const snap: ZestawienieItem = {
      id: editingId || Date.now(),
      type: currentType,
      grade: gradeInput || '—',
      thickness,
      width,
      length: isCoilMode ? 0 : length,
      sumaHuta,
      sumaSSC,
      marza: marzaNetto,
      finalPrice: cenaKoncowa,
      tons,
      totalValue: Math.round(cenaKoncowa * tons * 100) / 100,
      pgl: pglBase,
      isCoil: isCoilMode,
      coating: (currentType === 'HDG' || currentType === 'ZM') ? selectedCoating : undefined,
      inputs: {
        selectedGrade,
        tolThick, tolThickIdx,
        cert,
        selectedCoating,
        crZabezp, crOpak, crOpakIdx, crPowierz, crWykon, crWykonIdx, crZgrzew,
        hdgZabezp, hdgZabezpIdx, hdgOpak, hdgOpakIdx, hdgPowierz, hdgWykon, hdgZgrzew,
        zmZabezp, zmZabezpIdx, zmOpak, zmOpakIdx, zmPowierz, zmZgrzew,
        sscLenTol, sscFlatness, sscSurface, sscMaxWeight, sscMarking, sscEdging,
        sscPacking, sscPackingIdx, sscLabels,
        marginPct, extra, transport,
      },
    };
    
    if (editingId !== null) {
      setZestawienie(prev => prev.map(item => item.id === editingId ? snap : item));
      setEditingId(null);
      setLegacyEditWarning(false);
    } else {
      setZestawienie(prev => [...prev, snap]);
    }
  };
  
  // Edit zestawienie item
  const editItem = (id: number) => {
    const item = zestawienie.find(i => i.id === id);
    if (!item) return;

    calculatorTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    setEditingId(id);
    // Ustawiamy typ BEZPOŚREDNIO — NIE przez selectType(), bo ono resetuje wszystkie
    // przełączniki dopłat do domyślnych dla danego typu (i zepsułoby odtworzenie ceny).
    setCurrentType(item.type);
    setThickness(item.thickness);
    setWidth(item.width);
    setLength(item.length);
    setGradeInput(item.grade);
    setPglBase(item.pgl);
    setTons(item.tons);
    setIsCoilMode(item.isCoil || false);

    const inp = item.inputs;
    setLegacyEditWarning(!inp);
    if (inp) {
      // Odtwarzamy pełną konfigurację dopłat zapisaną przy dodaniu pozycji.
      setSelectedGrade(inp.selectedGrade);
      setTolThick(inp.tolThick); setTolThickIdx(inp.tolThickIdx);
      setCert(inp.cert);
      setSelectedCoating(inp.selectedCoating);
      setCrZabezp(inp.crZabezp); setCrOpak(inp.crOpak); setCrOpakIdx(inp.crOpakIdx);
      setCrPowierz(inp.crPowierz); setCrWykon(inp.crWykon); setCrWykonIdx(inp.crWykonIdx);
      setCrZgrzew(inp.crZgrzew);
      setHdgZabezp(inp.hdgZabezp); setHdgZabezpIdx(inp.hdgZabezpIdx);
      setHdgOpak(inp.hdgOpak); setHdgOpakIdx(inp.hdgOpakIdx);
      setHdgPowierz(inp.hdgPowierz); setHdgWykon(inp.hdgWykon); setHdgZgrzew(inp.hdgZgrzew);
      setZmZabezp(inp.zmZabezp); setZmZabezpIdx(inp.zmZabezpIdx);
      setZmOpak(inp.zmOpak); setZmOpakIdx(inp.zmOpakIdx);
      setZmPowierz(inp.zmPowierz); setZmZgrzew(inp.zmZgrzew);
      setSscLenTol(inp.sscLenTol); setSscFlatness(inp.sscFlatness); setSscSurface(inp.sscSurface);
      setSscMaxWeight(inp.sscMaxWeight); setSscMarking(inp.sscMarking); setSscEdging(inp.sscEdging);
      setSscPacking(inp.sscPacking); setSscPackingIdx(inp.sscPackingIdx); setSscLabels(inp.sscLabels);
      setMarginPct(inp.marginPct); setExtra(inp.extra); setTransport(inp.transport);
    } else {
      // Stara pozycja bez snapshotu (oferta zapisana przed tą poprawką): najlepszy wysiłek —
      // odtwarzamy przynajmniej obiekt gatunku po nazwie, żeby dopłata gatunkowa się zgadzała.
      const g = GRADE_TABLES[item.type].find(x => x.name === item.grade) || null;
      setSelectedGrade(g);
    }
  };
  
  // Duplicate item
  const dupItem = (id: number) => {
    const item = zestawienie.find(i => i.id === id);
    if (!item) return;
    const copy = { ...item, id: Date.now() };
    const idx = zestawienie.findIndex(i => i.id === id);
    const newList = [...zestawienie];
    newList.splice(idx + 1, 0, copy);
    setZestawienie(newList);
  };
  
  // Delete item
  const deleteItem = (id: number) => {
    setZestawienie(prev => prev.filter(i => i.id !== id));
    if (editingId === id) { setEditingId(null); setLegacyEditWarning(false); }
  };
  
  // Clear zestawienie
  const clearZestawienie = () => {
    if (zestawienie.length === 0) return;
    if (!confirm(t.zestawienie.confirmClear)) return;
    setZestawienie([]);
    setEditingId(null);
  };
  
  // Collect all calculator state for saving
  const collectOfferData = () => ({
    currentType,
    thickness,
    width,
    length,
    isCoilMode,
    gradeInput,
    selectedGrade,
    tolThick, tolThickIdx,
    cert,
    selectedCoating,
    crZabezp, crOpak, crOpakIdx, crPowierz, crWykon, crWykonIdx, crZgrzew,
    hdgZabezp, hdgZabezpIdx, hdgOpak, hdgOpakIdx, hdgPowierz, hdgWykon, hdgZgrzew,
    zmZabezp, zmZabezpIdx, zmOpak, zmOpakIdx, zmPowierz, zmZgrzew,
    sscLenTol, sscFlatness, sscSurface,
    sscMaxWeight, sscMarking, sscEdging,
    sscPacking, sscPackingIdx, sscLabels,
    pglBase, marginPct, extra, transport, tons,
    zestawienie,
    clientInfo,
    // Waluta i kurs ZAMRAŻANE wraz z ofertą. `rate` to kurs zamrożony przy wczytaniu
    // oferty (jeśli miała), a dla nowej oferty — kurs bieżący z ustawień. Dzięki temu
    // późniejsza zmiana kursu przez admina nie przelicza ofert zapisanych, czekających
    // na akceptację seniora ani wysłanych.
    displayCurrency: currency,
    eurPlnRate: rate,
  });
  
  // Restore calculator state from offer data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restoreOfferData = (data: Record<string, any>) => {
    if (data.currentType) setCurrentType(data.currentType as SteelType);
    if (data.thickness !== undefined) setThickness(data.thickness);
    if (data.width !== undefined) setWidth(data.width);
    if (data.length !== undefined) setLength(data.length);
    if (data.isCoilMode !== undefined) setIsCoilMode(data.isCoilMode);
    if (data.gradeInput !== undefined) setGradeInput(data.gradeInput);
    if (data.selectedGrade !== undefined) setSelectedGrade(data.selectedGrade);
    if (data.tolThick !== undefined) setTolThick(data.tolThick);
    if (data.tolThickIdx !== undefined) setTolThickIdx(data.tolThickIdx);
    if (data.cert !== undefined) setCert(data.cert);
    if (data.selectedCoating !== undefined) setSelectedCoating(data.selectedCoating);
    if (data.crZabezp !== undefined) setCrZabezp(data.crZabezp);
    if (data.crOpak !== undefined) setCrOpak(data.crOpak);
    if (data.crOpakIdx !== undefined) setCrOpakIdx(data.crOpakIdx);
    if (data.crPowierz !== undefined) setCrPowierz(data.crPowierz);
    if (data.crWykon !== undefined) setCrWykon(data.crWykon);
    if (data.crWykonIdx !== undefined) setCrWykonIdx(data.crWykonIdx);
    if (data.crZgrzew !== undefined) setCrZgrzew(data.crZgrzew);
    if (data.hdgZabezp !== undefined) setHdgZabezp(data.hdgZabezp);
    if (data.hdgZabezpIdx !== undefined) setHdgZabezpIdx(data.hdgZabezpIdx);
    if (data.hdgOpak !== undefined) setHdgOpak(data.hdgOpak);
    if (data.hdgOpakIdx !== undefined) setHdgOpakIdx(data.hdgOpakIdx);
    if (data.hdgPowierz !== undefined) setHdgPowierz(data.hdgPowierz);
    if (data.hdgWykon !== undefined) setHdgWykon(data.hdgWykon);
    if (data.hdgZgrzew !== undefined) setHdgZgrzew(data.hdgZgrzew);
    if (data.zmZabezp !== undefined) setZmZabezp(data.zmZabezp);
    if (data.zmZabezpIdx !== undefined) setZmZabezpIdx(data.zmZabezpIdx);
    if (data.zmOpak !== undefined) setZmOpak(data.zmOpak);
    if (data.zmOpakIdx !== undefined) setZmOpakIdx(data.zmOpakIdx);
    if (data.zmPowierz !== undefined) setZmPowierz(data.zmPowierz);
    if (data.zmZgrzew !== undefined) setZmZgrzew(data.zmZgrzew);
    if (data.sscLenTol !== undefined) setSscLenTol(data.sscLenTol);
    if (data.sscFlatness !== undefined) setSscFlatness(data.sscFlatness);
    if (data.sscSurface !== undefined) setSscSurface(data.sscSurface);
    if (data.sscMaxWeight !== undefined) setSscMaxWeight(data.sscMaxWeight);
    if (data.sscMarking !== undefined) setSscMarking(data.sscMarking);
    if (data.sscEdging !== undefined) setSscEdging(data.sscEdging);
    if (data.sscPacking !== undefined) setSscPacking(data.sscPacking);
    if (data.sscPackingIdx !== undefined) setSscPackingIdx(data.sscPackingIdx);
    if (data.sscLabels !== undefined) setSscLabels(data.sscLabels);
    if (data.pglBase !== undefined) setPglBase(data.pglBase);
    if (data.marginPct !== undefined) setMarginPct(data.marginPct);
    if (data.extra !== undefined) setExtra(data.extra);
    if (data.transport !== undefined) setTransport(data.transport);
    if (data.tons !== undefined) setTons(data.tons);
    if (data.zestawienie !== undefined) setZestawienie(data.zestawienie);
    // normalizeClientInfo, a nie surowe przypisanie: oferta zapisana przed dodaniem
    // SAP_ID nie ma tego pola, a niekontrolowany input to ostrzeżenie Reacta i pole,
    // którego nie da się edytować.
    if (data.clientInfo !== undefined) setClientInfo(normalizeClientInfo(data.clientInfo));

    // Kurs zamrożony w ofercie ma pierwszeństwo nad bieżącym z ustawień — oferta wyceniona
    // po 4,30 zostaje po 4,30, choćby admin ustawił dziś 4,45.
    // Oferty zapisane przed tą zmianą nie mają eurPlnRate. Były liczone wyłącznie w EUR,
    // więc ich wartości w euro są nienaruszone; podgląd w PLN policzy się po kursie bieżącym.
    if (typeof data.eurPlnRate === 'number') {
      setRateOverride(data.eurPlnRate);
    } else {
      setRateOverride(null);
    }
    if (data.displayCurrency === 'EUR' || data.displayCurrency === 'PLN') {
      setCurrency(data.displayCurrency);
    }
  };
  
  // PDF export handler
  const handleExportPDF = async () => {
    if (zestawienie.length === 0) {
      setSaveMessage({ type: 'error', text: language === 'pl' ? 'Dodaj pozycje do zestawienia' : 'Add items to the list first' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    
    setPdfLoading(true);
    setSaveMessage({ type: 'success', text: language === 'pl' ? 'Generuję PDF...' : 'Generating PDF...' });
    try {
      // Uwagi w PDF odtwarzamy z zapisanych `inputs` pozycji, w bieżącym języku UI
      // (nie w języku, w którym pozycję dodano — użytkownik może przełączyć język przed eksportem).
      const zestawienieWithNotes = attachNotesToZestawienie(zestawienie, t, language);
      await downloadServerPdf({
        offerName: currentOfferName || saveOfferName || '',
        offerId: currentOfferId,
        clientInfo,
        zestawienie: zestawienieWithNotes,
        // Kurs zamrożony w ofercie (albo bieżący, jeśli oferta jeszcze nie zapisana).
        // Serwer przelicza kwoty tym kursem, więc PDF wygenerowany po zmianie kursu przez
        // admina pokazuje dokładnie te kwoty, które klient dostał przy wysyłce.
        currency,
        eurPlnRate: rate,
        language,
      });
      setSaveMessage({ type: 'success', text: language === 'pl' ? 'PDF wygenerowany!' : 'PDF generated!' });
    } catch (error) {
      console.error('PDF generation error:', error);
      setSaveMessage({ type: 'error', text: (error as Error).message || (language === 'pl' ? 'Błąd generowania PDF' : 'PDF generation error') });
    } finally {
      setPdfLoading(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // Eksport zestawienia do pliku Excel (format KTS/GPAO) — patrz lib/excelExport.ts
  const handleExportExcel = () => {
    if (zestawienie.length === 0) {
      setSaveMessage({ type: 'error', text: language === 'pl' ? 'Dodaj pozycje do zestawienia' : 'Add items to the list first' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    try {
      exportZestawienieToExcel(zestawienie, currentOfferName || saveOfferName || '');
      setSaveMessage({ type: 'success', text: language === 'pl' ? 'Excel wygenerowany!' : 'Excel generated!' });
    } catch (error) {
      console.error('Excel export error:', error);
      setSaveMessage({ type: 'error', text: language === 'pl' ? 'Błąd eksportu Excela' : 'Excel export error' });
    } finally {
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // Load offer when edit param is present
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId) {
      const loadOffer = async () => {
        try {
          const res = await fetch(`/api/offers/${editId}`);
          if (res.ok) {
            const { offer } = await res.json();
            setCurrentOfferId(offer.id);
            setCurrentOfferName(offer.display_name);
            setCurrentOfferRawName(offer.offer_name ?? '');
            setCurrentOfferLabel(offerNumberLabel(offer));
            restoreOfferData(offer.offer_data);
            setSaveMessage({ type: 'success', text: t.offers?.offerLoaded || 'Offer loaded!' });
            setTimeout(() => setSaveMessage(null), 3000);
          }
        } catch (error) {
          console.error('Error loading offer:', error);
          setSaveMessage({ type: 'error', text: t.offers?.loadFailed || 'Failed to load offer' });
          setTimeout(() => setSaveMessage(null), 3000);
        }
      };
      loadOffer();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Domyślne PGL i transport z panelu admina — TYLKO dla nowej kalkulacji.
  //
  // Gdy w URL jest ?edit=<id>, kalkulator wczytuje zapisaną ofertę i to ONA jest źródłem
  // prawdy. Wstawienie tu wartości z ustawień nadpisałoby cenę oferty, która mogła już
  // zostać wysłana do klienta albo czeka na akceptację seniora. Dlatego dwa zabezpieczenia:
  //   1. wychodzimy, gdy w URL jest ?edit (sprawdzenie synchroniczne — nie czekamy na fetch),
  //   2. ref pilnuje, że domyślne wejdą najwyżej raz i nie skasują ręcznych zmian handlowca.
  //
  // Wołamy refreshSettings() zamiast czytać `settings` z kontekstu wprost: CurrencyProvider
  // żyje przez cały czas trwania karty i ładuje ustawienia RAZ przy starcie, więc bez tego
  // wejście na kalkulator po tym, jak admin zmienił PGL/kurs w panelu (nawet w tej samej
  // karcie, przez nawigację klienta), pokazywałoby starą wartość aż do twardego odświeżenia.
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (searchParams.get('edit')) return;
    defaultsAppliedRef.current = true;
    (async () => {
      const fresh = await refreshSettings();
      const s = fresh ?? settings;
      setPglBase(pglBaseForType(currentType, s));
      setTransport(s.transportBase);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Save offer function
  const handleSaveOffer = async () => {
    setSaveLoading(true);
    const offerData = collectOfferData();
    // Nazwa jest opcjonalna. Pusta => baza nada "offer_<ID>" (kolumna generowana display_name).
    // Przy ponownym zapisie bierzemy nazwę SUROWĄ, nie display_name — inaczej oferta bez
    // nazwy zapisałaby "offer_14" jako nazwę własną i przestałaby być "bez nazwy".
    const name = saveOfferName.trim() || currentOfferRawName.trim();

    try {
      const url = currentOfferId ? `/api/offers/${currentOfferId}` : '/api/offers';
      const method = currentOfferId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_name: name, offer_data: offerData }),
      });
      
      if (res.ok) {
        const { offer } = await res.json();
        // Zapis edytowanej oferty z realną zmianą danych wraca z NOWYM id (nowa wersja,
        // np. offer_30 -> offer_30.1) — oryginał zostaje nietknięty. URL trzeba przestawić
        // na nowe id, inaczej odświeżenie strony wróciłoby do poprzedniej wersji.
        const isNewVersion = currentOfferId !== null && offer.id !== currentOfferId;
        const urlNeedsUpdate = !currentOfferId || isNewVersion;
        setCurrentOfferId(offer.id);
        setCurrentOfferName(offer.display_name);
        setCurrentOfferRawName(offer.offer_name ?? '');
        setCurrentOfferLabel(offerNumberLabel(offer));
        // Od tej chwili oferta ma własny, zamrożony kurs. Gdyby admin zmienił kurs, a
        // handlowiec zapisał ponownie tę samą ofertę z otwartej karty — zapisze się kurs
        // pierwotny, nie nowy.
        setRateOverride(offerData.eurPlnRate);
        setShowSaveModal(false);
        setSaveOfferName('');
        setSaveMessage({
          type: 'success',
          text: isNewVersion
            ? (language === 'pl'
                ? `Zapisano jako nową wersję: ${offerNumberLabel(offer)}`
                : `Saved as new version: ${offerNumberLabel(offer)}`)
            : currentOfferId ? (t.offers?.updated || 'Updated!') : (t.offers?.saved || 'Saved!'),
        });
        // Update URL without full navigation
        if (urlNeedsUpdate) {
          router.replace(`/calculator?edit=${offer.id}`, { scroll: false });
        }
      } else {
        setSaveMessage({ type: 'error', text: t.offers?.saveFailed || 'Save failed' });
      }
    } catch (error) {
      console.error('Error saving offer:', error);
      setSaveMessage({ type: 'error', text: t.offers?.saveFailed || 'Save failed' });
    } finally {
      setSaveLoading(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // Zapisz kontakt do firmy OD RĘKI, bez zapisywania całej oferty (POST
  // /api/clients/contacts, reużywa upsertClientFromOffer po stronie backendu).
  const handleSaveContact = async () => {
    if (clientInfo.firstName.trim() === '' && clientInfo.lastName.trim() === '') {
      setSaveMessage({ type: 'error', text: t.client?.contactNameRequired || 'Enter a first or last name' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    setContactSaving(true);
    try {
      const res = await fetch('/api/clients/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientInfo),
      });
      if (res.ok) {
        setSaveMessage({ type: 'success', text: t.client?.contactSaved || 'Contact saved to company directory' });
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveMessage({ type: 'error', text: data.error || t.client?.contactSaveFailed || 'Failed to save contact' });
      }
    } catch (error) {
      console.error('Error saving contact:', error);
      setSaveMessage({ type: 'error', text: t.client?.contactSaveFailed || 'Failed to save contact' });
    } finally {
      setContactSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // Calculate zestawienie totals
  const zestTotal = zestawienie.reduce((s, i) => s + i.totalValue, 0);
  const zestTons = zestawienie.reduce((s, i) => s + i.tons, 0);

  // CSS variables based on theme. Wysoki kontrast ma teraz wariant jasny i
  // ciemny (zamiast jednego, stałego motywu), zeby przycisk dark/light dalej
  // dzialal wizualnie, gdy wysoki kontrast jest wlaczony - patrz lib/themeVars.
  const cssVars = getThemeVars(isDark, highContrast);

  // Localized toggle options (współdzielone z lib/itemNotes.ts do odtworzenia opisu pozycji w PDF)
  const getLocalizedOptions = getHutaSscToggleOptions(t, language);

  return (
    <div 
      className="min-h-screen p-7 font-sans"
      style={{ 
        ...cssVars as React.CSSProperties,
        background: 'var(--bg)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Message Toast */}
      {saveMessage && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded-lg border shadow-lg z-50 animate-[fadeIn_0.2s_ease] ${
          saveMessage.type === 'success' 
            ? 'bg-[rgba(46,204,113,0.15)] border-[#2ecc71] text-[#2ecc71]' 
            : 'bg-[rgba(245,71,90,0.15)] border-[#f5475a] text-[#f5475a]'
        }`}>
          {saveMessage.text}
        </div>
      )}

      {/* Save Offer Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6 w-[400px] max-w-[90vw]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              {currentOfferId ? t.offers?.editOffer : t.offers?.saveOffer}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t.offers?.saveOfferPrompt}
            </p>
            <input
              type="text"
              value={saveOfferName}
              onChange={e => setSaveOfferName(e.target.value)}
              placeholder={t.offers?.offerNamePlaceholder}
              className={`w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[var(--accent-cr)] outline-none mb-2
                ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              autoFocus
            />
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              {t.offers?.offerNameOptionalHint}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setSaveOfferName('');
                }}
                className="px-4 py-2 text-sm rounded border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleSaveOffer}
                disabled={saveLoading}
                className="px-4 py-2 text-sm rounded bg-[var(--accent-cr)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saveLoading ? t.offers?.saving : t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center gap-4 mb-7 pb-5 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center font-mono font-semibold text-[13px] text-white bg-gradient-to-br from-[#3b8ef5] to-[#e8a020]">
          SSC
        </div>
        <div>
          <h1 className="text-[17px] font-semibold tracking-wide text-[var(--text-primary)]">
            {t.header.title}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
            {currentOfferName ? (
              <span>
                📋 <span className="text-[var(--accent-cr)]">{currentOfferName}</span> · {t.common.version}
              </span>
            ) : (
              <span>{t.header.subtitle} · {t.common.version}</span>
            )}
          </p>
        </div>
        
        {/* Language Selector */}
        <LanguageSelector className="ml-auto" />
        
        <button
          onClick={() => setIsDark(!isDark)}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] flex items-center gap-1.5 hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors"
        >
          <span className="text-sm">{isDark ? '☀️' : '🌙'}</span>
          <span>{isDark ? t.header.light : t.header.dark}</span>
        </button>
        <button
          onClick={() => setHighContrast(!highContrast)}
          className={`rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono flex items-center gap-1.5 border-2 transition-colors ${
            highContrast
              ? 'bg-black text-white border-black'
              : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span className="text-sm">🔲</span>
          <span>{highContrast ? t.header.highContrastOn : t.header.highContrastOff}</span>
        </button>
        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/';
          }}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] hover:border-[var(--accent-sum)] hover:text-[var(--accent-sum)] transition-colors"
        >
          {t.common.logout}
        </button>
      </header>

      {/* Currently Editing Banner — bardzo widoczny pasek, żeby nie dało się przeoczyć,
          że kalkulator jest w trybie edycji istniejącej oferty, a nie tworzenia nowej. */}
      {currentOfferId && (
        <div className="flex items-center gap-2.5 mb-6 px-4 py-2.5 rounded-md border-2 border-[var(--accent-cr)] bg-[rgba(59,142,245,0.12)] text-sm font-mono animate-[fadeIn_0.2s_ease]">
          <span className="text-base">✏️</span>
          <span className="text-[var(--text-primary)]">
            {t.offers?.currentlyEditingBanner || 'Teraz edytujesz ofertę:'}{' '}
            <span className="font-bold text-[var(--accent-cr)]">
              {currentOfferLabel || `offer_${currentOfferId}`}
            </span>
          </span>
        </div>
      )}

      {/* Navigation */}
      <Navigation isDark={isDark} highContrast={highContrast} />

      {/* Client Information Panel */}
      {/* BEZ overflow-hidden (inaczej niż pozostałe karty): lista podpowiedzi pod polem
          "Imię" wypada poza dolną krawędź panelu i przycięcie ucinało ją do paska.
          Zaokrąglenie górnych rogów przejmuje rounded-t-md na nagłówku poniżej. */}
      <div className="mb-6 bg-[var(--bg-card)] border border-[var(--border)] rounded-md">
        <button
          onClick={() => setShowClientInfo(!showClientInfo)}
          className="w-full flex items-center gap-2.5 px-4 py-3 rounded-t-md border-b border-[var(--border)] hover:bg-[rgba(255,255,255,0.025)] transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-[#a78bfa]" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
            {t.client?.title || 'Dane Klienta'}
          </h2>
          <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-1">{t.client?.subtitle || 'client info'}</span>
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">
            {showClientInfo ? (t.client?.collapse || 'Zwiń') : (t.client?.expand || 'Rozwiń')} 
            <span className="ml-1">{showClientInfo ? '▲' : '▼'}</span>
          </span>
        </button>
        
        {showClientInfo && (
          <div className="p-4 flex flex-col gap-5 animate-[fadeIn_0.2s_ease]">
            {/* --- Dane firmy: podstawa oferty, zawsze edytowalne --- */}
            <fieldset className="border-0 p-0 m-0">
              <legend className={sectionLegendClass}>
                {t.client?.companySection || 'Dane firmy'}
              </legend>

              <div className="grid grid-cols-4 gap-3">
                {/* Firma i NIP to wyszukiwarki po katalogu klientów. Wybór podpowiedzi
                    w KTÓREJKOLWIEK z nich uzupełnia cały komplet: firmę, NIP, adres
                    i SAP ID — stąd ten sam handler pod oboma polami.

                    fallbackQuery krzyżuje oba pola: puste pole szuka po zawartości
                    sąsiedniego. Dzięki temu skasowanie NIP-u przy wpisanej firmie nie
                    gasi podpowiedzi — kliknięcie w puste pole NIP pokazuje właśnie tę
                    firmę i pozwala odzyskać brakujący numer jednym Enterem. */}
                <ClientCombobox
                  label={t.client?.company || 'Firma'}
                  value={clientInfo.company}
                  onChange={value => setClientInfo(prev => ({ ...prev, company: value }))}
                  onSelect={applyClientSuggestion}
                  fallbackQuery={clientInfo.nip}
                  placeholder={t.client?.searchPlaceholder}
                  isDark={isDark}
                  highContrast={highContrast}
                  lookupErrorLabel={t.client?.lookupError || 'Nie udało się pobrać podpowiedzi'}
                />

                <ClientCombobox
                  label={t.client?.nip || 'NIP'}
                  value={clientInfo.nip}
                  onChange={value => setClientInfo(prev => ({ ...prev, nip: value }))}
                  onSelect={applyClientSuggestion}
                  fallbackQuery={clientInfo.company}
                  placeholder={t.client?.searchPlaceholder}
                  isDark={isDark}
                  highContrast={highContrast}
                  lookupErrorLabel={t.client?.lookupError || 'Nie udało się pobrać podpowiedzi'}
                />

                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabelClass}>
                    {t.client?.address || 'Adres'}
                  </label>
                  <input
                    type="text"
                    value={clientInfo.address}
                    onChange={e => setClientInfo(prev => ({ ...prev, address: e.target.value }))}
                    className={clientFieldClass}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabelClass}>
                    {t.client?.sapId || 'SAP ID'}
                  </label>
                  <input
                    type="text"
                    value={clientInfo.sapId}
                    onChange={e => setClientInfo(prev => ({ ...prev, sapId: e.target.value }))}
                    className={clientFieldClass}
                  />
                </div>
              </div>
            </fieldset>

            {/* --- Dane kontaktowe: opcjonalne, zablokowane bez firmy i NIP-u ---
                `fieldset disabled` wyłącza wszystkie pola w środku jednym atrybutem —
                bez rozstawiania `disabled` po każdym incie i, co ważniejsze, wypada
                wtedy z kolejności tabulacji, więc klawiaturą też się tam nie wejdzie. */}
            <fieldset
              disabled={!isContactUnlocked}
              className={`border-0 p-0 m-0 transition-opacity duration-200 ${
                isContactUnlocked ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <legend className={sectionLegendClass}>
                {t.client?.contactSection || 'Dane kontaktowe'}
              </legend>

              {!isContactUnlocked && (
                // Powód blokady, nie sama blokada. Wyszarzone pola bez wyjaśnienia
                // czytają się jak awaria; tu od razu widać, co odblokowuje sekcję.
                <p role="status" className="mb-3 text-[10px] font-mono text-[#f59e0b]">
                  {t.client?.contactLocked || 'Uzupełnij firmę i NIP, żeby wpisać dane kontaktowe'}
                </p>
              )}

              <div className="grid grid-cols-4 gap-3">
                {/* Imię jest wyszukiwarką po osobach TEJ firmy. Kontakty są wspólne dla
                    działu (tabela client_contacts, migracja 010), więc osobę wpisaną
                    kiedyś przez kogoś innego wystarczy tu wybrać zamiast przepisywać
                    z maila. Wybór uzupełnia też nazwisko, telefon i e-mail. */}
                <ContactCombobox
                  label={t.client?.firstName || 'Imię'}
                  value={clientInfo.firstName}
                  company={clientInfo.company}
                  nip={clientInfo.nip}
                  onChange={value => setClientInfo(prev => ({ ...prev, firstName: value }))}
                  onSelect={applyContactSuggestion}
                  placeholder={t.client?.contactSearchPlaceholder}
                  isDark={isDark}
                  highContrast={highContrast}
                  lookupErrorLabel={t.client?.lookupError || 'Nie udało się pobrać podpowiedzi'}
                />

                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabelClass}>
                    {t.client?.lastName || 'Nazwisko'}
                  </label>
                  <input
                    type="text"
                    value={clientInfo.lastName}
                    onChange={e => setClientInfo(prev => ({ ...prev, lastName: e.target.value }))}
                    className={clientFieldClass}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabelClass}>
                    {t.client?.phone || 'Telefon'}
                  </label>
                  <input
                    type="tel"
                    value={clientInfo.phone}
                    onChange={e => setClientInfo(prev => ({ ...prev, phone: e.target.value }))}
                    className={clientFieldClass}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabelClass}>
                    {t.client?.email || 'E-mail'}
                  </label>
                  <input
                    type="email"
                    value={clientInfo.email}
                    onChange={e => setClientInfo(prev => ({ ...prev, email: e.target.value }))}
                    className={clientFieldClass}
                  />
                </div>
              </div>

              {/* Zapis kontaktu OD RĘKI, bez zapisywania całej oferty — kontakt trafia
                  do wspólnego katalogu firmy (client_contacts) od razu po kliknięciu. */}
              <button
                type="button"
                onClick={handleSaveContact}
                disabled={contactSaving}
                className="mt-3 px-4 py-2 bg-[var(--accent-hdg)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {contactSaving
                  ? (t.client?.contactSaving || 'Saving...')
                  : (t.client?.saveContact || '💾 Save contact to company')}
              </button>
            </fieldset>
          </div>
        )}
      </div>

      {/* Steel Type Selector — 2 rzędy po 3 (HRS/CR/HDG, PICKLED/TEARDROP/ZM), nie 6 obok siebie */}
      <div ref={calculatorTopRef} className="grid grid-cols-3 gap-2.5 mb-6">
        {(['HRS', 'CR', 'HDG', 'PICKLED', 'TEARDROP', 'ZM'] as SteelType[]).map(type => {
          // Jawna mapa stylów per typ — Tailwind JIT wymaga literalnych klas, nie
          // interpolowanych stringów z nazwą typu.
          const style: Record<SteelType, { active: string; underline: string }> = {
            HRS: { active: 'bg-[rgba(232,160,32,0.08)] border-[var(--accent-hrs)] text-[var(--accent-hrs)]', underline: 'bg-[var(--accent-hrs)]' },
            CR: { active: 'bg-[rgba(59,142,245,0.08)] border-[var(--accent-cr)] text-[var(--accent-cr)]', underline: 'bg-[var(--accent-cr)]' },
            HDG: { active: 'bg-[rgba(46,204,113,0.08)] border-[var(--accent-hdg)] text-[var(--accent-hdg)]', underline: 'bg-[var(--accent-hdg)]' },
            PICKLED: { active: 'bg-[rgba(224,73,154,0.08)] border-[var(--accent-pickled)] text-[var(--accent-pickled)]', underline: 'bg-[var(--accent-pickled)]' },
            TEARDROP: { active: 'bg-[rgba(34,193,214,0.08)] border-[var(--accent-teardrop)] text-[var(--accent-teardrop)]', underline: 'bg-[var(--accent-teardrop)]' },
            ZM: { active: 'bg-[rgba(139,124,246,0.08)] border-[var(--accent-zm)] text-[var(--accent-zm)]', underline: 'bg-[var(--accent-zm)]' },
          };
          const activeClass = currentType === type
            ? style[type].active
            : 'bg-[var(--bg-panel)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]';

          return (
            <button
              key={type}
              onClick={() => selectType(type)}
              className={`py-3.5 px-5 rounded-md font-mono text-[15px] font-semibold tracking-widest border-[1.5px] transition-all relative overflow-hidden ${activeClass}`}
            >
              {t.steelTypes[type]}
              <span className="block text-[11px] font-normal tracking-wider opacity-70 mt-0.5">
                {t.steelTypes[`${type}_full` as keyof typeof t.steelTypes]}
              </span>
              {currentType === type && (
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${style[type].underline}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Tryb ARKUSZ / KRĄG — etykieta i kolor zawsze pokazują aktywny tryb, nie tylko "wyłączony" stan */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setIsCoilMode(!isCoilMode)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-md font-mono text-[12px] font-semibold tracking-wider border-[1.5px] transition-all
            ${isCoilMode
              ? 'bg-[rgba(168,85,247,0.12)] border-[#a855f7] text-[#a855f7] shadow-[0_0_12px_rgba(168,85,247,0.15)]'
              : 'bg-[rgba(59,142,245,0.12)] border-[var(--accent-cr)] text-[var(--accent-cr)] shadow-[0_0_12px_rgba(59,142,245,0.15)]'
            }`}
        >
          <span className={`w-8 h-[18px] rounded-full relative transition-all ${isCoilMode ? 'bg-[#a855f7]' : 'bg-[var(--accent-cr)]'}`}>
            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${isCoilMode ? 'left-[16px]' : 'left-[2px]'}`} />
          </span>
          <span className="uppercase">{isCoilMode ? t.inputs.coilMode : t.inputs.sheetMode}</span>
          <span className={`text-[10px] font-normal tracking-normal ${isCoilMode ? 'text-[#c084fc]' : 'text-[#7db4f8]'}`}>
            {isCoilMode ? t.inputs.coilModeShort : t.inputs.sheetModeShort}
          </span>
        </button>
      </div>

      {/* Input Parameters Bar */}
      <div className={`grid ${isCoilMode ? 'grid-cols-3' : 'grid-cols-4'} gap-3 mb-6 bg-[var(--bg-panel)] border border-[var(--border)] rounded-md p-4`}>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
            {t.inputs.thickness}
          </label>
          <NumericField
            value={thickness}
            onChange={setThickness}
            step="0.01"
            min="0"
            className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[var(--accent-cr)] outline-none transition-colors w-full
              ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
            {t.inputs.width}
          </label>
          <NumericField
            value={width}
            onChange={setWidth}
            parse={raw => parseInt(raw, 10)}
            step="1"
            min="0"
            className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[var(--accent-cr)] outline-none transition-colors w-full
              ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
          />
        </div>
        {!isCoilMode && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
              {t.inputs.length}
            </label>
            <NumericField
              value={length}
              onChange={setLength}
              parse={raw => parseInt(raw, 10)}
              step="1"
              min="0"
              className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[var(--accent-cr)] outline-none transition-colors w-full
                ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5 relative">
          <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
            {t.inputs.grade}
          </label>
          <input
            ref={gradeInputRef}
            type="text"
            value={gradeInput}
            onChange={e => {
              setGradeInput(e.target.value);
              setSelectedGrade(null);
            }}
            onFocus={() => setShowGradeDropdown(true)}
            onBlur={() => setTimeout(() => setShowGradeDropdown(false), 150)}
            placeholder={t.inputs.searchGrade}
            autoComplete="off"
            className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[var(--accent-cr)] outline-none transition-colors w-full
              ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
          />
          {showGradeDropdown && filteredGrades.length > 0 && (
            <div className={`absolute top-full left-0 right-0 mt-1 bg-[var(--bg-panel)] border border-[var(--border-hi)] rounded-md z-50 max-h-60 overflow-y-auto shadow-lg
              ${highContrast ? (isDark ? 'shadow-[0_8px_32px_rgba(255,255,255,0.15)]' : 'border-[#000000] shadow-[0_8px_32px_rgba(0,0,0,0.4)]') : !isDark ? 'border-[#7e90c0] shadow-[0_8px_32px_rgba(0,0,0,0.15)]' : 'shadow-[0_8px_32px_rgba(0,0,0,0.6)]'}`}>
              {filteredGrades.map(grade => (
                <div
                  key={grade.name}
                  onClick={() => selectGrade(grade)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer text-xs border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(59,142,245,0.12)] transition-colors
                    ${highContrast ? (isDark ? 'hover:bg-[rgba(255,255,255,0.15)]' : 'hover:bg-[rgba(0,0,0,0.15)]') : !isDark ? 'hover:bg-[rgba(0,0,0,0.05)]' : ''}`}
                >
                  <span className="font-mono text-[11px] text-[var(--text-value)]">
                    {grade.name}
                  </span>
                  <span className="font-mono text-xs font-semibold text-[var(--accent-hrs)] bg-[rgba(232,160,32,0.08)] px-2 py-0.5 rounded">
                    {money(grade.value)} {symbol}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sheet Weight */}
      {!isCoilMode && thickness > 0 && width > 0 && length > 0 && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-md">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">
            {t.inputs.sheetWeight}
          </span>
          <span className="font-mono text-[13px] font-bold text-[var(--accent)]">
            {((thickness * width * length * 7.85) / 1_000_000_000).toFixed(4)}
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">t</span>
          <span className="text-[10px] text-[var(--text-muted)] ml-1">
            ({((thickness * width * length * 7.85) / 1_000_000).toFixed(2)} kg)
          </span>
        </div>
      )}

      {/* Waluta wyświetlania. Świadomie POZA warunkiem bloku "Waga arkusza" — tamten blok
          znika w trybie KRĄG i przy pustych wymiarach, a przełącznik ma być zawsze widoczny. */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">
          {t.common.currencyLabel}
        </span>
        <CurrencySelector />
        {currency === 'PLN' && (
          <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1">
            1 EUR = {rate.toFixed(2)} PLN
          </span>
        )}
      </div>

      {/* Dimension Warning */}
      {warningText && (
        <div className={`flex items-center gap-2.5 mb-4 px-4 py-2.5 rounded-md border-l-[3px] border-[var(--accent-sum)] text-xs font-mono animate-[fadeIn_0.2s_ease]
          ${highContrast ? (isDark ? 'bg-[rgba(255,107,122,0.12)] border-[#ff6b7a] text-[#ff6b7a]' : 'bg-[#fff0f0] border-[#9c0b1e] text-[#9c0b1e]') : isDark ? 'bg-[rgba(245,71,90,0.08)] border-[rgba(245,71,90,0.4)] text-[#f5a0a8]' : 'bg-[rgba(245,71,90,0.08)] border-[rgba(245,71,90,0.4)] text-[#9b2a35]'}`}>
          <span className="text-base">⚠</span>
          <span dangerouslySetInnerHTML={{ __html: warningText }} />
        </div>
      )}

      {/* Base Surcharge Fallback Warning */}
      {baseSurchargeWarning && (
        <div className={`flex items-center gap-2.5 mb-4 px-4 py-2.5 rounded-md border-l-[3px] border-[var(--accent-sum)] text-xs font-mono animate-[fadeIn_0.2s_ease]
          ${highContrast ? (isDark ? 'bg-[rgba(255,107,122,0.12)] border-[#ff6b7a] text-[#ff6b7a]' : 'bg-[#fff0f0] border-[#9c0b1e] text-[#9c0b1e]') : isDark ? 'bg-[rgba(245,71,90,0.08)] border-[rgba(245,71,90,0.4)] text-[#f5a0a8]' : 'bg-[rgba(245,71,90,0.08)] border-[rgba(245,71,90,0.4)] text-[#9b2a35]'}`}>
          <span className="text-base">⚠</span>
          <span dangerouslySetInnerHTML={{ __html: baseSurchargeWarning }} />
        </div>
      )}

      {/* Legacy Item Edit Warning — item has no saved .inputs snapshot (pre-v1.3 offer) */}
      {legacyEditWarning && (
        <div className={`flex items-center gap-2.5 mb-4 px-4 py-2.5 rounded-md border-l-[3px] border-[var(--accent-sum)] text-xs font-mono animate-[fadeIn_0.2s_ease]
          ${highContrast ? (isDark ? 'bg-[rgba(255,107,122,0.12)] border-[#ff6b7a] text-[#ff6b7a]' : 'bg-[#fff0f0] border-[#9c0b1e] text-[#9c0b1e]') : isDark ? 'bg-[rgba(245,71,90,0.08)] border-[rgba(245,71,90,0.4)] text-[#f5a0a8]' : 'bg-[rgba(245,71,90,0.08)] border-[rgba(245,71,90,0.4)] text-[#9b2a35]'}`}>
          <span className="text-base">⚠</span>
          <span>{t.warnings.legacyItemEdit}</span>
        </div>
      )}

      {/* Main Grid - 3 columns normally, 2 columns in KRĄG mode */}
      <div className={`grid ${isCoilMode ? 'grid-cols-2' : 'grid-cols-3'} gap-3.5`}>
        {/* Column 1 - Huta Dopłaty */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden flex flex-col">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-hrs)]" />
            <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
              {t.huta.title}
            </h2>
            <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">{t.huta.subtitle}</span>
          </div>
          
          <div className="flex-1 py-2">
            {/* PGL Period */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.pglPeriod}</span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{money(0)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Dimension Surcharge */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.thicknessWidth}</span>
              <span className={`font-mono text-[13px] font-medium min-w-[64px] text-right ${dimSurcharge === null ? 'text-[var(--accent-sum)]' : 'text-[var(--text-value)]'}`}>
                {dimSurcharge !== null ? money(dimSurcharge) : '—'}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Grade Surcharge */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.grade}</span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">
                {money(selectedGrade ? selectedGrade.value : 0)}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Thickness Tolerance */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.thicknessTolerance}</span>
              <ToggleGroup
                options={TOL_THICK_OPTIONS[currentType]}
                value={tolThick}
                selectedIdx={tolThickIdx}
                onChangeIdx={(v, idx) => { setTolThick(v); setTolThickIdx(idx); }}
              />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(tolThick)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Certificate */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.certificate}</span>
              <ToggleGroup
                options={CERT_OPTIONS}
                value={cert}
                onChange={setCert}
              />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(cert)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Coating (HDG i ZM — różne klasy powłoki) */}
            {(currentType === 'HDG' || currentType === 'ZM') && (
              <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                <span className="flex-shrink-0 text-xs text-[var(--text-secondary)]">{t.huta.coating}</span>
                <div className="toggle-group flex flex-wrap gap-[2px] justify-end ml-2 flex-1 min-w-0">
                  {(currentType === 'ZM'
                    ? ['ZM70','ZM90','ZM120','ZM175','ZM195','ZM200','ZM250','ZM310','ZM430']
                    : ['Z100','Z140','Z200','Z225','Z275','Z350','Z450','Z600','Z725','Z800']
                  ).map(c => (
                    <button
                      key={c}
                      onClick={() => setSelectedCoating(c)}
                      className="toggle-btn px-[5px] py-[3px] rounded text-[9px] font-mono font-medium border transition-all whitespace-nowrap"
                      style={selectedCoating === c
                        ? {
                            backgroundColor: 'rgba(59,142,245,0.15)',
                            borderColor: '#3b8ef5',
                            color: '#3b8ef5',
                            fontWeight: 700,
                          }
                        : {
                            backgroundColor: highContrast ? (isDark ? '#000000' : '#ffffff') : isDark ? 'var(--bg-input)' : '#f4f5fa',
                            borderColor: highContrast ? (isDark ? '#ffffff' : '#000000') : isDark ? 'var(--border)' : '#9aa4c4',
                            color: highContrast ? (isDark ? '#ffffff' : '#000000') : isDark ? 'var(--text-secondary)' : '#2e3a5c',
                          }
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1 whitespace-nowrap flex-shrink-0">
                  {coatingSurcharge !== null ? money(coatingSurcharge) : t.huta.unavailable}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px] flex-shrink-0">
                  {coatingSurcharge !== null ? symbol : ''}
                </span>
              </div>
            )}
            
            {/* CR specific fields */}
            {currentType === 'CR' && (
              <>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.protection}</span>
                  <ToggleGroup options={CR_PROTECTION_OPTIONS} value={crZabezp} onChange={setCrZabezp} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(crZabezp)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.packaging}</span>
                  <ToggleGroup options={getLocalizedOptions.crPackaging} value={crOpak} selectedIdx={crOpakIdx} onChangeIdx={(v, idx) => { setCrOpak(v); setCrOpakIdx(idx); }} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(crOpak)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.surface} (CR)</span>
                  <ToggleGroup options={getLocalizedOptions.crSurface} value={crPowierz} onChange={setCrPowierz} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(crPowierz)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.surfaceFinish}</span>
                  <ToggleGroup options={getLocalizedOptions.crFinish} value={crWykon} selectedIdx={crWykonIdx} onChangeIdx={(v, idx) => { setCrWykon(v); setCrWykonIdx(idx); }} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(crWykon)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.weld}</span>
                  <ToggleGroup options={getLocalizedOptions.crWeld} value={crZgrzew} onChange={setCrZgrzew} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(crZgrzew)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
              </>
            )}
            
            {/* HDG specific fields */}
            {currentType === 'HDG' && (
              <>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.protection}</span>
                  <ToggleGroup options={HDG_PROTECTION_OPTIONS} value={hdgZabezp} selectedIdx={hdgZabezpIdx} onChangeIdx={(v, idx) => { setHdgZabezp(v); setHdgZabezpIdx(idx); }} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(hdgZabezp)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.packaging}</span>
                  <ToggleGroup options={getLocalizedOptions.hdgPackaging} value={hdgOpak} selectedIdx={hdgOpakIdx} onChangeIdx={(v, idx) => { setHdgOpak(v); setHdgOpakIdx(idx); }} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(hdgOpak)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.surface} (HDG)</span>
                  <ToggleGroup options={getLocalizedOptions.hdgSurface} value={hdgPowierz} onChange={setHdgPowierz} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(hdgPowierz)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.surfaceFinish}</span>
                  <ToggleGroup options={getLocalizedOptions.hdgFinish} value={hdgWykon} onChange={setHdgWykon} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(hdgWykon)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.weld}</span>
                  <ToggleGroup options={getLocalizedOptions.hdgWeld} value={hdgZgrzew} onChange={setHdgZgrzew} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(hdgZgrzew)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
              </>
            )}

            {/* Trawienie (PICKLED only) — zależne wyłącznie od grubości, jak dimSurcharge */}
            {currentType === 'PICKLED' && (
              <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.pickling}</span>
                <span className={`font-mono text-[13px] font-medium min-w-[64px] text-right ${picklingSurcharge === 0 ? 'text-[var(--accent-sum)]' : 'text-[var(--text-value)]'}`}>
                  {money(picklingSurcharge)}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
              </div>
            )}

            {/* Dopłata Łezka (TEARDROP only) — stała, nie toggle */}
            {currentType === 'TEARDROP' && (
              <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.teardropSurcharge}</span>
                <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">
                  {money(teardropSurcharge)}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
              </div>
            )}

            {/* ZM specific fields — 4 grupy dopłat, bez osobnego "wykonania" jak CR/HDG */}
            {currentType === 'ZM' && (
              <>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.protection}</span>
                  <ToggleGroup options={ZM_PROTECTION_OPTIONS} value={zmZabezp} selectedIdx={zmZabezpIdx} onChangeIdx={(v, idx) => { setZmZabezp(v); setZmZabezpIdx(idx); }} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(zmZabezp)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.packaging}</span>
                  <ToggleGroup options={getLocalizedOptions.zmPackaging} value={zmOpak} selectedIdx={zmOpakIdx} onChangeIdx={(v, idx) => { setZmOpak(v); setZmOpakIdx(idx); }} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(zmOpak)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.surface} (ZM)</span>
                  <ToggleGroup options={getLocalizedOptions.zmSurface} value={zmPowierz} onChange={setZmPowierz} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(zmPowierz)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.weld}</span>
                  <ToggleGroup options={getLocalizedOptions.zmWeld} value={zmZgrzew} onChange={setZmZgrzew} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(zmZgrzew)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
                </div>
              </>
            )}
          </div>

          {/* Sum Huta */}
          <div className={`flex items-center px-4 py-3 border-t-[1.5px] border-[var(--border-hi)] mt-auto ${highContrast ? (isDark ? 'bg-[rgba(255,255,255,0.08)]' : 'bg-[#e0e0e0]') : isDark ? 'bg-[rgba(0,0,0,0.18)]' : 'bg-[rgba(0,0,0,0.04)]'}`}>
            <span className="flex-1 text-[11px] font-bold tracking-widest uppercase text-[var(--accent-hrs)]">{t.huta.sum}</span>
            <span className="font-mono text-lg font-semibold text-[var(--accent-hrs)]">{money2(sumaHuta)}</span>
            <span className="text-[11px] text-[var(--text-secondary)] font-mono ml-1.5">{symbol}</span>
          </div>
        </div>

        {/* Column 2 - SSC Dopłaty Processing (hidden in KRĄG/Coil mode) */}
        {!isCoilMode && <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden flex flex-col">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
            <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
              {t.ssc.title}
            </h2>
            <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">{t.ssc.subtitle}</span>
          </div>
          
          <div className="flex-1 py-2">
            {/* Base Surcharge */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.baseSurcharge}</span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{money(baseSurcharge)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Length Tolerance */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.lengthTolerance}</span>
              <ToggleGroup options={getLocalizedOptions.lengthTolerance} value={sscLenTol} onChange={setSscLenTol} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(sscLenTol)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Flatness */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.flatness}</span>
              <ToggleGroup options={getLocalizedOptions.flatness} value={sscFlatness} onChange={setSscFlatness} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(sscFlatness)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Surface */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.surface}</span>
              <ToggleGroup options={getLocalizedOptions.surface} value={sscSurface} onChange={setSscSurface} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(sscSurface)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Max Weight */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.maxPackWeight}</span>
              <ToggleGroup options={SSC_MAX_WEIGHT_OPTIONS} value={sscMaxWeight} onChange={setSscMaxWeight} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(sscMaxWeight)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Marking */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.marking}</span>
              <ToggleGroup options={getLocalizedOptions.marking} value={sscMarking} onChange={setSscMarking} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(sscMarking)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Edging */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.edging}</span>
              <ToggleGroup options={getLocalizedOptions.edging} value={sscEdging} onChange={setSscEdging} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(sscEdging)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Yield Strength (HRS specific grades only) */}
            {showYield && (
              <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.yieldStrength}</span>
                <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{money(7)}</span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
              </div>
            )}
            
            {/* Packing */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.packaging}</span>
              <ToggleGroup options={SSC_PACKING_OPTIONS.map((o, idx) => ({ ...o, title: [t.ssc.packagingDesc.S01, t.ssc.packagingDesc.S03, t.ssc.packagingDesc.S12, t.ssc.packagingDesc.S13, t.ssc.packagingDesc.SB2, t.ssc.packagingDesc.SB3][idx] }))} value={sscPacking} selectedIdx={sscPackingIdx} onChangeIdx={(v, idx) => { setSscPacking(v); setSscPackingIdx(idx); }} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(sscPacking)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Labels */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.labels}</span>
              <ToggleGroup options={getLocalizedOptions.labels} value={sscLabels} onChange={setSscLabels} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{money(sscLabels)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Scrap */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">
                {t.ssc.scrap} <span className="text-[var(--text-muted)]">({language === 'pl' ? 'stała' : 'const'})</span>
              </span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{money(SCRAP_CONSTANT)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
          </div>
          
          {/* Sum SSC */}
          <div className={`flex items-center px-4 py-3 border-t-[1.5px] border-[var(--border-hi)] mt-auto ${highContrast ? (isDark ? 'bg-[rgba(255,255,255,0.08)]' : 'bg-[#e0e0e0]') : isDark ? 'bg-[rgba(0,0,0,0.18)]' : 'bg-[rgba(0,0,0,0.04)]'}`}>
            <span className="flex-1 text-[11px] font-bold tracking-widest uppercase text-[var(--accent-cr)]">{t.ssc.sum}</span>
            <span className="font-mono text-lg font-semibold text-[var(--accent-cr)]">{money2(sumaSSC)}</span>
            <span className="text-[11px] text-[var(--text-secondary)] font-mono ml-1.5">{symbol}</span>
          </div>
        </div>}

        {/* Column 3 - Podsumowanie */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden flex flex-col">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-sum)]" />
            <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
              {t.summary.title}
            </h2>
            <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">{t.summary.subtitle}</span>
          </div>
          
          <div className="flex-1 py-2">
            {/* PGL Base */}
            <div className="px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <div className="flex items-center">
                <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.pglBase}</span>
                {/* PGL to międzynarodowa cena wsadu notowana zawsze w EUR — w odróżnieniu od
                    reszty kwot to pole NIE podąża za przełącznikiem waluty (EUR/PLN). */}
                <NumericField
                  value={pglBase}
                  onChange={v => setPglBase(v)}
                  min="0"
                  className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-[110px] focus:border-[var(--accent-cr)] outline-none
                    ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
                />
                <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">€/t</span>
              </div>
              {/* Poniżej bazy z Ustawień -> ta pozycja będzie wymagać zatwierdzenia (patrz lib/offerReview.ts) */}
              {pglBase < pglBaseForType(currentType, settings) && (
                <p className="mt-1 text-[10px] text-[var(--accent-hrs)]">
                  ⚠️ {t.summary.pglBelowBaseWarning} ({pglBaseForType(currentType, settings)} €/t)
                </p>
              )}
            </div>
            
            {/* Wsad Price */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.inputPrice} (PGL + Σ {language === 'pl' ? 'Huta' : 'Mill'})</span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{money2(cenaWsadu)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            <div className="h-px bg-[var(--border)] mx-4 my-1" />
            
            {/* Margin % */}
            <div className="px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <div className="flex items-center">
                <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.margin} %</span>
                <NumericField
                  value={marginPct}
                  onChange={setMarginPct}
                  min="0"
                  step="0.1"
                  className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-[80px] focus:border-[var(--accent-cr)] outline-none
                    ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
                />
                <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">%</span>
              </div>
              {/* Poniżej minimum z Ustawień -> ta pozycja będzie wymagać zatwierdzenia (patrz lib/offerReview.ts) */}
              {marginPct < settings.minMarginPct && (
                <p className="mt-1 text-[10px] text-[var(--accent-hrs)]">
                  ⚠️ {t.summary.marginBelowMinWarning} ({settings.minMarginPct}%)
                </p>
              )}
            </div>
            
            {/* Margin Calculated */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.margin}</span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{money2(marzaNetto)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            <div className="h-px bg-[var(--border)] mx-4 my-1" />
            
            {/* Extra */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.extra}</span>
              <NumericField
                value={moneyInput(extra)}
                onChange={v => setExtra(fromDisplay(v))}
                min="0"
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-[80px] focus:border-[var(--accent-cr)] outline-none
                  ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Transport */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.transport}</span>
              <NumericField
                value={moneyInput(transport)}
                onChange={v => setTransport(fromDisplay(v))}
                min="0"
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-[80px] focus:border-[var(--accent-cr)] outline-none
                  ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            <div className="h-px bg-[var(--border)] mx-4 my-1" />
            
            {/* SSC Echo */}
            {!isCoilMode && (
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">Σ SSC {language === 'pl' ? 'Processing' : 'Processing'}</span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{money2(sumaSSC)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            )}
            
            {/* Final Price */}
            <div className="flex items-center px-4 py-2 mx-3.5 my-2 rounded bg-[rgba(245,71,90,0.08)] border border-[rgba(245,71,90,0.25)]">
              <span className="flex-1 text-xs text-[var(--text-primary)] font-semibold">{t.summary.finalPrice.toUpperCase()}</span>
              <span className="font-mono text-base font-bold text-[var(--accent-sum)] min-w-[64px] text-right">{moneyCeil(cenaKoncowa)}</span>
              <span className="text-[10px] text-[var(--accent-sum)] font-mono ml-1 w-[22px]">{symbol}</span>
            </div>
            
            {/* Tons */}
            <div className="flex items-center px-4 py-2 mx-3.5 mt-2">
              <span className="flex-1 text-xs font-semibold text-[var(--text-secondary)]">{t.summary.quantity}</span>
              <NumericField
                value={tons}
                onChange={setTons}
                min="0.01"
                step="0.5"
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-[80px] focus:border-[var(--accent-cr)] outline-none
                  ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.tons}</span>
            </div>
            
            {/* Add Button */}
            <div className="px-3.5 pt-2.5 pb-1.5">
              <button
                onClick={addToZestawienie}
                className={`w-full py-3 rounded font-mono text-xs font-bold tracking-wider hover:opacity-90 transition-opacity ${
                  editingId !== null
                    ? 'bg-gradient-to-r from-[#3b8ef5] to-[#5fa8ff] text-white'
                    : 'bg-gradient-to-r from-[#e8a020] to-[#f0c040] text-[#0d1220]'
                }`}
              >
                {editingId !== null ? `💾 ${t.summary.updateItem.toUpperCase()}` : `＋ ${t.summary.addToList.toUpperCase()}`}
              </button>
            </div>
          </div>
          
          {/* Sum Final */}
          <div className={`flex items-center px-4 py-3 border-t-[1.5px] border-[var(--border-hi)] mt-auto ${highContrast ? (isDark ? 'bg-[rgba(255,255,255,0.08)]' : 'bg-[#e0e0e0]') : isDark ? 'bg-[rgba(0,0,0,0.18)]' : 'bg-[rgba(0,0,0,0.04)]'}`}>
            <span className="flex-1 text-[11px] font-bold tracking-widest uppercase text-[var(--accent-sum)]">{isCoilMode ? (language === 'pl' ? 'Suma (Marża)' : 'Total (Margin)') : (language === 'pl' ? 'Suma (Marża + SSC)' : 'Total (Margin + SSC)')}</span>
            <span className="font-mono text-lg font-semibold text-[var(--accent-sum)]">{moneyCeil(cenaKoncowa)}</span>
            <span className="text-[11px] text-[var(--text-secondary)] font-mono ml-1.5">{symbol}</span>
          </div>
        </div>
      </div>

      {/* Zestawienie Section */}
      <div className="mt-6">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)]">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-hrs)]" />
            <span className="text-xs font-semibold tracking-widest uppercase">{t.zestawienie.title}</span>
            <span className="text-[10px] font-mono text-[var(--text-secondary)] ml-1">
              {zestawienie.length > 0 && `(${zestawienie.length} ${language === 'pl' ? (zestawienie.length === 1 ? 'pozycja' : zestawienie.length < 5 ? 'pozycje' : 'pozycji') : (zestawienie.length === 1 ? 'item' : 'items')} · ${zestTons.toFixed(2)} ${t.common.tons})`}
            </span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={handleExportExcel}
                disabled={zestawienie.length === 0}
                className="bg-transparent border border-[#1f8f4e] rounded px-3 py-1 text-[10px] font-mono text-[#1f8f4e] hover:bg-[rgba(31,143,78,0.1)] transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📊 {t.excel?.exportExcel || 'Eksportuj Excel'}
              </button>
              <button
                onClick={handleExportPDF}
                disabled={pdfLoading || zestawienie.length === 0}
                className="bg-transparent border border-[#2ecc71] rounded px-3 py-1 text-[10px] font-mono text-[#2ecc71] hover:bg-[rgba(46,204,113,0.1)] transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📄 {pdfLoading ? (t.pdf?.generating || 'Generowanie...') : (t.pdf?.exportPdf || 'Eksportuj do PDF')}
              </button>
              <button
                onClick={() => {
                  if (currentOfferId) {
                    handleSaveOffer();
                  } else {
                    setShowSaveModal(true);
                  }
                }}
                className="bg-transparent border border-[var(--accent-cr)] rounded px-3 py-1 text-[10px] font-mono text-[var(--accent-cr)] hover:bg-[rgba(59,142,245,0.1)] transition-colors flex items-center gap-1.5"
              >
                💾 {currentOfferId ? (t.common?.save || 'Zapisz') : (t.offers?.saveOffer || 'Zapisz ofertę')}
              </button>
              <button
                onClick={clearZestawienie}
                className="bg-transparent border border-[var(--border)] rounded px-2.5 py-1 text-[10px] font-mono text-[var(--text-muted)] hover:border-[var(--accent-sum)] hover:text-[var(--accent-sum)] transition-colors"
              >
                {t.zestawienie.clearAll}
              </button>
            </div>
          </div>
          
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className={`border-b border-[var(--border)] ${isDark ? 'bg-[var(--bg-panel)]' : 'bg-[var(--bg-panel)]'}`}>
                  <th className="px-3.5 py-2 font-mono text-[11px] text-[var(--text-secondary)] text-right tracking-wide uppercase whitespace-nowrap">{language === 'pl' ? 'Lp.' : 'No.'}</th>
                  <th className="px-3.5 py-2 font-mono text-[11px] text-[var(--text-secondary)] text-left tracking-wide uppercase whitespace-nowrap min-w-[180px]">{language === 'pl' ? 'Opis (Gatunek / Wymiary)' : 'Desc (Grade / Dimensions)'}</th>
                  <th className="px-3.5 py-2 font-mono text-[11px] text-[var(--text-secondary)] text-center tracking-wide uppercase whitespace-nowrap">{t.zestawienie.type}</th>
                  <th className="px-3.5 py-2 font-mono text-[11px] text-[var(--text-secondary)] text-right tracking-wide uppercase whitespace-nowrap">Σ {t.zestawienie.mill}</th>
                  <th className="px-3.5 py-2 font-mono text-[11px] text-[var(--text-secondary)] text-right tracking-wide uppercase whitespace-nowrap">Σ {t.zestawienie.ssc}</th>
                  <th className="px-3.5 py-2 font-mono text-[11px] text-[var(--text-secondary)] text-right tracking-wide uppercase whitespace-nowrap">{t.zestawienie.margin}</th>
                  <th className="px-3.5 py-2 font-mono text-[11px] text-[var(--text-secondary)] text-right tracking-wide uppercase whitespace-nowrap">{t.zestawienie.price}</th>
                  <th className="px-3.5 py-2 font-mono text-[11px] text-[var(--text-secondary)] text-right tracking-wide uppercase whitespace-nowrap">{t.zestawienie.tons}</th>
                  <th className="px-3.5 py-2 font-mono text-[11px] text-[var(--text-secondary)] text-right tracking-wide uppercase whitespace-nowrap">{t.zestawienie.value}</th>
                  <th className="px-3.5 py-2 font-mono text-[11px] text-[var(--text-secondary)] text-right tracking-wide uppercase whitespace-nowrap">{t.zestawienie.actions}</th>
                </tr>
              </thead>
              <tbody>
                {zestawienie.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-7 font-mono text-xs text-[var(--text-muted)] italic">
                      {t.zestawienie.empty}
                    </td>
                  </tr>
                ) : (
                  zestawienie.map((item, idx) => (
                    <tr
                      key={item.id}
                      onClick={() => editItem(item.id)}
                      className={`cursor-pointer border-b border-[rgba(42,48,72,0.4)] ${highContrast ? (isDark ? 'hover:bg-[rgba(255,255,255,0.10)]' : 'hover:bg-[rgba(0,0,0,0.10)]') : isDark ? 'hover:bg-[rgba(255,255,255,0.025)]' : 'hover:bg-[rgba(0,0,0,0.025)]'}`}
                    >
                      <td className="px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{idx + 1}</td>
                      <td className="px-3.5 py-2 text-left">
                        <div className="font-semibold text-xs text-[var(--text-primary)]">{item.grade}</div>
                        <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                          {item.thickness} × {item.width}{item.isCoil ? '' : ` × ${item.length}`} mm
                          {item.isCoil && <span className="ml-1.5 text-[9px] font-semibold text-[#a855f7] bg-[rgba(168,85,247,0.12)] px-1.5 py-0.5 rounded">{t.inputs.coilMode}</span>}
                        </div>
                      </td>
                      <td className="px-3.5 py-2 text-center">
                        <span className={`inline-block font-mono text-[10px] font-bold px-2 py-0.5 rounded tracking-wider
                          ${{
                            HRS: 'bg-[rgba(232,160,32,0.12)] text-[var(--accent-hrs)]',
                            CR: 'bg-[rgba(59,142,245,0.12)] text-[var(--accent-cr)]',
                            HDG: 'bg-[rgba(46,204,113,0.12)] text-[var(--accent-hdg)]',
                            PICKLED: 'bg-[rgba(224,73,154,0.12)] text-[var(--accent-pickled)]',
                            TEARDROP: 'bg-[rgba(34,193,214,0.12)] text-[var(--accent-teardrop)]',
                            ZM: 'bg-[rgba(139,124,246,0.12)] text-[var(--accent-zm)]',
                          }[item.type]}`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{money2(item.sumaHuta)}</td>
                      <td className="px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{money2(item.sumaSSC)}</td>
                      <td className="px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{money2(item.marza)}</td>
                      <td className="px-3.5 py-2 font-mono text-[13px] font-bold text-[var(--accent-sum)] text-right">{moneyCeil(item.finalPrice)} {symbol}</td>
                      <td className="px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{item.tons.toFixed(2)} {t.common.tons}</td>
                      <td className="px-3.5 py-2 font-mono text-[13px] font-bold text-[var(--accent-sum)] text-right">{moneyCeil(item.totalValue)} {currencyUnit}</td>
                      <td className="px-3.5 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => editItem(item.id)} className="bg-transparent border border-[var(--border)] rounded px-2 py-1 text-[13px] hover:border-[var(--accent-cr)] hover:text-[var(--accent-cr)] transition-colors ml-1" title={t.common.edit}>✏️</button>
                        <button onClick={() => dupItem(item.id)} className="bg-transparent border border-[var(--border)] rounded px-2 py-1 text-[13px] hover:border-[#a78bfa] hover:text-[#a78bfa] transition-colors ml-1" title={t.common.duplicate}>⧉</button>
                        <button onClick={() => deleteItem(item.id)} className="bg-transparent border border-[var(--border)] rounded px-2 py-1 text-[13px] hover:border-[var(--accent-sum)] hover:text-[var(--accent-sum)] transition-colors ml-1" title={t.common.delete}>🗑</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Total */}
          <div className={`flex items-center justify-between px-5 py-3.5 border-t-[1.5px] border-[var(--border-hi)] ${highContrast ? (isDark ? 'bg-[rgba(255,255,255,0.06)]' : 'bg-[#ececec]') : isDark ? 'bg-[rgba(0,0,0,0.10)]' : 'bg-[rgba(0,0,0,0.04)]'}`}>
            <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--text-secondary)]">
              {t.zestawienie.total}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-[var(--accent-sum)]">{moneyCeil(zestTotal)}</span>
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">{currencyUnit} {language === 'pl' ? 'łącznie' : 'total'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-4 text-center text-[11px] text-[var(--text-muted)] font-mono">
        {t.login.copyright} · {language === 'pl' ? 'Wszelkie wartości w €/t · Dane techniczne według specyfikacji EN 10051' : 'All values in €/t · Technical data per EN 10051 specification'}
      </footer>
    </div>
  );
}