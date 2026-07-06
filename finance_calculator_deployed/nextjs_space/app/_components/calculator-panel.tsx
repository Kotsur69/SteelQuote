'use client';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLang } from '@/lib/lang-context';
import { t, type Lang } from '@/lib/translations';
import type { SteelType, CalcInputs, CalcResults, CoatingName, GradeEntry } from '@/lib/calc-data';
import {
  defaults, recalculate, GRADE_TABLE_HRS, GRADE_TABLE_CR, GRADE_TABLE_HDG,
  TOL_THICK_OPTIONS, COATING_NAMES, SCRAP_CONSTANT, isYieldGrade,
  getDimensionSurcharge, getCoatingSurcharge, getBaseSurchargeCRHDG, getBaseLengthSurchargeHRS,
  HUTA_CONSTANTS
} from '@/lib/calc-data';

const GRADE_TABLES: Record<SteelType, GradeEntry[]> = { HRS: GRADE_TABLE_HRS, CR: GRADE_TABLE_CR, HDG: GRADE_TABLE_HDG };

// ─── Toggle Button Group component ───
function ToggleGroup({ options, activeIdx, onChange }: {
  options: { label: string; value: number }[];
  activeIdx: number;
  onChange: (idx: number, value: number) => void;
}) {
  return (
    <div className="toggle-group">
      {options.map((o, i) => (
        <button
          key={i}
          type="button"
          className={`toggle-btn${i === activeIdx ? ' active-toggle' : ''}`}
          onClick={() => onChange(i, o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Data row component ───
function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="data-row">
      <span className="row-label">{label}</span>
      {children}
    </div>
  );
}

function ValBadge({ value, unit }: { value: number | string; unit?: string }) {
  return (
    <>
      <span className="row-val-badge">{typeof value === 'number' ? value : value}</span>
      {unit !== undefined && <span className="row-unit">{unit}</span>}
    </>
  );
}

// Toggle option definitions for each surcharge
const CERT_OPTIONS = [
  { label: '2.2', value: 0 },
  { label: '3.1', value: 5 },
  { label: '3.2', value: 10 },
];

const CR_ZABEZP = [{ label: 'O', value: 0 }, { label: 'U', value: 3 }, { label: 'A', value: 5 }];
const CR_OPAK = (l: Lang) => [{ label: t('tNoPaper', l), value: 0 }, { label: t('tPaperPlastic', l), value: 5 }, { label: t('tSeaTransport', l), value: 5 }];
const CR_POWIERZ = [{ label: 'A', value: 0 }, { label: 'B', value: 40 }];
const CR_WYKON = (l: Lang) => [{ label: t('tNormal', l), value: 0 }, { label: t('tRough', l), value: 10 }, { label: t('tGlossy', l), value: 25 }, { label: t('tSemiGloss', l), value: 10 }];
const CR_ZGRZEW = (l: Lang) => [{ label: t('tAllowed', l), value: -3 }, { label: t('tNotAllowed', l), value: 5 }, { label: t('tOther', l), value: 0 }];

const HDG_ZABEZP = [{ label: 'O', value: 2 }, { label: 'EO', value: 2 }, { label: 'S', value: 20 }, { label: 'CE', value: 0 }];
const HDG_OPAK = (l: Lang) => [{ label: t('tNoPaper', l), value: 0 }, { label: t('tPaperPlastic', l), value: 5 }, { label: t('tSeaTransport', l), value: 5 }, { label: t('tPaperPlasticCE', l), value: 0 }];
const HDG_POWIERZ = [{ label: 'MA', value: 0 }, { label: 'MB', value: 35 }, { label: 'MC', value: 20 }];
const HDG_WYKON = (l: Lang) => [{ label: t('tStandard', l), value: 0 }, { label: t('tShiny', l), value: 15 }];
const HDG_ZGRZEW = (l: Lang) => [{ label: t('tAllowed', l), value: -3 }, { label: t('tNotAllowed', l), value: 5 }, { label: t('tOther', l), value: 0 }];

const SSC_LEN_TOL = (l: Lang) => [{ label: t('tNormal', l), value: 0 }, { label: '<5mm', value: 8 }];
const SSC_FLATNESS = (l: Lang) => [{ label: t('tEnStandard', l), value: 0 }, { label: t('tLaser13', l), value: 13 }, { label: t('tCustomer', l), value: 8 }];
const SSC_SURFACE = (l: Lang) => [{ label: t('tNormal', l), value: 0 }, { label: t('tImproved', l), value: 10 }];
const SSC_MAXWEIGHT = [
  { label: '<1T', value: 20 }, { label: '1–1,5T', value: 10 }, { label: '1,5–2,25T', value: 7.5 },
  { label: '2,2–2,5T', value: 5 }, { label: '2,5–3,5T', value: 0 }, { label: '>3,5T', value: -3 },
];
const SSC_MARKING = (l: Lang) => [{ label: t('tNone', l), value: 0 }, { label: t('tEngraving', l), value: 5 }, { label: t('tMarker', l), value: 3 }];
const SSC_EDGING = (l: Lang) => [{ label: t('tNo', l), value: 0 }, { label: t('tYes', l), value: 18 }];
const SSC_PACKING = [
  { label: 'S01', value: 0 }, { label: 'S03', value: 10 }, { label: 'S12', value: 5 },
  { label: 'S13', value: 10 }, { label: 'SB2', value: 23 }, { label: 'SB3', value: 29 },
];
const SSC_LABELS = (l: Lang) => [{ label: t('tNone', l), value: 0 }, { label: t('tPlasticEnv', l), value: 0.5 }];

export interface OrderItem {
  id: string;
  steelType: SteelType;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  isCoil: boolean;
  coating: string;
  quantity: number;
  pricePerTon: number;
  totalValue: number;
  inputs: CalcInputs;
  results: CalcResults;
}

export interface ClientInfo {
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  nip: string;
  phone: string;
  email: string;
}

interface Props {
  orderItems: OrderItem[];
  onAddToOrder: (item: OrderItem) => void;
  onRemoveOrder: (id: string) => void;
  onDuplicateOrder: (id: string) => void;
  onUpdateOrder: (id: string, item: OrderItem) => void;
  onClearOrders: () => void;
  onSaveOffer?: (name: string, items: OrderItem[]) => Promise<void>;
  onUpdateOffer?: (id: string, name: string, items: OrderItem[]) => Promise<void>;
  editingOfferId?: string | null;
  editingOfferName?: string | null;
  onCancelEdit?: () => void;
  clientInfo: ClientInfo;
  onClientInfoChange: (info: ClientInfo) => void;
}

export default function CalculatorPanel({ orderItems, onAddToOrder, onRemoveOrder, onDuplicateOrder, onUpdateOrder, onClearOrders, onSaveOffer, onUpdateOffer, editingOfferId, editingOfferName, onCancelEdit, clientInfo, onClientInfoChange }: Props) {
  const { lang } = useLang();
  const [clientOpen, setClientOpen] = useState(true);

  const updateClient = (field: keyof ClientInfo, val: string) => {
    onClientInfoChange({ ...clientInfo, [field]: val });
  };

  // ─── Steel type & coil ───
  const [steelType, setSteelType] = useState<SteelType>('HRS');
  const [isCoil, setIsCoil] = useState(false);

  // ─── Dimensions ───
  const [thickness, setThickness] = useState(defaults.HRS.thickness);
  const [width, setWidth] = useState(defaults.HRS.width);
  const [length, setLength] = useState(defaults.HRS.length);

  // ─── Grade autocomplete ───
  const [gradeSearch, setGradeSearch] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<GradeEntry | null>(null);
  const [gradeDropdownOpen, setGradeDropdownOpen] = useState(false);
  const gradeRef = useRef<HTMLDivElement>(null);

  // ─── HUTA toggles ───
  const [tolThickIdx, setTolThickIdx] = useState(0);
  const [certIdx, setCertIdx] = useState(1); // default 3.1
  const [coatingIdx, setCoatingIdx] = useState(4); // Z275

  // CR extra toggles
  const [crZabezpIdx, setCrZabezpIdx] = useState(0); // O=0
  const [crOpakIdx, setCrOpakIdx] = useState(1); // Papier=5
  const [crPowierzIdx, setCrPowierzIdx] = useState(0); // A=0
  const [crWykonIdx, setCrWykonIdx] = useState(0); // Normalna=0
  const [crZgrzewIdx, setCrZgrzewIdx] = useState(0); // Dozwolony=-3

  // HDG extra toggles
  const [hdgZabezpIdx, setHdgZabezpIdx] = useState(3); // CE=0
  const [hdgOpakIdx, setHdgOpakIdx] = useState(1); // Papier=5
  const [hdgPowierzIdx, setHdgPowierzIdx] = useState(0); // MA=0
  const [hdgWykonIdx, setHdgWykonIdx] = useState(0); // Standard=0
  const [hdgZgrzewIdx, setHdgZgrzewIdx] = useState(0); // Dozwolony=-3

  // ─── SSC toggles ───
  const [sscLenTolIdx, setSscLenTolIdx] = useState(0);
  const [sscFlatnessIdx, setSscFlatnessIdx] = useState(0);
  const [sscSurfaceIdx, setSscSurfaceIdx] = useState(0); // Normalna=0
  const [sscMaxWeightIdx, setSscMaxWeightIdx] = useState(4); // 2.5-3.5T=0
  const [sscMarkingIdx, setSscMarkingIdx] = useState(0);
  const [sscEdgingIdx, setSscEdgingIdx] = useState(0);
  const [sscPackingIdx, setSscPackingIdx] = useState(0);
  const [sscLabelsIdx, setSscLabelsIdx] = useState(0);

  // ─── Summary inputs ───
  const [pglBase, setPglBase] = useState(645);
  const [marginPct, setMarginPct] = useState(7);
  const [extra, setExtra] = useState(10);
  const [transport, setTransport] = useState(20);
  const [tons, setTons] = useState(1);

  // ─── Editing item state ───
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const skipTypeResetRef = useRef(false);

  // ─── Type change: reset defaults (skip when loading item for edit) ───
  useEffect(() => {
    if (skipTypeResetRef.current) { skipTypeResetRef.current = false; return; }
    const d = defaults[steelType];
    setThickness(d.thickness);
    setWidth(d.width);
    setLength(d.length);
    setTolThickIdx(0);

    // Default cert: 3.1(idx=1) for HRS/HDG, 2.2(idx=0) for CR
    setCertIdx(steelType === 'CR' ? 0 : 1);

    if (steelType === 'HDG') setCoatingIdx(4); // Z275

    // Reset CR/HDG extra toggles to defaults
    setCrZabezpIdx(0); setCrOpakIdx(1); setCrPowierzIdx(0); setCrWykonIdx(0); setCrZgrzewIdx(0);
    setHdgZabezpIdx(3); setHdgOpakIdx(1); setHdgPowierzIdx(0); setHdgWykonIdx(0); setHdgZgrzewIdx(0);

    // Default grade
    const gradeTable = GRADE_TABLES[steelType];
    const defaultName = d.grade;
    const entry = gradeTable.find(g => g.name === defaultName) || gradeTable[0] || null;
    setSelectedGrade(entry);
    setGradeSearch(entry?.name || '');
  }, [steelType]);

  // ─── Grade filtering ───
  const gradeTable = GRADE_TABLES[steelType];
  const filteredGrades = useMemo(() => {
    if (!gradeSearch) return gradeTable;
    const q = gradeSearch.toLowerCase();
    return gradeTable.filter(g => g.name.toLowerCase().includes(q));
  }, [gradeTable, gradeSearch]);

  // Close grade dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (gradeRef.current && !gradeRef.current.contains(e.target as Node)) {
        setGradeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── Compute CalcInputs ───
  const gradeValue = selectedGrade?.value ?? 0;
  const gradeName = selectedGrade?.name ?? '';
  const showYield = isYieldGrade(gradeName);
  const yieldVal = showYield ? 7 : 0;

  const tolThickVal = TOL_THICK_OPTIONS[steelType]?.[tolThickIdx]?.value ?? 0;
  const certVal = CERT_OPTIONS[certIdx]?.value ?? 0;

  const inputs: CalcInputs = useMemo(() => ({
    steelType,
    thickness,
    width,
    length,
    grade: gradeName,
    gradeValue,
    isCoil,
    coating: COATING_NAMES[coatingIdx] as CoatingName,
    tolThick: tolThickVal,
    cert: certVal,
    crZabezp: CR_ZABEZP[crZabezpIdx]?.value ?? 0,
    crOpak: CR_OPAK(lang)[crOpakIdx]?.value ?? 0,
    crPowierz: CR_POWIERZ[crPowierzIdx]?.value ?? 0,
    crWykon: CR_WYKON(lang)[crWykonIdx]?.value ?? 0,
    crZgrzew: CR_ZGRZEW(lang)[crZgrzewIdx]?.value ?? 0,
    hdgZabezp: HDG_ZABEZP[hdgZabezpIdx]?.value ?? 0,
    hdgOpak: HDG_OPAK(lang)[hdgOpakIdx]?.value ?? 0,
    hdgPowierz: HDG_POWIERZ[hdgPowierzIdx]?.value ?? 0,
    hdgWykon: HDG_WYKON(lang)[hdgWykonIdx]?.value ?? 0,
    hdgZgrzew: HDG_ZGRZEW(lang)[hdgZgrzewIdx]?.value ?? 0,
    sscBase: 0,
    sscLenTol: SSC_LEN_TOL(lang)[sscLenTolIdx]?.value ?? 0,
    sscFlatness: SSC_FLATNESS(lang)[sscFlatnessIdx]?.value ?? 0,
    sscSurface: SSC_SURFACE(lang)[sscSurfaceIdx]?.value ?? 0,
    sscMaxWeight: SSC_MAXWEIGHT[sscMaxWeightIdx]?.value ?? 0,
    sscMarking: SSC_MARKING(lang)[sscMarkingIdx]?.value ?? 0,
    sscEdging: SSC_EDGING(lang)[sscEdgingIdx]?.value ?? 0,
    sscYield: yieldVal,
    sscPacking: SSC_PACKING[sscPackingIdx]?.value ?? 0,
    sscLabels: SSC_LABELS(lang)[sscLabelsIdx]?.value ?? 0,
    pglBase,
    marginPct,
    extra,
    transport,
    tons,
  }), [steelType, thickness, width, length, gradeName, gradeValue, isCoil, coatingIdx,
    tolThickVal, certVal, crZabezpIdx, crOpakIdx, crPowierzIdx, crWykonIdx, crZgrzewIdx,
    hdgZabezpIdx, hdgOpakIdx, hdgPowierzIdx, hdgWykonIdx, hdgZgrzewIdx,
    sscLenTolIdx, sscFlatnessIdx, sscSurfaceIdx, sscMaxWeightIdx, sscMarkingIdx,
    sscEdgingIdx, yieldVal, sscPackingIdx, sscLabelsIdx, pglBase, marginPct, extra, transport, tons, lang]);

  const results = useMemo(() => recalculate(inputs), [inputs]);

  // ─── Derived display values ───
  const dimDisplay = results.dimSurcharge !== null ? results.dimSurcharge.toFixed(2) : '—';
  const gradeDisplay = gradeValue.toString();
  const coatingDisplay = steelType === 'HDG'
    ? (results.coatingAvailable ? results.coatingSurcharge + ' €/t' : `— (${lang === 'pl' ? 'niedostępne' : 'unavailable'})`)
    : '—';

  // Base surcharge display
  const baseSurchargeDisplay = results.baseSurcharge !== null ? results.baseSurcharge.toFixed(2) : '—';

  // ─── Helper: find toggle index by value ───
  const findIdx = (arr: {value:number}[], val: number) => { const i = arr.findIndex(o => o.value === val); return i >= 0 ? i : 0; };

  // ─── Load item for editing ───
  const handleEditItem = useCallback((item: OrderItem) => {
    const inp = item.inputs;
    skipTypeResetRef.current = true;
    setSteelType(inp.steelType);
    setIsCoil(inp.isCoil);
    setThickness(inp.thickness);
    setWidth(inp.width);
    setLength(inp.length);

    // Grade
    const gt = GRADE_TABLES[inp.steelType];
    const ge = gt.find(g => g.name === inp.grade) || gt[0] || null;
    setSelectedGrade(ge);
    setGradeSearch(ge?.name || '');

    // Huta toggles
    setTolThickIdx(findIdx(TOL_THICK_OPTIONS[inp.steelType], inp.tolThick));
    setCertIdx(findIdx(CERT_OPTIONS, inp.cert));
    setCoatingIdx(COATING_NAMES.indexOf(inp.coating as typeof COATING_NAMES[number]) >= 0 ? COATING_NAMES.indexOf(inp.coating as typeof COATING_NAMES[number]) : 4);

    // CR
    setCrZabezpIdx(findIdx(CR_ZABEZP, inp.crZabezp));
    setCrOpakIdx(findIdx(CR_OPAK(lang), inp.crOpak));
    setCrPowierzIdx(findIdx(CR_POWIERZ, inp.crPowierz));
    setCrWykonIdx(findIdx(CR_WYKON(lang), inp.crWykon));
    setCrZgrzewIdx(findIdx(CR_ZGRZEW(lang), inp.crZgrzew));

    // HDG
    setHdgZabezpIdx(findIdx(HDG_ZABEZP, inp.hdgZabezp));
    setHdgOpakIdx(findIdx(HDG_OPAK(lang), inp.hdgOpak));
    setHdgPowierzIdx(findIdx(HDG_POWIERZ, inp.hdgPowierz));
    setHdgWykonIdx(findIdx(HDG_WYKON(lang), inp.hdgWykon));
    setHdgZgrzewIdx(findIdx(HDG_ZGRZEW(lang), inp.hdgZgrzew));

    // SSC
    setSscLenTolIdx(findIdx(SSC_LEN_TOL(lang), inp.sscLenTol));
    setSscFlatnessIdx(findIdx(SSC_FLATNESS(lang), inp.sscFlatness));
    setSscSurfaceIdx(findIdx(SSC_SURFACE(lang), inp.sscSurface));
    setSscMaxWeightIdx(findIdx(SSC_MAXWEIGHT, inp.sscMaxWeight));
    setSscMarkingIdx(findIdx(SSC_MARKING(lang), inp.sscMarking));
    setSscEdgingIdx(findIdx(SSC_EDGING(lang), inp.sscEdging));
    setSscPackingIdx(findIdx(SSC_PACKING, inp.sscPacking));
    setSscLabelsIdx(findIdx(SSC_LABELS(lang), inp.sscLabels));

    // Summary
    setPglBase(inp.pglBase);
    setMarginPct(inp.marginPct);
    setExtra(inp.extra);
    setTransport(inp.transport);
    setTons(inp.tons);

    setEditingItemId(item.id);
    // Scroll to top of calculator
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [lang]);

  const handleCancelItemEdit = useCallback(() => {
    setEditingItemId(null);
  }, []);

  // ─── Add / Update to zestawienie ───
  const handleAdd = useCallback(() => {
    const item: OrderItem = {
      id: editingItemId || (Date.now().toString() + Math.random().toString(36).slice(2)),
      steelType,
      grade: gradeName,
      thickness,
      width,
      length,
      isCoil,
      coating: steelType === 'HDG' ? (COATING_NAMES[coatingIdx] ?? 'Z275') : '',
      quantity: tons,
      pricePerTon: results.cenaKoncowa,
      totalValue: results.cenaKoncowa * tons,
      inputs,
      results,
    };
    if (editingItemId) {
      onUpdateOrder(editingItemId, item);
      setEditingItemId(null);
    } else {
      onAddToOrder(item);
    }
  }, [editingItemId, steelType, gradeName, thickness, width, length, isCoil, coatingIdx, tons, results, inputs, onAddToOrder, onUpdateOrder]);

  const typeColors: Record<SteelType, string> = { HRS: 'active-hrs', CR: 'active-cr', HDG: 'active-hdg' };

  return (
    <div>
      {/* ─── CLIENT PANEL ─── */}
      <div className="col-card" style={{ marginBottom: '16px' }}>
        <div
          className="col-card-header"
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setClientOpen(prev => !prev)}
        >
          <span className="col-dot" style={{ background: 'var(--accent)' }} />
          <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
            {t('clientPanel', lang)}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '14px', color: 'var(--text-muted)', transition: 'transform .2s', transform: clientOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
        </div>
        {clientOpen && (
          <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
            {([
              ['firstName', t('firstName', lang)],
              ['lastName', t('lastName', lang)],
              ['company', t('company', lang)],
              ['address', t('address', lang)],
              ['nip', t('nip', lang)],
              ['phone', t('phone', lang)],
              ['email', t('clientEmail', lang)],
            ] as [keyof ClientInfo, string][]).map(([field, label]) => (
              <div key={field} className="param-group">
                <label>{label}</label>
                <input
                  type={field === 'email' ? 'email' : 'text'}
                  value={clientInfo[field]}
                  onChange={e => updateClient(field, e.target.value)}
                  style={{ textAlign: 'left' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── TYPE SELECTOR ─── */}
      <div className="type-selector">
        {(['HRS', 'CR', 'HDG'] as SteelType[]).map(st => (
          <button
            key={st}
            type="button"
            className={`type-btn${steelType === st ? ' ' + typeColors[st] : ''}`}
            onClick={() => setSteelType(st)}
          >
            {st}
            <span className="btn-label">
              {st === 'HRS' ? t('hrsDesc', lang) : st === 'CR' ? t('crDesc', lang) : t('hdgDesc', lang)}
            </span>
          </button>
        ))}
      </div>

      {/* ─── EDITING ITEM BANNER ─── */}
      {editingItemId && (
        <div style={{
          padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--accent-cr)', borderRadius: '6px', marginBottom: '8px',
          fontSize: '11px', color: '#fff', fontWeight: 600
        }}>
          <span>✏️ {t('editItem', lang)}: #{orderItems.findIndex(i => i.id === editingItemId) + 1} — {orderItems.find(i => i.id === editingItemId)?.grade ?? ''}</span>
          <button
            type="button"
            onClick={handleCancelItemEdit}
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: 'none',
              borderRadius: '4px', color: '#fff', fontSize: '10px', padding: '3px 10px', cursor: 'pointer'
            }}
          >
            {t('cancel', lang)}
          </button>
        </div>
      )}

      {/* ─── PARAMS BAR ─── */}
      <div className="params-bar">
        <div className="param-group">
          <label>{t('thicknessMm', lang)}</label>
          <input type="number" value={thickness} step="0.01" min="0"
            onChange={e => setThickness(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="param-group">
          <label>{t('widthMm', lang)}</label>
          <input type="number" value={width} step="1" min="0"
            onChange={e => setWidth(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="param-group">
          <label>{t('lengthMm', lang)}</label>
          <input type="number" value={length} step="1" min="0"
            onChange={e => setLength(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="param-group" style={{ position: 'relative' }} ref={gradeRef}>
          <label>{t('gradeLabel', lang)}</label>
          <input
            type="text"
            placeholder={t('searchGrade', lang)}
            autoComplete="off"
            value={gradeSearch}
            onChange={e => { setGradeSearch(e.target.value); setGradeDropdownOpen(true); }}
            onFocus={() => setGradeDropdownOpen(true)}
          />
          {gradeDropdownOpen && filteredGrades.length > 0 && (
            <div className="grade-dropdown">
              {filteredGrades.map(g => (
                <div
                  key={g.name}
                  className={`grade-option${selectedGrade?.name === g.name ? ' active' : ''}`}
                  onClick={() => { setSelectedGrade(g); setGradeSearch(g.name); setGradeDropdownOpen(false); }}
                >
                  <span className="g-name">{g.name}</span>
                  <span className="g-val">{g.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── COIL TOGGLE ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 12px 0' }}>
        <button
          type="button"
          className={`toggle-btn${!isCoil ? ' active-toggle' : ''}`}
          style={{ padding: '6px 16px', fontSize: '12px' }}
          onClick={() => setIsCoil(false)}
        >{t('sheetMode', lang)}</button>
        <button
          type="button"
          className={`toggle-btn${isCoil ? ' active-toggle' : ''}`}
          style={{ padding: '6px 16px', fontSize: '12px' }}
          onClick={() => setIsCoil(true)}
        >{t('coilMode', lang)}</button>
      </div>

      {/* ─── SHEET WEIGHT ─── */}
      {!isCoil && thickness > 0 && width > 0 && length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 12px 0',
          padding: '8px 14px', background: 'var(--bg-input)', borderRadius: '6px',
          border: '1px solid var(--border)'
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
            {t('sheetWeight', lang)}
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>
            {((thickness * width * length * 7.85) / 1_000_000_000).toFixed(4)}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>t</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>
            ({((thickness * width * length * 7.85) / 1_000_000).toFixed(2)} kg)
          </span>
        </div>
      )}

      {/* ─── DIMENSION WARNING ─── */}
      {results.dimWarning && (
        <div className="dim-warning visible">
          <span className="warn-icon">⚠</span>
          <span>{results.dimWarning}</span>
        </div>
      )}

      {/* ─── 3-COLUMN GRID ─── */}
      <div className="columns-grid" style={isCoil ? { gridTemplateColumns: '1fr 1fr' } : undefined}>

        {/* ══════ COLUMN 1: HUTA DOPŁATY ══════ */}
        <div className="col-card col-huta">
          <div className="col-card-header">
            <span className="col-dot" />
            <h2>{t('hutaTitle', lang)}</h2>
            <span className="col-sub">{t('hutaSub', lang)}</span>
          </div>
          <div className="data-table">
            <DataRow label={t('pglPeriod', lang)}>
              <span className="row-value">{HUTA_CONSTANTS.pglPeriod}</span>
              <span className="row-unit">€/t</span>
            </DataRow>
            <DataRow label={t('thicknessWidth', lang)}>
              <span className="row-value">{dimDisplay}</span>
              <span className="row-unit">€/t</span>
            </DataRow>
            <DataRow label={t('grade', lang)}>
              <span className="row-value">{gradeDisplay}</span>
              <span className="row-unit">€/t</span>
            </DataRow>
            <DataRow label={t('toleranceThickness', lang)}>
              <ToggleGroup
                options={TOL_THICK_OPTIONS[steelType]}
                activeIdx={tolThickIdx}
                onChange={(i) => setTolThickIdx(i)}
              />
              <ValBadge value={tolThickVal} unit="€/t" />
            </DataRow>
            <DataRow label={t('certificate', lang)}>
              <ToggleGroup
                options={CERT_OPTIONS}
                activeIdx={certIdx}
                onChange={(i) => setCertIdx(i)}
              />
              <ValBadge value={certVal} unit="€/t" />
            </DataRow>

            {/* Coating - HDG only */}
            {steelType === 'HDG' && (
              <div className="data-row" style={{ flexWrap: 'wrap', gap: '4px 0', alignItems: 'flex-start' }}>
                <span className="row-label" style={{ width: '100%', marginBottom: '4px' }}>{t('coating', lang)}</span>
                <div className="toggle-group" style={{ flexWrap: 'wrap', justifyContent: 'flex-start', marginLeft: 0, gap: '3px' }}>
                  {COATING_NAMES.map((cn, i) => (
                    <button
                      key={cn}
                      type="button"
                      className={`toggle-btn${coatingIdx === i ? ' active-toggle' : ''}`}
                      onClick={() => setCoatingIdx(i)}
                    >{cn}</button>
                  ))}
                </div>
                <span className="row-val-badge" style={{ width: '100%', marginTop: '4px', textAlign: 'left' }}>
                  {coatingDisplay}
                </span>
              </div>
            )}

            {/* CR-only rows */}
            {steelType === 'CR' && (
              <>
                <DataRow label={t('protection', lang)}>
                  <ToggleGroup options={CR_ZABEZP} activeIdx={crZabezpIdx} onChange={(i) => setCrZabezpIdx(i)} />
                  <ValBadge value={CR_ZABEZP[crZabezpIdx]?.value ?? 0} unit="€/t" />
                </DataRow>
                <DataRow label={t('packaging', lang)}>
                  <ToggleGroup options={CR_OPAK(lang)} activeIdx={crOpakIdx} onChange={(i) => setCrOpakIdx(i)} />
                  <ValBadge value={CR_OPAK(lang)[crOpakIdx]?.value ?? 0} unit="€/t" />
                </DataRow>
                <DataRow label={t('surfaceCR', lang)}>
                  <ToggleGroup options={CR_POWIERZ} activeIdx={crPowierzIdx} onChange={(i) => setCrPowierzIdx(i)} />
                  <ValBadge value={CR_POWIERZ[crPowierzIdx]?.value ?? 0} unit="€/t" />
                </DataRow>
                <DataRow label={t('surfaceFinish', lang)}>
                  <ToggleGroup options={CR_WYKON(lang)} activeIdx={crWykonIdx} onChange={(i) => setCrWykonIdx(i)} />
                  <ValBadge value={CR_WYKON(lang)[crWykonIdx]?.value ?? 0} unit="€/t" />
                </DataRow>
                <DataRow label={t('weld', lang)}>
                  <ToggleGroup options={CR_ZGRZEW(lang)} activeIdx={crZgrzewIdx} onChange={(i) => setCrZgrzewIdx(i)} />
                  <ValBadge value={CR_ZGRZEW(lang)[crZgrzewIdx]?.value ?? 0} unit="€/t" />
                </DataRow>
              </>
            )}

            {/* HDG-only rows */}
            {steelType === 'HDG' && (
              <>
                <DataRow label={t('protection', lang)}>
                  <ToggleGroup options={HDG_ZABEZP} activeIdx={hdgZabezpIdx} onChange={(i) => setHdgZabezpIdx(i)} />
                  <ValBadge value={HDG_ZABEZP[hdgZabezpIdx]?.value ?? 0} unit="€/t" />
                </DataRow>
                <DataRow label={t('packaging', lang)}>
                  <ToggleGroup options={HDG_OPAK(lang)} activeIdx={hdgOpakIdx} onChange={(i) => setHdgOpakIdx(i)} />
                  <ValBadge value={HDG_OPAK(lang)[hdgOpakIdx]?.value ?? 0} unit="€/t" />
                </DataRow>
                <DataRow label={t('surfaceHDG', lang)}>
                  <ToggleGroup options={HDG_POWIERZ} activeIdx={hdgPowierzIdx} onChange={(i) => setHdgPowierzIdx(i)} />
                  <ValBadge value={HDG_POWIERZ[hdgPowierzIdx]?.value ?? 0} unit="€/t" />
                </DataRow>
                <DataRow label={t('surfaceFinish', lang)}>
                  <ToggleGroup options={HDG_WYKON(lang)} activeIdx={hdgWykonIdx} onChange={(i) => setHdgWykonIdx(i)} />
                  <ValBadge value={HDG_WYKON(lang)[hdgWykonIdx]?.value ?? 0} unit="€/t" />
                </DataRow>
                <DataRow label={t('weld', lang)}>
                  <ToggleGroup options={HDG_ZGRZEW(lang)} activeIdx={hdgZgrzewIdx} onChange={(i) => setHdgZgrzewIdx(i)} />
                  <ValBadge value={HDG_ZGRZEW(lang)[hdgZgrzewIdx]?.value ?? 0} unit="€/t" />
                </DataRow>
              </>
            )}
          </div>
          {/* SUM HUTA */}
          <div className="sum-row">
            <span className="sum-label">{t('sumaHuta', lang)}</span>
            <span className="sum-value">{results.sumaHuta.toFixed(2)}</span>
            <span className="sum-unit">€/t</span>
          </div>
        </div>

        {/* ══════ COLUMN 2: SSC DOPŁATY (hidden when coil) ══════ */}
        {!isCoil && (
          <div className="col-card col-ssc">
            <div className="col-card-header">
              <span className="col-dot" />
              <h2>{t('sscTitle', lang)}</h2>
              <span className="col-sub">{t('sscSub', lang)}</span>
            </div>
            <div className="data-table">
              <DataRow label={t('baseSurchargeLength', lang)}>
                <span className="row-value">{baseSurchargeDisplay}</span>
                <span className="row-unit">€/t</span>
              </DataRow>
              <DataRow label={t('lengthTolerance', lang)}>
                <ToggleGroup options={SSC_LEN_TOL(lang)} activeIdx={sscLenTolIdx} onChange={(i) => setSscLenTolIdx(i)} />
                <ValBadge value={SSC_LEN_TOL(lang)[sscLenTolIdx]?.value ?? 0} unit="€/t" />
              </DataRow>
              <DataRow label={t('flatness', lang)}>
                <ToggleGroup options={SSC_FLATNESS(lang)} activeIdx={sscFlatnessIdx} onChange={(i) => setSscFlatnessIdx(i)} />
                <ValBadge value={SSC_FLATNESS(lang)[sscFlatnessIdx]?.value ?? 0} unit="€/t" />
              </DataRow>
              <DataRow label={t('surface', lang)}>
                <ToggleGroup options={SSC_SURFACE(lang)} activeIdx={sscSurfaceIdx} onChange={(i) => setSscSurfaceIdx(i)} />
                <ValBadge value={SSC_SURFACE(lang)[sscSurfaceIdx]?.value ?? 0} unit="€/t" />
              </DataRow>
              <DataRow label={t('maxPackWeight', lang)}>
                <ToggleGroup options={SSC_MAXWEIGHT} activeIdx={sscMaxWeightIdx} onChange={(i) => setSscMaxWeightIdx(i)} />
                <ValBadge value={SSC_MAXWEIGHT[sscMaxWeightIdx]?.value ?? 0} unit="€/t" />
              </DataRow>
              <DataRow label={t('markingLabel', lang)}>
                <ToggleGroup options={SSC_MARKING(lang)} activeIdx={sscMarkingIdx} onChange={(i) => setSscMarkingIdx(i)} />
                <ValBadge value={SSC_MARKING(lang)[sscMarkingIdx]?.value ?? 0} unit="€/t" />
              </DataRow>
              <DataRow label={t('edgeTrimming', lang)}>
                <ToggleGroup options={SSC_EDGING(lang)} activeIdx={sscEdgingIdx} onChange={(i) => setSscEdgingIdx(i)} />
                <ValBadge value={SSC_EDGING(lang)[sscEdgingIdx]?.value ?? 0} unit="€/t" />
              </DataRow>
              {showYield && (
                <DataRow label={t('yieldStrength', lang)}>
                  <span className="row-value">7</span>
                  <span className="row-unit">€/t</span>
                </DataRow>
              )}
              <DataRow label={t('packing', lang)}>
                <ToggleGroup options={SSC_PACKING} activeIdx={sscPackingIdx} onChange={(i) => setSscPackingIdx(i)} />
                <ValBadge value={SSC_PACKING[sscPackingIdx]?.value ?? 0} unit="€/t" />
              </DataRow>
              <DataRow label={t('specialLabels', lang)}>
                <ToggleGroup options={SSC_LABELS(lang)} activeIdx={sscLabelsIdx} onChange={(i) => setSscLabelsIdx(i)} />
                <ValBadge value={SSC_LABELS(lang)[sscLabelsIdx]?.value ?? 0} unit="€/t" />
              </DataRow>
              <DataRow label={t('scrapConst', lang)}>
                <span className="row-value">{SCRAP_CONSTANT}</span>
                <span className="row-unit">€/t</span>
              </DataRow>
            </div>
            {/* SUM SSC */}
            <div className="sum-row">
              <span className="sum-label">{t('sumaSSC', lang)}</span>
              <span className="sum-value">{results.sumaSSC.toFixed(2)}</span>
              <span className="sum-unit">€/t</span>
            </div>
          </div>
        )}

        {/* ══════ COLUMN 3: PODSUMOWANIE ══════ */}
        <div className="col-card col-summary">
          <div className="col-card-header">
            <span className="col-dot" />
            <h2>{t('summaryTitle', lang)}</h2>
            <span className="col-sub">{t('summarySub', lang)}</span>
          </div>
          <div className="data-table">
            <DataRow label={t('pglBase', lang)}>
              <input className="row-input wide" type="number" value={pglBase} min="0"
                onChange={e => setPglBase(parseFloat(e.target.value) || 0)} />
              <span className="row-unit">€/t</span>
            </DataRow>
            <DataRow label={t('pglPlusHuta', lang)}>
              <span className="row-value">{results.cenaWsadu.toFixed(2)}</span>
              <span className="row-unit">€/t</span>
            </DataRow>

            <div className="col-separator" />

            <DataRow label={t('marginPct', lang)}>
              <input className="row-input" type="number" value={marginPct} min="0" step="0.1"
                onChange={e => setMarginPct(parseFloat(e.target.value) || 0)} />
              <span className="row-unit">%</span>
            </DataRow>
            <DataRow label={t('marginNet', lang)}>
              <span className="row-value">{results.marzaNetto.toFixed(2)}</span>
              <span className="row-unit">€/t</span>
            </DataRow>

            <div className="col-separator" />

            <DataRow label={t('extraSurcharge', lang)}>
              <input className="row-input" type="number" value={extra} min="0"
                onChange={e => setExtra(parseFloat(e.target.value) || 0)} />
              <span className="row-unit">€/t</span>
            </DataRow>
            <DataRow label={t('transport', lang)}>
              <input className="row-input" type="number" value={transport} min="0"
                onChange={e => setTransport(parseFloat(e.target.value) || 0)} />
              <span className="row-unit">€/t</span>
            </DataRow>

            <div className="col-separator" />

            <DataRow label={t('sscProcessingSum', lang)}>
              <span className="row-value">{results.sumaSSC.toFixed(2)}</span>
              <span className="row-unit">€/t</span>
            </DataRow>

            {/* FINAL PRICE */}
            <div className="data-row final-price-row">
              <span className="row-label">{t('finalPrice', lang)}</span>
              <span className="row-value">{results.cenaKoncowa.toFixed(2)}</span>
              <span className="row-unit" style={{ color: 'var(--accent-sum)' }}>€/t</span>
            </div>

            {/* Tons */}
            <div className="data-row" style={{ margin: '8px 14px 0' }}>
              <span className="row-label" style={{ fontWeight: 600 }}>{t('quantityTons', lang)}</span>
              <input className="row-input" type="number" value={tons} min="0.01" step="0.5"
                style={{ width: '80px', textAlign: 'right' }}
                onChange={e => setTons(parseFloat(e.target.value) || 0)} />
              <span className="row-unit">t</span>
            </div>

            {/* ADD / UPDATE button */}
            <div style={{ padding: '10px 14px 6px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleAdd}
                className="btn-add-zestawienie"
                style={{ flex: 1, background: editingItemId ? 'var(--accent-cr)' : undefined }}
              >
                {editingItemId ? `✓ ${t('saveChanges', lang)}` : `＋ ${t('addToList', lang)}`}
              </button>
              {editingItemId && (
                <button
                  type="button"
                  onClick={handleCancelItemEdit}
                  className="btn-add-zestawienie"
                  style={{ flex: 'none', padding: '8px 16px', background: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {t('cancel', lang)}
                </button>
              )}
            </div>
          </div>

          {/* SUM block */}
          <div className="sum-row">
            <span className="sum-label">{t('sumTotal', lang)}</span>
            <span className="sum-value">{results.cenaKoncowa.toFixed(2)}</span>
            <span className="sum-unit">€/t</span>
          </div>
        </div>
      </div>

      {/* ═══════════════ ZESTAWIENIE TABLE ═══════════════ */}
      <div style={{ marginTop: '24px' }}>
        <div className="col-card">
          <div className="col-card-header">
            <span className="col-dot" style={{ background: 'var(--accent-hrs)' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
              {t('zestawienieTitle', lang)}
            </span>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginLeft: '4px' }}>
              {orderItems.length > 0 ? `(${orderItems.length})` : ''}
            </span>
            {orderItems.length > 0 && (
              <button
                type="button"
                onClick={onClearOrders}
                style={{
                  marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: '4px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                  fontSize: '10px', padding: '4px 10px', cursor: 'pointer'
                }}
              >
                {t('clearAll', lang)}
              </button>
            )}
          </div>

          {/* Editing offer banner */}
          {editingOfferId && editingOfferName && (
            <div style={{
              padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px',
              background: 'var(--accent)', borderBottom: '1px solid var(--border)',
              fontSize: '11px', color: '#fff', fontWeight: 600
            }}>
              <span>✏️ {t('editingOffer', lang)}: &quot;{editingOfferName}&quot;</span>
              <button
                type="button"
                onClick={onCancelEdit}
                style={{
                  marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: 'none',
                  borderRadius: '4px', color: '#fff', fontSize: '10px', padding: '3px 10px', cursor: 'pointer'
                }}
              >
                {t('cancelEdit', lang)}
              </button>
            </div>
          )}

          {orderItems.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
              {t('noItemsHint', lang)}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th className="zt" style={{ textAlign: 'center', width: '40px' }}>#</th>
                    <th className="zt" style={{ textAlign: 'left' }}>{t('colDesc', lang)}</th>
                    <th className="zt" style={{ textAlign: 'center' }}>{t('colType', lang)}</th>
                    <th className="zt">{t('colHuta', lang)}</th>
                    <th className="zt">{t('colSSC', lang)}</th>
                    <th className="zt">{t('colPriceT', lang)}</th>
                    <th className="zt">{t('colQty', lang)}</th>
                    <th className="zt">{t('colValue', lang)}</th>
                    <th className="zt" style={{ textAlign: 'center' }}>{t('colActions', lang)}</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item, idx) => (
                    <tr key={item.id} className="zr" style={editingItemId === item.id ? { background: 'rgba(var(--accent-rgb, 59,130,246), 0.12)', outline: '1px solid var(--accent)' } : undefined}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ textAlign: 'left' }}>
                        <div className="z-desc-grade">{item.grade}</div>
                        <div className="z-desc-dim">
                          {item.thickness}×{item.width}
                          {!item.isCoil && <>×{item.length}</>}
                          {item.coating && ` / ${item.coating}`}
                          {item.isCoil && ` (${t('coilMode', lang)})`}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`z-type-badge z-type-${item.steelType}`}>{item.steelType}</span>
                      </td>
                      <td>{item.results.sumaHuta.toFixed(2)}</td>
                      <td>{item.results.sumaSSC.toFixed(2)}</td>
                      <td className="z-final">{item.pricePerTon.toFixed(2)}</td>
                      <td>
                        <input
                          type="number"
                          className="row-input"
                          value={item.quantity}
                          step="0.5"
                          min="0.01"
                          style={{ width: '70px' }}
                          onChange={e => {
                            const newQty = parseFloat(e.target.value) || 0;
                            onUpdateOrder(item.id, {
                              ...item,
                              quantity: newQty,
                              totalValue: newQty * item.pricePerTon,
                            });
                          }}
                        />
                      </td>
                      <td className="z-final">{(item.pricePerTon * item.quantity).toFixed(2)}</td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button type="button" className="z-action-btn" title={t('editItem', lang)} onClick={() => handleEditItem(item)} style={{ opacity: editingItemId === item.id ? 0.5 : 1 }}>✏️</button>
                        <button type="button" className="z-action-btn z-dup-btn" title={t('duplicateOffer', lang)} onClick={() => onDuplicateOrder(item.id)}>📋</button>
                        <button type="button" className="z-action-btn z-del-btn" title={t('deleteOffer', lang)} onClick={() => { if (editingItemId === item.id) setEditingItemId(null); onRemoveOrder(item.id); }}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {orderItems.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'rgba(0,0,0,0.18)' }}>
                      <td colSpan={5} style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', borderBottom: 'none' }}>
                        {t('total', lang)}:
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--accent-sum)', borderBottom: 'none' }}></td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-value)', borderBottom: 'none' }}>
                        {orderItems.reduce((s, i) => s + i.quantity, 0).toFixed(2)} t
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--accent-sum)', borderBottom: 'none' }}>
                        {orderItems.reduce((s, i) => s + i.pricePerTon * i.quantity, 0).toFixed(2)} €
                      </td>
                      <td style={{ borderBottom: 'none' }}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* ═══ Save offer section ═══ */}
          {orderItems.length > 0 && onSaveOffer && (
            <SaveOfferBar
              lang={lang}
              editingOfferId={editingOfferId ?? null}
              editingOfferName={editingOfferName ?? null}
              orderItems={orderItems}
              onSaveOffer={onSaveOffer}
              onUpdateOffer={onUpdateOffer}
              clientInfo={clientInfo}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Save Offer Bar subcomponent ─── */
function SaveOfferBar({ lang, editingOfferId, editingOfferName, orderItems, onSaveOffer, onUpdateOffer, clientInfo }: {
  lang: 'pl' | 'en';
  editingOfferId: string | null;
  editingOfferName: string | null;
  orderItems: OrderItem[];
  onSaveOffer: (name: string, items: OrderItem[]) => Promise<void>;
  onUpdateOffer?: (id: string, name: string, items: OrderItem[]) => Promise<void>;
  clientInfo: ClientInfo;
}) {
  const [offerName, setOfferName] = React.useState(editingOfferName || '');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [pdfLoading, setPdfLoading] = React.useState(false);

  React.useEffect(() => {
    setOfferName(editingOfferName || '');
  }, [editingOfferName]);

  const handleSave = async () => {
    const name = offerName.trim() || `${t('offerDefault', lang)} ${new Date().toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB')}`;
    setSaving(true);
    try {
      if (editingOfferId && onUpdateOffer) {
        await onUpdateOffer(editingOfferId, name, orderItems);
      } else {
        await onSaveOffer(name, orderItems);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handlePdfExport = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: orderItems,
          clientInfo,
          offerName: offerName.trim() || t('offerDefault', lang),
          offerDate: new Date().toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB'),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'PDF failed' }));
        console.error('PDF error:', err);
        alert(err.error || t('pdfError', lang));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oferta_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export error:', err);
      alert(t('pdfGenError', lang));
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div style={{
      padding: '12px 14px', borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'
    }}>
      <input
        type="text"
        value={offerName}
        onChange={e => setOfferName(e.target.value)}
        placeholder={t('offerName', lang)}
        className="row-input"
        style={{ flex: 1, minWidth: '180px', padding: '6px 10px' }}
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="btn-add-zestawienie"
        style={{ margin: 0, padding: '8px 20px', fontSize: '11px', minWidth: 'fit-content' }}
      >
        {saving ? '...' : saved ? '✓' : editingOfferId ? t('updateOffer', lang) : t('saveAsOffer', lang)}
      </button>
      <button
        type="button"
        onClick={handlePdfExport}
        disabled={pdfLoading}
        style={{
          margin: 0, padding: '8px 16px', fontSize: '11px', minWidth: 'fit-content',
          background: pdfLoading ? 'var(--border)' : '#dc2626', color: '#fff',
          border: 'none', borderRadius: '6px', cursor: pdfLoading ? 'wait' : 'pointer',
          fontWeight: 600, letterSpacing: '0.05em', fontFamily: 'var(--font-mono)',
          display: 'flex', alignItems: 'center', gap: '6px'
        }}
      >
        {pdfLoading ? (
          <>{t('generatingPdf', lang)}</>
        ) : (
          <>📄 {t('downloadPdf', lang)}</>
        )}
      </button>
    </div>
  );
}