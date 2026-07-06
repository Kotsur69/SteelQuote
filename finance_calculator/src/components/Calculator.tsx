'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import {
  GRADE_TABLES,
  DIMENSION_MATRIX_HRS,
  DIMENSION_MATRIX_CR,
  DIMENSION_MATRIX_HDG,
  MIN_THICKNESS_HRS,
  MIN_THICKNESS_CR,
  MIN_THICKNESS_HDG,
  COATING_MATRIX_HDG,
  LENGTH_SURCHARGE_HRS,
  BASE_SURCHARGE_CR_HDG,
  TOL_THICK_OPTIONS,
  YIELD_GRADES,
  SCRAP_CONSTANT,
  SteelType,
  Grade,
} from '@/lib/calculatorData';
import { useLanguage, LanguageSelector } from '@/contexts/LanguageContext';
import { formatWarning } from '@/lib/translations';
import { generateOfferPDF, ClientInfo } from '@/lib/pdfGenerator';

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
}

export default function Calculator() {
  // Language
  const { t, language } = useLanguage();
  
  // Steel type
  const [currentType, setCurrentType] = useState<SteelType>('HRS');
  
  // Theme
  const [isDark, setIsDark] = useState(true);
  
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
  const [extra, setExtra] = useState(10);
  const [transport, setTransport] = useState(20);
  const [tons, setTons] = useState(1);
  
  // Zestawienie
  const [zestawienie, setZestawienie] = useState<ZestawienieItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Offer management
  const searchParams = useSearchParams();
  const router = useRouter();
  const [currentOfferId, setCurrentOfferId] = useState<number | null>(null);
  const [currentOfferName, setCurrentOfferName] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveOfferName, setSaveOfferName] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Client info
  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    firstName: '',
    lastName: '',
    company: '',
    address: '',
    nip: '',
    phone: '',
    email: '',
  });
  const [showClientInfo, setShowClientInfo] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  
  // Grade dropdown
  const [showGradeDropdown, setShowGradeDropdown] = useState(false);
  const gradeInputRef = useRef<HTMLInputElement>(null);
  
  // Get active matrices based on type
  const activeDimensionMatrix = useMemo(() => {
    switch (currentType) {
      case 'CR': return DIMENSION_MATRIX_CR;
      case 'HDG': return DIMENSION_MATRIX_HDG;
      default: return DIMENSION_MATRIX_HRS;
    }
  }, [currentType]);
  
  const activeMinThickness = useMemo(() => {
    switch (currentType) {
      case 'CR': return MIN_THICKNESS_CR;
      case 'HDG': return MIN_THICKNESS_HDG;
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
  
  // Get coating surcharge for HDG
  const getCoatingSurcharge = useCallback((th: number, coating: string): number | null => {
    for (const row of COATING_MATRIX_HDG) {
      const thRange = row.th as { min: number; max: number };
      if (th >= thRange.min && th <= thRange.max) {
        const val = row[coating];
        return typeof val === 'number' ? val : null;
      }
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
  
  // Calculate coating surcharge for HDG
  const coatingSurcharge = useMemo(() => {
    if (currentType !== 'HDG') return 0;
    return getCoatingSurcharge(thickness, selectedCoating) || 0;
  }, [currentType, thickness, selectedCoating, getCoatingSurcharge]);
  
  // Calculate base surcharge
  const baseSurcharge = useMemo(() => {
    if (isCoilMode) return 0;
    if (currentType === 'HRS') {
      return getBaseLengthSurchargeHRS(thickness, length) || 29;
    }
    return getBaseSurchargeCRHDG(thickness, width) || 29;
  }, [currentType, thickness, length, width, isCoilMode, getBaseLengthSurchargeHRS, getBaseSurchargeCRHDG]);
  
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
    }
    
    return 0 + effectiveDim + gradeSurcharge + tolThick + cert + coatingSurcharge + crExtra;
  }, [dimSurcharge, selectedGrade, tolThick, cert, coatingSurcharge, currentType,
      crZabezp, crOpak, crPowierz, crWykon, crZgrzew,
      hdgZabezp, hdgOpak, hdgPowierz, hdgWykon, hdgZgrzew]);
  
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
    
    // Reset grade
    const defaultGrades: Record<SteelType, string> = { HRS: 'S235JR+N', CR: 'DC01', HDG: 'DX51D+Z' };
    const defaultName = defaultGrades[type];
    const defaultEntry = GRADE_TABLES[type].find(g => 
      g.name.replace(/\s/g, '').toLowerCase() === defaultName.replace(/\s/g, '').toLowerCase()
    ) || GRADE_TABLES[type][0];
    
    if (defaultEntry) {
      setGradeInput(defaultEntry.name);
      setSelectedGrade(defaultEntry);
    }
    
    // Set default dimensions per steel type
    if (type === 'HRS') {
      setThickness(4);
      setWidth(1500);
      setLength(3000);
      setSscSurface(10); // Improved = default for HRS
    } else if (type === 'CR') {
      setThickness(1.5);
      setWidth(1500);
      setLength(3000);
      setSscSurface(0);
    } else if (type === 'HDG') {
      setThickness(2);
      setWidth(1500);
      setLength(3000);
      setSscSurface(0);
    }
    
    // Reset tolerances
    setTolThick(0);
    setTolThickIdx(0);
    setCert(type === 'CR' ? 0 : 5);
    
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
  };
  
  // Toggle button component - uses index-based tracking for groups with duplicate values
  const ToggleGroup = ({ options, value, onChange, selectedIdx, onChangeIdx }: { 
    options: { label: string; value: number }[]; 
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
            onClick={() => {
              if (onChangeIdx) {
                onChangeIdx(opt.value, idx);
              } else if (onChange) {
                onChange(opt.value);
              }
            }}
            className={`toggle-btn px-[7px] py-[3px] rounded text-[9.5px] font-mono font-medium border transition-all whitespace-nowrap
              ${isActive
                ? 'bg-[rgba(59,142,245,0.15)] border-[#3b8ef5] text-[#3b8ef5] font-bold'
                : `bg-[var(--bg-input)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]
                   ${!isDark ? 'border-[#9aa4c4] text-[#2e3a5c] hover:border-[#5a6fa8] hover:text-[#0d1220] hover:bg-[#dde2f0]' : ''}`
              }`}
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
    };
    
    if (editingId !== null) {
      setZestawienie(prev => prev.map(item => item.id === editingId ? snap : item));
      setEditingId(null);
    } else {
      setZestawienie(prev => [...prev, snap]);
    }
  };
  
  // Edit zestawienie item
  const editItem = (id: number) => {
    const item = zestawienie.find(i => i.id === id);
    if (!item) return;
    
    setEditingId(id);
    selectType(item.type);
    setThickness(item.thickness);
    setWidth(item.width);
    setLength(item.length);
    setGradeInput(item.grade);
    setPglBase(item.pgl);
    setTons(item.tons);
    setIsCoilMode(item.isCoil || false);
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
    if (editingId === id) setEditingId(null);
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
    sscLenTol, sscFlatness, sscSurface,
    sscMaxWeight, sscMarking, sscEdging,
    sscPacking, sscPackingIdx, sscLabels,
    pglBase, marginPct, extra, transport, tons,
    zestawienie,
    clientInfo,
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
    if (data.clientInfo !== undefined) setClientInfo(data.clientInfo);
  };
  
  // PDF export handler
  const handleExportPDF = () => {
    if (zestawienie.length === 0) {
      setSaveMessage({ type: 'error', text: language === 'pl' ? 'Dodaj pozycje do zestawienia' : 'Add items to the list first' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    
    setPdfLoading(true);
    try {
      generateOfferPDF({
        offerName: currentOfferName || saveOfferName || '',
        offerId: currentOfferId,
        clientInfo,
        zestawienie,
      }, t);
      setSaveMessage({ type: 'success', text: language === 'pl' ? 'PDF wygenerowany!' : 'PDF generated!' });
    } catch (error) {
      console.error('PDF generation error:', error);
      setSaveMessage({ type: 'error', text: language === 'pl' ? 'Błąd generowania PDF' : 'PDF generation error' });
    } finally {
      setPdfLoading(false);
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
            setCurrentOfferName(offer.offer_name);
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
  
  // Save offer function
  const handleSaveOffer = async () => {
    if (!saveOfferName.trim() && !currentOfferName.trim()) return;
    
    setSaveLoading(true);
    const offerData = collectOfferData();
    const name = saveOfferName.trim() || currentOfferName.trim();
    
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
        setCurrentOfferId(offer.id);
        setCurrentOfferName(offer.offer_name);
        setShowSaveModal(false);
        setSaveOfferName('');
        setSaveMessage({ type: 'success', text: currentOfferId ? (t.offers?.updated || 'Updated!') : (t.offers?.saved || 'Saved!') });
        // Update URL without full navigation
        if (!currentOfferId) {
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
  
  // Calculate zestawienie totals
  const zestTotal = zestawienie.reduce((s, i) => s + i.totalValue, 0);
  const zestTons = zestawienie.reduce((s, i) => s + i.tons, 0);

  // CSS variables based on theme
  const cssVars = isDark ? {
    '--bg': '#0f1117',
    '--bg-panel': '#181c26',
    '--bg-card': '#1e2333',
    '--bg-input': '#141720',
    '--border': '#2a3048',
    '--border-hi': '#3d4a70',
    '--text-primary': '#e8ecf5',
    '--text-secondary': '#7b88aa',
    '--text-muted': '#4a536b',
    '--text-value': '#c8d4f0',
    '--accent-hrs': '#e8a020',
    '--accent-cr': '#3b8ef5',
    '--accent-hdg': '#2ecc71',
    '--accent-sum': '#f5475a',
  } : {
    '--bg': '#eef0f6',
    '--bg-panel': '#e2e6f0',
    '--bg-card': '#ffffff',
    '--bg-input': '#f4f5fa',
    '--border': '#b8c0d8',
    '--border-hi': '#7e90c0',
    '--text-primary': '#0d1220',
    '--text-secondary': '#2e3a5c',
    '--text-muted': '#6b789a',
    '--text-value': '#141e3a',
    '--accent-hrs': '#e8a020',
    '--accent-cr': '#3b8ef5',
    '--accent-hdg': '#2ecc71',
    '--accent-sum': '#f5475a',
  };

  // Localized toggle options
  const getLocalizedOptions = {
    lengthTolerance: [
      { label: t.toggles.normal, value: 0 },
      { label: t.toggles.lessThan5mm, value: 8 }
    ],
    flatness: [
      { label: t.toggles.enStandard, value: 0 },
      { label: t.toggles.laser13, value: 13 },
      { label: t.toggles.customerSpec, value: 8 }
    ],
    surface: [
      { label: t.toggles.normal, value: 0 },
      { label: t.toggles.improved, value: 10 }
    ],
    marking: [
      { label: t.toggles.none, value: 0 },
      { label: t.toggles.engraved, value: 5 },
      { label: t.toggles.marker, value: 3 }
    ],
    edging: [
      { label: t.common.no, value: 0 },
      { label: t.common.yes, value: 18 }
    ],
    labels: [
      { label: t.toggles.none, value: 0 },
      { label: language === 'pl' ? 'Koperta plast.' : 'Plastic env.', value: 0.5 }
    ],
    crPackaging: [
      { label: t.toggles.noPaper, value: 0 },
      { label: t.toggles.paperPlastic, value: 5 },
      { label: t.toggles.seaTransport, value: 5 }
    ],
    crSurface: [
      { label: t.toggles.surfaceA, value: 0 },
      { label: t.toggles.surfaceB, value: 40 }
    ],
    crFinish: [
      { label: t.toggles.normalFinish, value: 0 },
      { label: t.toggles.rough, value: 10 },
      { label: t.toggles.glossy, value: 25 },
      { label: t.toggles.semiGlossy, value: 10 }
    ],
    crWeld: [
      { label: t.toggles.allowed, value: -3 },
      { label: t.toggles.notAllowed, value: 5 },
      { label: t.toggles.other, value: 0 }
    ],
    hdgPackaging: [
      { label: t.toggles.noPaper, value: 0 },
      { label: t.toggles.paperPlastic, value: 5 },
      { label: t.toggles.seaTransport, value: 5 },
      { label: t.toggles.paperPlasticCE, value: 0 }
    ],
    hdgSurface: [
      { label: t.toggles.surfaceMA, value: 0 },
      { label: t.toggles.surfaceMB, value: 35 },
      { label: t.toggles.surfaceMC, value: 20 }
    ],
    hdgFinish: [
      { label: t.toggles.standard, value: 0 },
      { label: t.toggles.bright, value: 15 }
    ],
    hdgWeld: [
      { label: t.toggles.allowed, value: -3 },
      { label: t.toggles.notAllowed, value: 5 },
      { label: t.toggles.other, value: 0 }
    ],
  };

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
              value={saveOfferName || currentOfferName}
              onChange={e => setSaveOfferName(e.target.value)}
              placeholder={t.offers?.offerNamePlaceholder}
              className={`w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[var(--accent-cr)] outline-none mb-4
                ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              autoFocus
            />
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
                disabled={saveLoading || (!saveOfferName.trim() && !currentOfferName.trim())}
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
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/';
          }}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] hover:border-[var(--accent-sum)] hover:text-[var(--accent-sum)] transition-colors"
        >
          {t.common.logout}
        </button>
      </header>

      {/* Navigation */}
      <Navigation isDark={isDark} />

      {/* Client Information Panel */}
      <div className="mb-6 bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
        <button
          onClick={() => setShowClientInfo(!showClientInfo)}
          className="w-full flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)] hover:bg-[rgba(255,255,255,0.025)] transition-colors"
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
          <div className="p-4 grid grid-cols-4 gap-3 animate-[fadeIn_0.2s_ease]">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
                {t.client?.firstName || 'Imię'}
              </label>
              <input
                type="text"
                value={clientInfo.firstName}
                onChange={e => setClientInfo(prev => ({ ...prev, firstName: e.target.value }))}
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[#a78bfa] outline-none transition-colors w-full
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
                {t.client?.lastName || 'Nazwisko'}
              </label>
              <input
                type="text"
                value={clientInfo.lastName}
                onChange={e => setClientInfo(prev => ({ ...prev, lastName: e.target.value }))}
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[#a78bfa] outline-none transition-colors w-full
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
                {t.client?.company || 'Firma'}
              </label>
              <input
                type="text"
                value={clientInfo.company}
                onChange={e => setClientInfo(prev => ({ ...prev, company: e.target.value }))}
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[#a78bfa] outline-none transition-colors w-full
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
                {t.client?.nip || 'NIP'}
              </label>
              <input
                type="text"
                value={clientInfo.nip}
                onChange={e => setClientInfo(prev => ({ ...prev, nip: e.target.value }))}
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[#a78bfa] outline-none transition-colors w-full
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
                {t.client?.address || 'Adres'}
              </label>
              <input
                type="text"
                value={clientInfo.address}
                onChange={e => setClientInfo(prev => ({ ...prev, address: e.target.value }))}
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[#a78bfa] outline-none transition-colors w-full
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
                {t.client?.phone || 'Telefon'}
              </label>
              <input
                type="tel"
                value={clientInfo.phone}
                onChange={e => setClientInfo(prev => ({ ...prev, phone: e.target.value }))}
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[#a78bfa] outline-none transition-colors w-full
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
                {t.client?.email || 'E-mail'}
              </label>
              <input
                type="email"
                value={clientInfo.email}
                onChange={e => setClientInfo(prev => ({ ...prev, email: e.target.value }))}
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[#a78bfa] outline-none transition-colors w-full
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Steel Type Selector */}
      <div className="flex gap-2.5 mb-6">
        {(['HRS', 'CR', 'HDG'] as SteelType[]).map(type => {
          const labels = { 
            HRS: t.steelTypes.HRS_full, 
            CR: t.steelTypes.CR_full, 
            HDG: t.steelTypes.HDG_full 
          };
          const activeClass = currentType === type
            ? type === 'HRS' ? 'bg-[rgba(232,160,32,0.08)] border-[var(--accent-hrs)] text-[var(--accent-hrs)]'
            : type === 'CR' ? 'bg-[rgba(59,142,245,0.08)] border-[var(--accent-cr)] text-[var(--accent-cr)]'
            : 'bg-[rgba(46,204,113,0.08)] border-[var(--accent-hdg)] text-[var(--accent-hdg)]'
            : 'bg-[var(--bg-panel)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]';
          
          return (
            <button
              key={type}
              onClick={() => selectType(type)}
              className={`flex-1 py-3.5 px-5 rounded-md font-mono text-[15px] font-semibold tracking-widest border-[1.5px] transition-all relative overflow-hidden ${activeClass}`}
            >
              {type}
              <span className="block text-[11px] font-normal tracking-wider opacity-70 mt-0.5">
                {labels[type]}
              </span>
              {currentType === type && (
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                  type === 'HRS' ? 'bg-[var(--accent-hrs)]' : type === 'CR' ? 'bg-[var(--accent-cr)]' : 'bg-[var(--accent-hdg)]'
                }`} />
              )}
            </button>
          );
        })}
      </div>

      {/* KRĄG (Coil) Mode Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setIsCoilMode(!isCoilMode)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-md font-mono text-[12px] font-semibold tracking-wider border-[1.5px] transition-all
            ${isCoilMode
              ? 'bg-[rgba(168,85,247,0.12)] border-[#a855f7] text-[#a855f7] shadow-[0_0_12px_rgba(168,85,247,0.15)]'
              : `bg-[var(--bg-panel)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]`
            }`}
        >
          <span className={`w-8 h-[18px] rounded-full relative transition-all ${isCoilMode ? 'bg-[#a855f7]' : isDark ? 'bg-[#2a3048]' : 'bg-[#b8c0d8]'}`}>
            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all ${isCoilMode ? 'left-[16px] bg-white' : 'left-[2px] bg-[var(--text-muted)]'}`} />
          </span>
          <span>{t.inputs.coilMode}</span>
          <span className={`text-[10px] font-normal tracking-normal ${isCoilMode ? 'text-[#c084fc]' : 'text-[var(--text-muted)]'}`}>
            {isCoilMode ? t.inputs.coilModeShort : t.inputs.sheetMode}
          </span>
        </button>
      </div>

      {/* Input Parameters Bar */}
      <div className={`grid ${isCoilMode ? 'grid-cols-3' : 'grid-cols-4'} gap-3 mb-6 bg-[var(--bg-panel)] border border-[var(--border)] rounded-md p-4`}>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
            {t.inputs.thickness}
          </label>
          <input
            type="number"
            value={thickness}
            onChange={e => setThickness(parseFloat(e.target.value) || 0)}
            step="0.01"
            min="0"
            className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[var(--accent-cr)] outline-none transition-colors w-full
              ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
            {t.inputs.width}
          </label>
          <input
            type="number"
            value={width}
            onChange={e => setWidth(parseInt(e.target.value) || 0)}
            step="1"
            min="0"
            className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[var(--accent-cr)] outline-none transition-colors w-full
              ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
          />
        </div>
        {!isCoilMode && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
              {t.inputs.length}
            </label>
            <input
              type="number"
              value={length}
              onChange={e => setLength(parseInt(e.target.value) || 0)}
              step="1"
              min="0"
              className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[var(--accent-cr)] outline-none transition-colors w-full
                ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
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
              ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
          />
          {showGradeDropdown && filteredGrades.length > 0 && (
            <div className={`absolute top-full left-0 right-0 mt-1 bg-[var(--bg-panel)] border border-[var(--border-hi)] rounded-md z-50 max-h-60 overflow-y-auto shadow-lg
              ${!isDark ? 'border-[#7e90c0] shadow-[0_8px_32px_rgba(0,0,0,0.15)]' : 'shadow-[0_8px_32px_rgba(0,0,0,0.6)]'}`}>
              {filteredGrades.map(grade => (
                <div
                  key={grade.name}
                  onClick={() => selectGrade(grade)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer text-xs border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(59,142,245,0.12)] transition-colors
                    ${!isDark ? 'hover:bg-[rgba(0,0,0,0.05)]' : ''}`}
                >
                  <span className={`font-mono text-[11px] ${!isDark ? 'text-[#141e3a]' : 'text-[var(--text-value)]'}`}>
                    {grade.name}
                  </span>
                  <span className="font-mono text-xs font-semibold text-[var(--accent-hrs)] bg-[rgba(232,160,32,0.08)] px-2 py-0.5 rounded">
                    {grade.value} {t.common.currency}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dimension Warning */}
      {warningText && (
        <div className={`flex items-center gap-2.5 mb-4 px-4 py-2.5 rounded-md border-l-[3px] border-[var(--accent-sum)] text-xs font-mono animate-[fadeIn_0.2s_ease]
          ${isDark ? 'bg-[rgba(245,71,90,0.08)] border-[rgba(245,71,90,0.4)] text-[#f5a0a8]' : 'bg-[rgba(245,71,90,0.08)] border-[rgba(245,71,90,0.4)] text-[#9b2a35]'}`}>
          <span className="text-base">⚠</span>
          <span dangerouslySetInnerHTML={{ __html: warningText }} />
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
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">0</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Dimension Surcharge */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.thicknessWidth}</span>
              <span className={`font-mono text-[13px] font-medium min-w-[64px] text-right ${dimSurcharge === null ? 'text-[var(--accent-sum)]' : 'text-[var(--text-value)]'}`}>
                {dimSurcharge !== null ? dimSurcharge : '—'}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Grade Surcharge */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.grade}</span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">
                {selectedGrade ? selectedGrade.value : 0}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
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
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{tolThick}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Certificate */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.certificate}</span>
              <ToggleGroup
                options={[
                  { label: '2.2', value: 0 },
                  { label: '3.1', value: 5 },
                  { label: '3.2', value: 10 },
                ]}
                value={cert}
                onChange={setCert}
              />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{cert}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Coating (HDG only) */}
            {currentType === 'HDG' && (
              <div className="flex flex-wrap items-start px-4 py-2 border-b border-[rgba(42,48,72,0.5)] gap-y-1">
                <span className="w-full text-xs text-[var(--text-secondary)] mb-1">{t.huta.coating}</span>
                <div className="toggle-group flex flex-wrap gap-[3px] justify-start">
                  {['Z100','Z140','Z200','Z225','Z275','Z350','Z450','Z600','Z725','Z800'].map(c => (
                    <button
                      key={c}
                      onClick={() => setSelectedCoating(c)}
                      className={`toggle-btn px-[7px] py-[3px] rounded text-[9.5px] font-mono font-medium border transition-all whitespace-nowrap
                        ${selectedCoating === c
                          ? 'bg-[rgba(59,142,245,0.15)] border-[#3b8ef5] text-[#3b8ef5] font-bold'
                          : `bg-[var(--bg-input)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]
                             ${!isDark ? 'border-[#9aa4c4] text-[#2e3a5c] hover:border-[#5a6fa8] hover:text-[#0d1220] hover:bg-[#dde2f0]' : ''}`
                        }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <span className="w-full font-mono text-xs font-semibold text-[var(--text-value)] mt-1">
                  {coatingSurcharge !== null ? `${coatingSurcharge} ${t.common.currency}` : t.huta.unavailable}
                </span>
              </div>
            )}
            
            {/* CR specific fields */}
            {currentType === 'CR' && (
              <>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.protection}</span>
                  <ToggleGroup options={[{label:'O',value:0},{label:'U',value:3},{label:'A',value:5}]} value={crZabezp} onChange={setCrZabezp} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{crZabezp}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.packaging}</span>
                  <ToggleGroup options={getLocalizedOptions.crPackaging} value={crOpak} selectedIdx={crOpakIdx} onChangeIdx={(v, idx) => { setCrOpak(v); setCrOpakIdx(idx); }} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{crOpak}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.surface} (CR)</span>
                  <ToggleGroup options={getLocalizedOptions.crSurface} value={crPowierz} onChange={setCrPowierz} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{crPowierz}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.surfaceFinish}</span>
                  <ToggleGroup options={getLocalizedOptions.crFinish} value={crWykon} selectedIdx={crWykonIdx} onChangeIdx={(v, idx) => { setCrWykon(v); setCrWykonIdx(idx); }} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{crWykon}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.weld}</span>
                  <ToggleGroup options={getLocalizedOptions.crWeld} value={crZgrzew} onChange={setCrZgrzew} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{crZgrzew}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
                </div>
              </>
            )}
            
            {/* HDG specific fields */}
            {currentType === 'HDG' && (
              <>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.protection}</span>
                  <ToggleGroup options={[{label:'O',value:2},{label:'EO',value:2},{label:'S',value:20},{label:'CE',value:0}]} value={hdgZabezp} selectedIdx={hdgZabezpIdx} onChangeIdx={(v, idx) => { setHdgZabezp(v); setHdgZabezpIdx(idx); }} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{hdgZabezp}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.packaging}</span>
                  <ToggleGroup options={getLocalizedOptions.hdgPackaging} value={hdgOpak} selectedIdx={hdgOpakIdx} onChangeIdx={(v, idx) => { setHdgOpak(v); setHdgOpakIdx(idx); }} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{hdgOpak}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.surface} (HDG)</span>
                  <ToggleGroup options={getLocalizedOptions.hdgSurface} value={hdgPowierz} onChange={setHdgPowierz} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{hdgPowierz}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.surfaceFinish}</span>
                  <ToggleGroup options={getLocalizedOptions.hdgFinish} value={hdgWykon} onChange={setHdgWykon} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{hdgWykon}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
                </div>
                <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.huta.weld}</span>
                  <ToggleGroup options={getLocalizedOptions.hdgWeld} value={hdgZgrzew} onChange={setHdgZgrzew} />
                  <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{hdgZgrzew}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
                </div>
              </>
            )}
          </div>
          
          {/* Sum Huta */}
          <div className={`flex items-center px-4 py-3 border-t-[1.5px] border-[var(--border-hi)] mt-auto ${isDark ? 'bg-[rgba(0,0,0,0.18)]' : 'bg-[rgba(0,0,0,0.04)]'}`}>
            <span className="flex-1 text-[11px] font-bold tracking-widest uppercase text-[var(--accent-hrs)]">{t.huta.sum}</span>
            <span className="font-mono text-lg font-semibold text-[var(--accent-hrs)]">{sumaHuta.toFixed(2)}</span>
            <span className="text-[11px] text-[var(--text-secondary)] font-mono ml-1.5">{t.common.currency}</span>
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
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{baseSurcharge}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Length Tolerance */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.lengthTolerance}</span>
              <ToggleGroup options={getLocalizedOptions.lengthTolerance} value={sscLenTol} onChange={setSscLenTol} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{sscLenTol}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Flatness */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.flatness}</span>
              <ToggleGroup options={getLocalizedOptions.flatness} value={sscFlatness} onChange={setSscFlatness} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{sscFlatness}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Surface */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.surface}</span>
              <ToggleGroup options={getLocalizedOptions.surface} value={sscSurface} onChange={setSscSurface} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{sscSurface}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Max Weight */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.maxPackWeight}</span>
              <ToggleGroup options={[{label:'<1T',value:20},{label:'1–1,5T',value:10},{label:'1,5–2,25T',value:7.5},{label:'2,2–2,5T',value:5},{label:'2,5–3,5T',value:0},{label:'>3,5T',value:-3}]} value={sscMaxWeight} onChange={setSscMaxWeight} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{sscMaxWeight}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Marking */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.marking}</span>
              <ToggleGroup options={getLocalizedOptions.marking} value={sscMarking} onChange={setSscMarking} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{sscMarking}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Edging */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.edging}</span>
              <ToggleGroup options={getLocalizedOptions.edging} value={sscEdging} onChange={setSscEdging} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{sscEdging}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Yield Strength (HRS specific grades only) */}
            {showYield && (
              <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
                <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.yieldStrength}</span>
                <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">7</span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
              </div>
            )}
            
            {/* Packing */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.packaging}</span>
              <ToggleGroup options={[{label:'S01',value:0},{label:'S03',value:10},{label:'S12',value:5},{label:'S13',value:10},{label:'SB2',value:23},{label:'SB3',value:29}]} value={sscPacking} selectedIdx={sscPackingIdx} onChangeIdx={(v, idx) => { setSscPacking(v); setSscPackingIdx(idx); }} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{sscPacking}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Labels */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.ssc.labels}</span>
              <ToggleGroup options={getLocalizedOptions.labels} value={sscLabels} onChange={setSscLabels} />
              <span className="font-mono text-xs font-semibold text-[var(--text-value)] min-w-[28px] text-right ml-1">{sscLabels}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Scrap */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">
                {t.ssc.scrap} <span className="text-[var(--text-muted)]">({language === 'pl' ? 'stała' : 'const'})</span>
              </span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{SCRAP_CONSTANT}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
          </div>
          
          {/* Sum SSC */}
          <div className={`flex items-center px-4 py-3 border-t-[1.5px] border-[var(--border-hi)] mt-auto ${isDark ? 'bg-[rgba(0,0,0,0.18)]' : 'bg-[rgba(0,0,0,0.04)]'}`}>
            <span className="flex-1 text-[11px] font-bold tracking-widest uppercase text-[var(--accent-cr)]">{t.ssc.sum}</span>
            <span className="font-mono text-lg font-semibold text-[var(--accent-cr)]">{sumaSSC.toFixed(2)}</span>
            <span className="text-[11px] text-[var(--text-secondary)] font-mono ml-1.5">{t.common.currency}</span>
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
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.pglBase}</span>
              <input
                type="number"
                value={pglBase}
                onChange={e => setPglBase(parseFloat(e.target.value) || 0)}
                min="0"
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-[110px] focus:border-[var(--accent-cr)] outline-none
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Wsad Price */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.inputPrice} (PGL + Σ {language === 'pl' ? 'Huta' : 'Mill'})</span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{cenaWsadu.toFixed(2)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            <div className="h-px bg-[var(--border)] mx-4 my-1" />
            
            {/* Margin % */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.margin} %</span>
              <input
                type="number"
                value={marginPct}
                onChange={e => setMarginPct(parseFloat(e.target.value) || 0)}
                min="0"
                step="0.1"
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-[80px] focus:border-[var(--accent-cr)] outline-none
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">%</span>
            </div>
            
            {/* Margin Calculated */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.margin}</span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{marzaNetto.toFixed(2)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            <div className="h-px bg-[var(--border)] mx-4 my-1" />
            
            {/* Extra */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.extra}</span>
              <input
                type="number"
                value={extra}
                onChange={e => setExtra(parseFloat(e.target.value) || 0)}
                min="0"
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-[80px] focus:border-[var(--accent-cr)] outline-none
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Transport */}
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">{t.summary.transport}</span>
              <input
                type="number"
                value={transport}
                onChange={e => setTransport(parseFloat(e.target.value) || 0)}
                min="0"
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-[80px] focus:border-[var(--accent-cr)] outline-none
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            <div className="h-px bg-[var(--border)] mx-4 my-1" />
            
            {/* SSC Echo */}
            {!isCoilMode && (
            <div className="flex items-center px-4 py-2 border-b border-[rgba(42,48,72,0.5)] hover:bg-[rgba(255,255,255,0.025)]">
              <span className="flex-1 text-xs text-[var(--text-secondary)]">Σ SSC {language === 'pl' ? 'Processing' : 'Processing'}</span>
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium min-w-[64px] text-right">{sumaSSC.toFixed(2)}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            )}
            
            {/* Final Price */}
            <div className="flex items-center px-4 py-2 mx-3.5 my-2 rounded bg-[rgba(245,71,90,0.08)] border border-[rgba(245,71,90,0.25)]">
              <span className="flex-1 text-xs text-[var(--text-primary)] font-semibold">{t.summary.finalPrice.toUpperCase()}</span>
              <span className="font-mono text-base font-bold text-[var(--accent-sum)] min-w-[64px] text-right">{cenaKoncowa.toFixed(2)}</span>
              <span className="text-[10px] text-[var(--accent-sum)] font-mono ml-1 w-[22px]">{t.common.currency}</span>
            </div>
            
            {/* Tons */}
            <div className="flex items-center px-4 py-2 mx-3.5 mt-2">
              <span className="flex-1 text-xs font-semibold text-[var(--text-secondary)]">{t.summary.quantity}</span>
              <input
                type="number"
                value={tons}
                onChange={e => setTons(parseFloat(e.target.value) || 1)}
                min="0.01"
                step="0.5"
                className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-[80px] focus:border-[var(--accent-cr)] outline-none
                  ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{t.common.tons}</span>
            </div>
            
            {/* Add Button */}
            <div className="px-3.5 pt-2.5 pb-1.5">
              <button
                onClick={addToZestawienie}
                className="w-full py-3 rounded bg-gradient-to-r from-[#e8a020] to-[#f0c040] text-[#0d1220] font-mono text-xs font-bold tracking-wider hover:opacity-90 transition-opacity"
              >
                {editingId !== null ? `💾 ${t.summary.updateItem.toUpperCase()}` : `＋ ${t.summary.addToList.toUpperCase()}`}
              </button>
            </div>
          </div>
          
          {/* Sum Final */}
          <div className={`flex items-center px-4 py-3 border-t-[1.5px] border-[var(--border-hi)] mt-auto ${isDark ? 'bg-[rgba(0,0,0,0.18)]' : 'bg-[rgba(0,0,0,0.04)]'}`}>
            <span className="flex-1 text-[11px] font-bold tracking-widest uppercase text-[var(--accent-sum)]">{isCoilMode ? (language === 'pl' ? 'Suma (Marża)' : 'Total (Margin)') : (language === 'pl' ? 'Suma (Marża + SSC)' : 'Total (Margin + SSC)')}</span>
            <span className="font-mono text-lg font-semibold text-[var(--accent-sum)]">{cenaKoncowa.toFixed(2)}</span>
            <span className="text-[11px] text-[var(--text-secondary)] font-mono ml-1.5">{t.common.currency}</span>
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
                    <tr key={item.id} className={`border-b border-[rgba(42,48,72,0.4)] ${isDark ? 'hover:bg-[rgba(255,255,255,0.025)]' : 'hover:bg-[rgba(0,0,0,0.025)]'}`}>
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
                          ${item.type === 'HRS' ? 'bg-[rgba(232,160,32,0.12)] text-[var(--accent-hrs)]' : 
                            item.type === 'CR' ? 'bg-[rgba(59,142,245,0.12)] text-[var(--accent-cr)]' : 
                            'bg-[rgba(46,204,113,0.12)] text-[var(--accent-hdg)]'}`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{item.sumaHuta.toFixed(2)}</td>
                      <td className="px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{item.sumaSSC.toFixed(2)}</td>
                      <td className="px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{item.marza.toFixed(2)}</td>
                      <td className="px-3.5 py-2 font-mono text-[13px] font-bold text-[var(--accent-sum)] text-right">{item.finalPrice.toFixed(2)} {t.common.currency}</td>
                      <td className="px-3.5 py-2 font-mono text-xs text-[var(--text-value)] text-right">{item.tons.toFixed(2)} {t.common.tons}</td>
                      <td className="px-3.5 py-2 font-mono text-[13px] font-bold text-[var(--accent-sum)] text-right">{item.totalValue.toFixed(2)} €</td>
                      <td className="px-3.5 py-2 text-right whitespace-nowrap">
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
          <div className={`flex items-center justify-between px-5 py-3.5 border-t-[1.5px] border-[var(--border-hi)] ${isDark ? 'bg-[rgba(0,0,0,0.10)]' : 'bg-[rgba(0,0,0,0.04)]'}`}>
            <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--text-secondary)]">
              {t.zestawienie.total}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-[var(--accent-sum)]">{zestTotal.toFixed(2)}</span>
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">€ {language === 'pl' ? 'łącznie' : 'total'}</span>
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