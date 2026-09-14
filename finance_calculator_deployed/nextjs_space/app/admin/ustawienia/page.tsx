'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/currency';
import { DEFAULT_TARIFF_BANDS, type TariffBand } from '@/lib/transportTariff';
import type { Language, Translations } from '@/lib/translations';
import type { PglPriceHistoryEntry } from '@/app/api/settings/pgl-history/route';
import { exportPglHistoryToExcel } from '@/lib/pglHistoryExport';
import type { PglQuarterlyEntry, Quarter } from '@/lib/pglQuarterly';

type SteelType = 'HRS' | 'CR' | 'HDG' | 'PICKLED' | 'TEARDROP' | 'ZM';

// Spójna paleta per typ stali w całym panelu (te same zmienne, co w Calculatorze):
// HRS = pomarańczowy, CR = niebieski, HDG = zielony, PICKLED = różowy, TEARDROP = cyjan, ZM = fiolet.
const STEEL_TYPE_COLOR: Record<SteelType, string> = {
  HRS: 'var(--accent-hrs)',
  CR: 'var(--accent-cr)',
  HDG: 'var(--accent-hdg)',
  PICKLED: 'var(--accent-pickled)',
  TEARDROP: 'var(--accent-teardrop)',
  ZM: 'var(--accent-zm)',
};

const STEEL_TYPES: SteelType[] = ['HRS', 'CR', 'HDG', 'PICKLED', 'TEARDROP', 'ZM'];
const QUARTERS: Quarter[] = [1, 2, 3, 4];

// Ręczna wartość bazowa PGL (app_settings.pgl_base_*) dla danego typu — to ona stoi za kolumną
// "bieżący miesiąc", dopóki dla trwającego kwartału nie ma zaplanowanej ceny.
const PGL_FORM_KEY_BY_TYPE: Record<SteelType, SettingFormKey> = {
  HRS: 'pglBaseHrs',
  CR: 'pglBaseCr',
  HDG: 'pglBaseHdg',
  PICKLED: 'pglBasePickled',
  TEARDROP: 'pglBaseTeardrop',
  ZM: 'pglBaseZm',
};

// Nazwa bieżącego miesiąca w języku panelu — nagłówek pierwszej kolumny kwot.
const MONTH_LOCALE: Record<Language, string> = {
  pl: 'pl-PL',
  en: 'en-GB',
  cs: 'cs-CZ',
  de: 'de-DE',
};

// Siatka wpisów harmonogramu kwartalnego w formularzu: pusty string = "nie zaplanowano".
type QuarterlyGrid = Record<SteelType, Record<Quarter, string>>;

function emptyQuarterlyGrid(): QuarterlyGrid {
  const grid = {} as QuarterlyGrid;
  for (const type of STEEL_TYPES) {
    grid[type] = { 1: '', 2: '', 3: '', 4: '' };
  }
  return grid;
}

type HistorySortKey = 'steelType' | 'oldPrice' | 'newPrice' | 'delta' | 'changedByName' | 'changedAt';

const DEFAULT_SORT_KEY: HistorySortKey = 'changedAt';
const DEFAULT_SORT_DIR: 'asc' | 'desc' = 'desc';

// Konfiguracja kolumn tabeli historii — jedno źródło prawdy dla nagłówków (klik = sortowanie)
// i kluczy tłumaczeń, żeby nie duplikować 6x tej samej logiki renderowania <th>.
const HISTORY_COLUMNS: { key: HistorySortKey; labelKey: keyof Translations['admin']['settings']; align: 'left' | 'right' }[] = [
  { key: 'steelType', labelKey: 'historyColType', align: 'left' },
  { key: 'oldPrice', labelKey: 'historyColOld', align: 'right' },
  { key: 'newPrice', labelKey: 'historyColNew', align: 'right' },
  { key: 'delta', labelKey: 'historyColDelta', align: 'right' },
  { key: 'changedByName', labelKey: 'historyColBy', align: 'left' },
  { key: 'changedAt', labelKey: 'historyColWhen', align: 'left' },
];

// Pola trzymamy jako string, a nie number: pole musi pozwolić wpisać "4," albo wyczyścić
// zawartość w trakcie edycji. Konwersja i walidacja następuje przy zapisie — a serwer
// waliduje drugi raz (app/api/settings/route.ts), bo to on jest granicą zaufania.
//
// Cennik transportowy (tariffBands) NIE jest częścią tego formularza — to tabela wierszy
// z własnym zapisem (PUT /api/settings/tariff), więc wypada z FormState.
type SettingFormKey = Exclude<keyof AppSettings, 'tariffBands'>;
type FormState = Record<SettingFormKey, string>;

type SettingField = {
  key: SettingFormKey;
  label: string;
  hint: string;
  unit: string;
  step: string;
  inputType?: 'number' | 'text';
};

function toForm(s: AppSettings): FormState {
  return {
    eurPlnRate: String(s.eurPlnRate),
    pglBaseHrs: String(s.pglBaseHrs),
    pglBaseCr: String(s.pglBaseCr),
    pglBaseHdg: String(s.pglBaseHdg),
    pglBasePickled: String(s.pglBasePickled),
    pglBaseTeardrop: String(s.pglBaseTeardrop),
    pglBaseZm: String(s.pglBaseZm),
    transportBase: String(s.transportBase),
    minMarginPct: String(s.minMarginPct),
    scrapPct: String(s.scrapPct),
    transportTruckCapacityT: String(s.transportTruckCapacityT),
    transportOriginAddress: s.transportOriginAddress,
    transportOversizeLongPln: String(s.transportOversizeLongPln),
  };
}

// Wiersz cennika w formularzu. Jak FormState wyżej — stringi, żeby dało się wyczyścić
// pole w trakcie edycji. Pusty `toKm` to pasmo otwarte ("i powyżej"), pusty `flatPln`
// lub `perKmPln` oznacza "ten model ceny nie dotyczy tego pasma".
type BandForm = { fromKm: string; toKm: string; flatPln: string; perKmPln: string };

function toBandForm(band: TariffBand): BandForm {
  return {
    fromKm: String(band.fromKm),
    toKm: band.toKm === null ? '' : String(band.toKm),
    flatPln: band.flatPln === null ? '' : String(band.flatPln),
    perKmPln: band.perKmPln === null ? '' : String(band.perKmPln),
  };
}

export default function AdminSettingsPage() {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(toForm(DEFAULT_SETTINGS));
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<PglPriceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<SteelType | 'ALL'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<HistorySortKey>(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(DEFAULT_SORT_DIR);
  const [bands, setBands] = useState<BandForm[]>(DEFAULT_TARIFF_BANDS.map(toBandForm));
  const [tariffSaving, setTariffSaving] = useState(false);
  const [tariffMessage, setTariffMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [quarterlyYear, setQuarterlyYear] = useState<number>(() => new Date().getFullYear());
  const [quarterlyGrid, setQuarterlyGrid] = useState<QuarterlyGrid>(emptyQuarterlyGrid());
  const [quarterlyNow, setQuarterlyNow] = useState<{ year: number; quarter: Quarter } | null>(null);
  // Ceny obowiązujące w TYM kwartale — per typ, tylko te faktycznie zaplanowane. Niezależne od
  // roku przeglądanego w siatce, bo kolumna "bieżący miesiąc" ma zawsze mówić prawdę o dziś.
  const [quarterlyCurrentPrices, setQuarterlyCurrentPrices] = useState<Partial<Record<SteelType, number>>>({});
  const [quarterlyLoading, setQuarterlyLoading] = useState(true);

  const hasActiveFilters = typeFilter !== 'ALL' || dateFrom !== '' || dateTo !== '';

  const resetFilters = () => {
    setTypeFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setSortKey(DEFAULT_SORT_KEY);
    setSortDir(DEFAULT_SORT_DIR);
  };

  // Klik w nagłówek kolumny: pierwszy klik sortuje malejąco (najbardziej "ciekawe" u góry —
  // największa zmiana, najnowsza data), drugi klik odwraca kierunek.
  const toggleSort = (key: HistorySortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // dateFrom/dateTo to inputy <input type="date"> (YYYY-MM-DD, lokalny dzień) — porównujemy
  // je na granicach dnia w lokalnej strefie, żeby "Do" obejmowało cały wybrany dzień.
  const filteredHistory = useMemo(() => {
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    return history.filter((entry) => {
      if (typeFilter !== 'ALL' && entry.steelType !== typeFilter) return false;
      const changedAtTime = new Date(entry.changedAt).getTime();
      if (fromTime !== null && changedAtTime < fromTime) return false;
      if (toTime !== null && changedAtTime > toTime) return false;
      return true;
    });
  }, [history, typeFilter, dateFrom, dateTo]);

  const sortedHistory = useMemo(() => {
    const sorted = [...filteredHistory].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'steelType':
          cmp = a.steelType.localeCompare(b.steelType);
          break;
        case 'oldPrice':
          cmp = a.oldPrice - b.oldPrice;
          break;
        case 'newPrice':
          cmp = a.newPrice - b.newPrice;
          break;
        case 'delta':
          cmp = (a.newPrice - a.oldPrice) - (b.newPrice - b.oldPrice);
          break;
        case 'changedByName':
          cmp = (a.changedByName || a.changedByEmail || '').localeCompare(
            b.changedByName || b.changedByEmail || ''
          );
          break;
        case 'changedAt':
        default:
          cmp = new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredHistory, sortKey, sortDir]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/settings/pgl-history');
      if (res.ok) {
        const { history: rows } = await res.json();
        setHistory(rows as PglPriceHistoryEntry[]);
      }
    } catch (error) {
      console.error('Error loading PGL price history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const { settings } = await res.json();
          setForm(toForm(settings as AppSettings));
          setBands((settings as AppSettings).tariffBands.map(toBandForm));
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    })();
    loadHistory();
  }, [loadHistory]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Typ z ceną zaplanowaną na TEN kwartał ma pole miesiąca tylko do odczytu, a w `form`
      // siedzi wtedy wartość Z HARMONOGRAMU (GET /api/settings nakłada ją na pgl_base_*).
      // Odesłanie jej z powrotem nadpisałoby ręczną wartość bazową ceną kwartalną — przy
      // każdym zapisie karty, nawet gdy admin zmieniał tylko kurs. Takie typy pomijamy.
      const manualPglFields = Object.fromEntries(
        STEEL_TYPES
          .filter((type) => quarterlyCurrentPrices[type] === undefined)
          .map((type) => [PGL_FORM_KEY_BY_TYPE[type], form[PGL_FORM_KEY_BY_TYPE[type]]])
      );

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eurPlnRate: form.eurPlnRate,
          ...manualPglFields,
          transportBase: form.transportBase,
          minMarginPct: form.minMarginPct,
          scrapPct: form.scrapPct,
          transportTruckCapacityT: form.transportTruckCapacityT,
          transportOriginAddress: form.transportOriginAddress,
          transportOversizeLongPln: form.transportOversizeLongPln,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Serwer zwraca konkretny powód (np. "Kurs EUR/PLN: wartość musi być w zakresie 0.0001-100").
        setMessage({ type: 'error', text: data.error || t.admin.settings.saveFailed });
        return;
      }
      setForm(toForm(data.settings as AppSettings));
      loadHistory();

      // Harmonogram kwartalny jedzie tym samym przyciskiem — dla admina to jedna tabela,
      // więc jeden zapis. Osobny endpoint, bo to osobna tabela z własną walidacją.
      const quarterlyRes = await fetch('/api/settings/pgl-quarterly', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: quarterlyYear,
          entries: STEEL_TYPES.flatMap((type) =>
            QUARTERS.map((quarter) => ({
              steelType: type,
              quarter,
              price: quarterlyGrid[type][quarter] === '' ? null : quarterlyGrid[type][quarter],
            }))
          ),
        }),
      });
      if (!quarterlyRes.ok) {
        const quarterlyData = await quarterlyRes.json();
        setMessage({ type: 'error', text: quarterlyData.error || t.admin.settings.quarterlySaveFailed });
        return;
      }
      await loadQuarterly(quarterlyYear);
      // Zmiana komórki bieżącego kwartału też może trafić do historii cen (patrz PUT
      // /api/settings/pgl-quarterly) — bez tego drugiego odświeżenia panel pokazywałby
      // nieaktualną historię do czasu ręcznego przeładowania strony.
      loadHistory();
      setMessage({ type: 'success', text: t.admin.settings.saved });
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: t.admin.settings.saveFailed });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const updateBand = (index: number, patch: Partial<BandForm>) => {
    setBands(prev => prev.map((band, i) => (i === index ? { ...band, ...patch } : band)));
  };

  const addBand = () => {
    // Nowe pasmo startuje tam, gdzie kończy się ostatnie — admin i tak może to zmienić,
    // ale najczęstszy przypadek (dołożenie kolejnego progu) wychodzi bez poprawek.
    const last = bands[bands.length - 1];
    const nextFrom = last ? (last.toKm || last.fromKm) : '0';
    setBands(prev => [...prev, { fromKm: nextFrom, toKm: '', flatPln: '', perKmPln: '' }]);
  };

  const removeBand = (index: number) => {
    setBands(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveTariff = async () => {
    setTariffSaving(true);
    setTariffMessage(null);
    try {
      const res = await fetch('/api/settings/tariff', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bands }),
      });
      const data = await res.json();
      if (res.ok) {
        setBands((data.bands as TariffBand[]).map(toBandForm));
        setTariffMessage({ type: 'success', text: t.admin.settings.tariffSaved });
      } else {
        // Serwer mówi wprost, które pasmo jest źle wypełnione — pokazujemy to dosłownie.
        setTariffMessage({ type: 'error', text: data.error || t.admin.settings.tariffSaveFailed });
      }
    } catch (error) {
      console.error('Error saving transport tariff:', error);
      setTariffMessage({ type: 'error', text: t.admin.settings.tariffSaveFailed });
    } finally {
      setTariffSaving(false);
      setTimeout(() => setTariffMessage(null), 5000);
    }
  };

  const loadQuarterly = useCallback(async (year: number) => {
    setQuarterlyLoading(true);
    try {
      const res = await fetch(`/api/settings/pgl-quarterly?year=${year}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const grid = emptyQuarterlyGrid();
        for (const entry of data.entries as PglQuarterlyEntry[]) {
          grid[entry.steelType][entry.quarter] = String(entry.price);
        }
        setQuarterlyGrid(grid);
        setQuarterlyNow({ year: data.currentYear, quarter: data.currentQuarter });
        setQuarterlyCurrentPrices(data.currentPrices ?? {});
      }
    } catch (error) {
      console.error('Error loading PGL quarterly schedule:', error);
    } finally {
      setQuarterlyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuarterly(quarterlyYear);
  }, [quarterlyYear, loadQuarterly]);

  const updateQuarterlyCell = (type: SteelType, quarter: Quarter, value: string) => {
    setQuarterlyGrid((prev) => ({ ...prev, [type]: { ...prev[type], [quarter]: value } }));
  };

  // Kurs stoi NAD tabelą PGL, reszta pod nią — PGL jest tu najważniejsze i ma być widoczne
  // od razu, bez przewijania przez ustawienia transportu.
  const rateFields: SettingField[] = [
    {
      key: 'eurPlnRate',
      label: t.admin.settings.eurPlnRate,
      hint: t.admin.settings.eurPlnRateHint,
      unit: 'PLN / 1 EUR',
      step: '0.0001',
    },
  ];

  const otherFields: SettingField[] = [
    {
      key: 'transportBase',
      label: t.admin.settings.transportBase,
      hint: t.admin.settings.transportBaseHint,
      unit: '€/t',
      step: '0.01',
    },
    {
      key: 'minMarginPct',
      label: t.admin.settings.minMarginPct,
      hint: t.admin.settings.minMarginPctHint,
      unit: '%',
      step: '0.1',
    },
    {
      key: 'scrapPct',
      label: t.admin.settings.scrapPct,
      hint: t.admin.settings.scrapPctHint,
      unit: '%',
      step: '0.1',
    },
    {
      key: 'transportOriginAddress',
      label: t.admin.settings.transportOrigin,
      hint: t.admin.settings.transportOriginHint,
      unit: '',
      step: '',
      inputType: 'text',
    },
    {
      key: 'transportTruckCapacityT',
      label: t.admin.settings.truckCapacity,
      hint: t.admin.settings.truckCapacityHint,
      unit: 't',
      step: '0.5',
    },
    {
      key: 'transportOversizeLongPln',
      label: t.admin.settings.oversizeLong,
      hint: t.admin.settings.oversizeLongHint,
      unit: 'PLN',
      step: '1',
    },
  ];

  // Nagłówek kolumny "teraz" — nazwa bieżącego miesiąca w języku panelu, z wielkiej litery
  // (polski i czeski zwracają ją małą).
  const monthName = new Date().toLocaleDateString(MONTH_LOCALE[language], { month: 'long' });
  const currentMonthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const renderField = (field: SettingField) => (
    <div key={field.key} className="px-4 py-3 border-b border-[rgba(42,48,72,0.5)] last:border-b-0">
      <div className="flex items-center gap-3">
        <label htmlFor={field.key} className="flex-1 text-xs text-[var(--text-secondary)]">
          {field.label}
        </label>
        <input
          id={field.key}
          type={field.inputType ?? 'number'}
          // Adres jest tekstem — min/step dotyczą tylko pól liczbowych, a szerokie
          // pole i wyrównanie do lewej są tu czytelniejsze niż wąska kolumna liczb.
          {...(field.inputType === 'text' ? {} : { min: '0', step: field.step })}
          value={form[field.key]}
          onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
          className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium focus:border-[var(--accent-cr)] outline-none ${
            field.inputType === 'text' ? 'flex-1 min-w-0 text-left' : 'text-right w-[120px]'
          }`}
        />
        <span className="text-[10px] text-[var(--text-muted)] font-mono w-[70px]">{field.unit}</span>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{field.hint}</p>
    </div>
  );

  return (
    <AdminLayout>
      {loading ? (
        <div className="p-8 text-center text-[var(--text-secondary)]">{t.common.loading}</div>
      ) : (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-hrs)]" />
              <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
                {t.admin.settings.title}
              </h2>
              <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">
                {t.admin.settings.subtitle}
              </span>
            </div>

            <div className="py-2">{rateFields.map(renderField)}</div>

            {/* PGL: bieżący miesiąc + cztery kwartały w jednej tabeli. Kolumna miesiąca pokazuje
                cenę, która działa TERAZ — zaplanowaną (tylko do odczytu, źródłem jest kwartał)
                albo ręczną wartość bazową, którą wtedy da się tu wprost edytować. */}
            <div className="border-t border-[var(--border)]">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-[rgba(15,20,35,0.3)]">
                <h3 className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]">
                  {t.admin.settings.quarterlyTitle}
                </h3>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">€/t</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => setQuarterlyYear((y) => y - 1)}
                    aria-label={t.admin.settings.quarterlyYearPrev}
                    className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-cr)] hover:text-[var(--text-primary)] transition-colors text-xs font-mono"
                  >
                    ‹
                  </button>
                  <span className="font-mono text-xs font-semibold text-[var(--text-primary)] w-11 text-center">
                    {quarterlyYear}
                  </span>
                  <button
                    onClick={() => setQuarterlyYear((y) => y + 1)}
                    aria-label={t.admin.settings.quarterlyYearNext}
                    className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-cr)] hover:text-[var(--text-primary)] transition-colors text-xs font-mono"
                  >
                    ›
                  </button>
                </div>
              </div>

              {quarterlyLoading ? (
                <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
                  {t.admin.settings.quarterlyLoading}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                          {t.admin.settings.historyColType}
                        </th>
                        <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-[var(--text-primary)]">
                          {currentMonthLabel}
                          <span className="block normal-case font-sans text-[9px] text-[var(--text-muted)]">
                            {t.admin.settings.quarterlyNowLabel}
                          </span>
                        </th>
                        {QUARTERS.map((q) => {
                          const isActive = quarterlyNow?.year === quarterlyYear && quarterlyNow?.quarter === q;
                          return (
                            <th
                              key={q}
                              className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide"
                              style={{ color: isActive ? 'var(--accent-hdg)' : 'var(--text-secondary)' }}
                            >
                              Q{q}
                              {isActive && (
                                <span className="block normal-case font-sans text-[9px] text-[var(--accent-hdg)]">
                                  {t.admin.settings.quarterlyActiveBadge}
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {STEEL_TYPES.map((type) => {
                        const scheduledNow = quarterlyCurrentPrices[type];
                        const manualKey = PGL_FORM_KEY_BY_TYPE[type];
                        return (
                          <tr key={type} className="border-b border-[rgba(42,48,72,0.5)] last:border-b-0">
                            <td className="px-3 py-2 font-mono font-semibold">
                              <span
                                className="inline-flex items-center gap-1.5"
                                style={{ color: STEEL_TYPE_COLOR[type] }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: STEEL_TYPE_COLOR[type] }}
                                />
                                {type}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {scheduledNow === undefined ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  aria-label={`${type} — ${currentMonthLabel}`}
                                  value={form[manualKey]}
                                  onChange={(e) => setForm({ ...form, [manualKey]: e.target.value })}
                                  className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-full outline-none focus:border-[var(--accent-cr)]"
                                />
                              ) : (
                                <div
                                  title={`Q${quarterlyNow?.quarter} ${quarterlyNow?.year}`}
                                  className="flex items-center justify-end gap-1.5 px-2 py-1 font-mono text-[13px] font-medium text-[var(--accent-hdg)]"
                                >
                                  {scheduledNow.toFixed(2)}
                                  <span className="text-[9px] opacity-70">Q{quarterlyNow?.quarter}</span>
                                </div>
                              )}
                            </td>
                            {QUARTERS.map((q) => {
                              const isActive = quarterlyNow?.year === quarterlyYear && quarterlyNow?.quarter === q;
                              return (
                                <td key={q} className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="—"
                                    aria-label={`${type} Q${q} ${quarterlyYear}`}
                                    value={quarterlyGrid[type][q]}
                                    onChange={(e) => updateQuarterlyCell(type, q, e.target.value)}
                                    className="bg-[var(--bg-input)] border rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] text-right w-full outline-none focus:border-[var(--accent-cr)]"
                                    style={{ borderColor: isActive ? 'var(--accent-hdg)' : 'var(--border)' }}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="px-4 py-2.5 text-[10px] text-[var(--text-muted)] border-t border-[rgba(42,48,72,0.5)]">
                {t.admin.settings.pglBaseHint}
              </p>
            </div>

            <div className="py-2 border-t border-[var(--border)]">{otherFields.map(renderField)}</div>

            <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)]">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded bg-gradient-to-r from-[#e8a020] to-[#f0c040] text-[#0d1220] font-mono text-xs font-bold tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? '…' : t.admin.settings.save}
              </button>
              {message && (
                <span
                  className="text-xs font-mono"
                  style={{
                    color: message.type === 'success' ? 'var(--accent-hdg)' : 'var(--accent-sum)',
                  }}
                >
                  {message.text}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2.5 px-4 py-3 rounded-md border-l-[3px] border-[var(--accent-zm)] bg-[rgba(139,124,246,0.08)]">
            <span className="text-base leading-none">ℹ</span>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {t.admin.settings.quarterlyNotice}
            </p>
          </div>

          {/* Bez tego ostrzeżenia admin nie ma jak wiedzieć, że zmiana kursu NIE rusza ofert
              już wycenionych — a to jest tu najważniejsza zasada działania systemu. */}
          <div className="flex gap-2.5 px-4 py-3 rounded-md border-l-[3px] border-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)]">
            <span className="text-base leading-none">ℹ</span>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {t.admin.settings.frozenRateNotice}
            </p>
          </div>

          {/* Cennik transportowy — stawki przewoźnika w PLN. Pasmo ma ALBO ryczałt,
              ALBO stawkę za km; serwer waliduje to drugi raz (app/api/settings/tariff). */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-hdg)]" />
              <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
                {t.admin.settings.tariffTitle}
              </h2>
              <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">
                {t.admin.settings.tariffSubtitle}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                      {t.admin.settings.tariffFrom}
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                      {t.admin.settings.tariffTo}
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                      {t.admin.settings.tariffFlat}
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                      {t.admin.settings.tariffPerKm}
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {bands.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
                        {t.admin.settings.tariffEmpty}
                      </td>
                    </tr>
                  )}
                  {bands.map((band, index) => (
                    <tr key={index} className="border-b border-[rgba(42,48,72,0.5)]">
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={band.fromKm}
                          onChange={e => updateBand(index, { fromKm: e.target.value })}
                          className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] text-right w-full focus:border-[var(--accent-cr)] outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={band.toKm}
                          onChange={e => updateBand(index, { toKm: e.target.value })}
                          placeholder={t.admin.settings.tariffOpenEnded}
                          className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] text-right w-full focus:border-[var(--accent-cr)] outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={band.flatPln}
                          // Wpisanie ryczałtu czyści stawkę za km (i odwrotnie) — inaczej admin
                          // zostawiłby oba pola i dostał błąd walidacji dopiero przy zapisie.
                          onChange={e => updateBand(index, { flatPln: e.target.value, perKmPln: '' })}
                          className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] text-right w-full focus:border-[var(--accent-cr)] outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={band.perKmPln}
                          onChange={e => updateBand(index, { perKmPln: e.target.value, flatPln: '' })}
                          className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] text-right w-full focus:border-[var(--accent-cr)] outline-none"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => removeBand(index)}
                          title={t.admin.settings.tariffRemove}
                          aria-label={`${t.admin.settings.tariffRemove} ${index + 1}`}
                          className="text-[var(--text-muted)] hover:text-[var(--accent-sum)] transition-colors text-sm leading-none px-1"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-[var(--border)]">
              <button
                onClick={handleSaveTariff}
                disabled={tariffSaving}
                className="px-5 py-2 rounded bg-gradient-to-r from-[#e8a020] to-[#f0c040] text-[#0d1220] font-mono text-xs font-bold tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {tariffSaving ? '…' : t.admin.settings.tariffSave}
              </button>
              <button
                onClick={addBand}
                className="px-3 py-2 rounded border border-[var(--border)] text-[var(--text-secondary)] font-mono text-xs hover:border-[var(--accent-cr)] hover:text-[var(--text-primary)] transition-colors"
              >
                + {t.admin.settings.tariffAdd}
              </button>
              {tariffMessage && (
                <span
                  className="text-xs font-mono"
                  style={{
                    color: tariffMessage.type === 'success' ? 'var(--accent-hdg)' : 'var(--accent-sum)',
                  }}
                >
                  {tariffMessage.text}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2.5 px-4 py-3 rounded-md border-l-[3px] border-[var(--accent-hdg)] bg-[rgba(46,196,127,0.08)]">
            <span className="text-base leading-none">ℹ</span>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {t.admin.settings.tariffNotice}
            </p>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
              <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
                {t.admin.settings.historyTitle}
              </h2>
              <button
                onClick={() => exportPglHistoryToExcel(sortedHistory)}
                disabled={sortedHistory.length === 0}
                className="ml-auto px-3 py-1.5 rounded bg-[var(--bg-input)] border border-[var(--border)] text-[10px] font-mono font-semibold tracking-wider text-[var(--text-primary)] hover:border-[var(--accent-cr)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t.admin.settings.historyDownload}
              </button>
            </div>

            {historyLoading ? (
              <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
                {t.admin.settings.historyLoading}
              </div>
            ) : history.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
                {t.admin.settings.historyEmpty}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-b border-[var(--border)] bg-[rgba(15,20,35,0.3)]">
                  <button
                    onClick={() => setTypeFilter('ALL')}
                    className="px-2.5 py-1 rounded border text-[10px] font-mono font-semibold tracking-wider transition-colors"
                    style={{
                      borderColor: typeFilter === 'ALL' ? 'var(--accent-cr)' : 'var(--border)',
                      color: typeFilter === 'ALL' ? 'var(--accent-cr)' : 'var(--text-secondary)',
                    }}
                  >
                    {t.admin.settings.historyFilterAll}
                  </button>
                  {STEEL_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => setTypeFilter(type)}
                      className="px-2.5 py-1 rounded border text-[10px] font-mono font-semibold tracking-wider transition-colors"
                      style={{
                        borderColor: typeFilter === type ? STEEL_TYPE_COLOR[type] : 'var(--border)',
                        color: typeFilter === type ? STEEL_TYPE_COLOR[type] : 'var(--text-secondary)',
                      }}
                    >
                      {type}
                    </button>
                  ))}

                  <span className="w-px h-4 bg-[var(--border)] mx-1.5" />

                  <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] font-mono">
                    {t.admin.settings.historyFilterFrom}
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-1.5 py-1 text-[11px] text-[var(--text-primary)] font-mono focus:border-[var(--accent-cr)] outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] font-mono">
                    {t.admin.settings.historyFilterTo}
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-1.5 py-1 text-[11px] text-[var(--text-primary)] font-mono focus:border-[var(--accent-cr)] outline-none"
                    />
                  </label>

                  {hasActiveFilters && (
                    <button
                      onClick={resetFilters}
                      className="ml-auto px-2.5 py-1.5 rounded border border-[var(--border)] text-[10px] font-mono font-semibold tracking-wider text-[var(--text-secondary)] hover:border-[var(--accent-sum)] hover:text-[var(--accent-sum)] transition-colors"
                    >
                      {t.admin.settings.historyFilterReset}
                    </button>
                  )}
                </div>

                {sortedHistory.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
                    {t.admin.settings.historyNoResults}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                          {HISTORY_COLUMNS.map((col) => (
                            <th
                              key={col.key}
                              onClick={() => toggleSort(col.key)}
                              className={`font-medium px-4 py-2 cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors ${
                                col.align === 'right' ? 'text-right' : 'text-left'
                              }`}
                            >
                              {t.admin.settings[col.labelKey]}
                              {sortKey === col.key && (
                                <span className="ml-1 text-[var(--accent-cr)]">
                                  {sortDir === 'asc' ? '▲' : '▼'}
                                </span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedHistory.map((entry) => {
                          const delta = entry.newPrice - entry.oldPrice;
                          return (
                            <tr key={entry.id} className="border-b border-[rgba(42,48,72,0.5)] last:border-b-0">
                              <td className="px-4 py-2 font-mono font-semibold">
                                <span
                                  className="inline-flex items-center gap-1.5"
                                  style={{ color: STEEL_TYPE_COLOR[entry.steelType] }}
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: STEEL_TYPE_COLOR[entry.steelType] }}
                                  />
                                  {entry.steelType}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-[var(--text-secondary)]">
                                {entry.oldPrice.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-[var(--text-primary)]">
                                {entry.newPrice.toFixed(2)}
                              </td>
                              <td
                                className="px-4 py-2 text-right font-mono font-semibold"
                                style={{ color: delta >= 0 ? 'var(--accent-sum)' : 'var(--accent-hdg)' }}
                              >
                                {delta >= 0 ? '+' : ''}
                                {delta.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-[var(--text-secondary)]">
                                {entry.changedByName || entry.changedByEmail || '—'}
                              </td>
                              <td className="px-4 py-2 font-mono text-[var(--text-muted)]">
                                {new Date(entry.changedAt).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
