'use client';

import type { ReactNode } from 'react';
import { ChevronRight, Truck } from 'lucide-react';
import type { Translations } from '@/lib/translations';
import type { TransportBreakdown } from '@/lib/transportTariff';
import { fixedGrouped, tonDecimals } from '@/lib/numberFormat';

// Rozwijany panel transportu w karcie Podsumowania.
//
// Panel jest CZYSTO prezentacyjny: cała logika (wywołanie /api/transport, liczenie
// kosztu, przeliczanie pozycji zestawienia) siedzi w Calculator.tsx, bo tylko tam
// widać tonaż całej oferty. Tutaj zostaje wyłącznie to, co widzi handlowiec.

/**
 * Trasa dostawy — jedna na CAŁĄ ofertę, nie na pozycję: towar jedzie jedną ciężarówką
 * (albo kilkoma), a nie osobnym kursem na każdą pozycję zestawienia.
 */
export interface TransportRoute {
  /** Adres dostawy wpisany przez handlowca (domyślnie z kartoteki klienta). */
  destAddress: string;
  /** Odległość drogowa w km. null = jeszcze nie policzona. */
  distanceKm: number | null;
  /** Adres w formie zwróconej przez geokoder — potwierdzenie, co faktycznie znaleziono. */
  destLabel: string | null;
  /** Elementy 13,6-15,1 m: ryczałtowa dopłata do każdego kursu. */
  hasLongElements: boolean;
  /** Elementy >15,1 m lub >2,4 m: przewoźnik wycenia indywidualnie -> kwota ręczna. */
  oversizeManual: boolean;
  /** Handlowiec świadomie wpisuje kwotę transportu sam (nietypowa trasa). */
  manualMode: boolean;
}

export const EMPTY_TRANSPORT_ROUTE: TransportRoute = {
  destAddress: '',
  distanceKm: null,
  destLabel: null,
  hasLongElements: false,
  oversizeManual: false,
  manualMode: false,
};

interface TransportPanelProps {
  open: boolean;
  onToggle: () => void;
  route: TransportRoute;
  onRouteChange: (patch: Partial<TransportRoute>) => void;
  /** null = transport liczony ręcznie albo brak danych do wyliczenia. */
  breakdown: TransportBreakdown | null;
  /** Tonaż całej oferty — dzielnik przy przeliczaniu kosztu kursu na €/t. */
  offerTons: number;
  originAddress: string;
  /** Adres z kartoteki klienta — podpowiedź "wstaw", gdy pole dostawy jest puste. */
  clientAddress: string;
  oversizeLongPln: number;
  loading: boolean;
  error: string | null;
  onCalculate: () => void;
  /** Transport in the item's price, EUR per ton. */
  transportEur: number;
  /** Input for the amount, shown only while the salesperson enters it by hand. */
  transportInput: ReactNode;
  /** EUR -> waluta wyświetlania, sformatowane (ta sama funkcja co reszta podsumowania). */
  formatEur: (eur: number) => string;
  /** Tariff amount in PLN -> offer display currency, formatted. */
  formatPln: (pln: number) => string;
  currencySymbol: string;
  /** Currency without "/t", for per-truck and total amounts. */
  currencyUnit: string;
  t: Translations;
  isDark: boolean;
  // Kept for call-site compatibility; high contrast no longer changes panel
  // colours, only typography/borders via the global .hc rules.
  highContrast?: boolean;
}

const inputClass =
  'bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text-primary)] font-mono text-[12px] w-full focus:border-[var(--accent-cr)] outline-none';

export default function TransportPanel({
  open,
  onToggle,
  route,
  onRouteChange,
  breakdown,
  offerTons,
  originAddress,
  clientAddress,
  oversizeLongPln,
  loading,
  error,
  onCalculate,
  transportEur,
  transportInput,
  formatEur,
  formatPln,
  currencySymbol,
  currencyUnit,
  t,
  isDark,
}: TransportPanelProps) {
  const s = t.summary;
  // Kwota liczona automatycznie tylko wtedy, gdy handlowiec nie przejął sterowania.
  const isAuto = !route.manualMode && !route.oversizeManual;
  // Oversize transport is priced by the carrier, so it is typed by hand as well.
  const isManualAmount = route.manualMode || route.oversizeManual;

  const lightBorder = !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : '';

  return (
    <div className="border-b border-[rgba(42,48,72,0.5)]">
      {/* Always-visible bordered, tinted bar (not a bare text row) so the panel reads as
          clickable in both themes - it was easy to miss, especially in light mode. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group w-[calc(100%-1.5rem)] mx-3 my-2 flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left
          border border-[color-mix(in_srgb,var(--accent-cr)_45%,transparent)]
          bg-[color-mix(in_srgb,var(--accent-cr)_9%,transparent)]
          hover:border-[var(--accent-cr)] hover:bg-[color-mix(in_srgb,var(--accent-cr)_16%,transparent)]
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-cr)]
          transition-colors duration-150"
      >
        <ChevronRight
          aria-hidden
          className={`w-4 h-4 shrink-0 text-[var(--accent-cr)] transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        <Truck aria-hidden className="w-4 h-4 shrink-0 text-[var(--accent-cr)]" />
        <span className="flex-1 text-[13px] font-bold uppercase tracking-wide text-[var(--accent-cr)]">{s.transportRouteTitle}</span>
        {/* Zwinięty panel i tak pokazuje kluczową liczbę — handlowiec nie musi go
            rozwijać, żeby sprawdzić, na jakiej odległości stoi wycena. */}
        {route.distanceKm !== null ? (
          <span className="font-mono text-[11px] font-semibold text-[var(--text-secondary)]">
            {route.distanceKm.toFixed(1)} km
          </span>
        ) : (
          !open && (
            <span className="text-[11px] italic text-[var(--text-secondary)] group-hover:text-[var(--accent-cr)] transition-colors">
              {s.transportRouteHint}
            </span>
          )
        )}
        {/* Transport is part of the price, so the amount stays visible with the panel collapsed. */}
        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] font-semibold text-[var(--text-value)]">
          {formatEur(transportEur)} {currencySymbol}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2.5">
          <div>
            <label className="block text-[10px] text-[var(--text-muted)] mb-1">{s.transportOrigin}</label>
            {/* Adres nadania jest globalny (Ustawienia) — tutaj tylko do wglądu, żeby
                handlowiec widział punkt A, ale nie zmieniał go per oferta. */}
            <div className="px-2 py-1.5 rounded bg-[rgba(255,255,255,0.03)] border border-[var(--border)] font-mono text-[12px] text-[var(--text-muted)]">
              {originAddress}
            </div>
          </div>

          <div>
            <label htmlFor="transport-dest" className="block text-[10px] text-[var(--text-muted)] mb-1">
              {s.transportDest}
            </label>
            <input
              id="transport-dest"
              type="text"
              value={route.destAddress}
              onChange={e => onRouteChange({ destAddress: e.target.value, distanceKm: null, destLabel: null })}
              placeholder={s.transportDestPlaceholder}
              className={`${inputClass} ${lightBorder}`}
            />
            {clientAddress.trim().length > 0 && route.destAddress.trim() !== clientAddress.trim() && (
              <button
                onClick={() => onRouteChange({ destAddress: clientAddress, distanceKm: null, destLabel: null })}
                className="mt-1 text-[10px] text-[var(--accent-cr)] hover:underline"
              >
                ↩ {s.transportFromClient}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onCalculate}
              disabled={loading || route.destAddress.trim().length === 0}
              className="px-3 py-1.5 rounded bg-[var(--accent-cr)] text-white font-mono text-[11px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {loading ? s.transportCalculating : s.transportCalculate}
            </button>
            {route.distanceKm !== null && (
              <button
                onClick={() =>
                  onRouteChange({ distanceKm: null, destLabel: null, destAddress: '' })
                }
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {s.transportClear}
              </button>
            )}
          </div>

          {route.destLabel && (
            <p className="text-[10px] text-[var(--text-muted)] leading-snug">📍 {route.destLabel}</p>
          )}

          {error && (
            <p className="text-[10px] text-[var(--accent-sum)] leading-snug">⚠️ {error}</p>
          )}

          {/* Kilometry ręcznie — awaryjne wyjście, gdy geokoder nie zna adresu albo
              serwis map nie odpowiada. Wycena nigdy nie może być zablokowana. */}
          <div className="flex items-center gap-2">
            <label htmlFor="transport-km" className="flex-1 text-[10px] text-[var(--text-muted)]">
              {s.transportManualKm}
            </label>
            <input
              id="transport-km"
              type="number"
              min="0"
              step="1"
              value={route.distanceKm ?? ''}
              onChange={e => {
                const raw = e.target.value;
                onRouteChange({
                  distanceKm: raw === '' ? null : Math.max(0, parseFloat(raw) || 0),
                  destLabel: null,
                });
              }}
              className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[12px] text-right w-[90px] focus:border-[var(--accent-cr)] outline-none ${lightBorder}`}
            />
            <span className="text-[10px] text-[var(--text-muted)] font-mono w-[22px]">km</span>
          </div>

          <div className="h-px bg-[var(--border)]" />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={route.hasLongElements}
              onChange={e => onRouteChange({ hasLongElements: e.target.checked })}
              className="accent-[var(--accent-cr)]"
            />
            <span className="text-[10px] text-[var(--text-secondary)]">
              {s.transportOversizeLong.replace('{price}', String(oversizeLongPln))}
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={route.oversizeManual}
              onChange={e => onRouteChange({ oversizeManual: e.target.checked })}
              className="accent-[var(--accent-sum)]"
            />
            <span className="text-[10px] text-[var(--text-secondary)]">{s.transportOversizeManual}</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={route.manualMode}
              onChange={e => onRouteChange({ manualMode: e.target.checked })}
              className="accent-[var(--accent-sum)]"
            />
            <span className="text-[10px] text-[var(--text-secondary)]">{s.transportManualMode}</span>
          </label>

          {/* Read-only unless typed by hand: a route rate would overwrite a manual edit on the
              next recalculation. */}
          <div className="flex items-center">
            <span className="flex-1 text-xs text-[var(--text-secondary)]">{s.transport}</span>
            {isManualAmount ? transportInput : (
              <span className="font-mono text-[13px] text-[var(--text-value)] font-medium">{formatEur(transportEur)}</span>
            )}
            <span className="text-[10px] text-[var(--text-muted)] font-mono ml-1 w-[22px]">{currencySymbol}</span>
          </div>

          {route.oversizeManual && (
            <p className="text-[10px] text-[var(--accent-hrs)] leading-snug">
              ⚠️ {s.transportOversizeManualNotice}
            </p>
          )}

          {/* Rozbicie kosztu. To jest ten "widoczny banner": handlowiec widzi wprost,
              ile kursów policzył system i z jakiego tonażu to wyszło — a więc dlaczego
              €/t skoczyło po dodaniu kolejnej pozycji. */}
          {isAuto && breakdown && (
            <div className="rounded border border-[rgba(59,142,245,0.25)] bg-[rgba(59,142,245,0.08)] px-2.5 py-2 space-y-1">
              <p className="text-[10px] text-[var(--text-secondary)]">
                {s.transportRecalcNotice
                  .replace('{tons}', fixedGrouped(offerTons, tonDecimals(offerTons)))
                  .replace('{trucks}', String(breakdown.trucks))}
              </p>
              <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)]">
                <span>{s.transportPerTruck}</span>
                <span>
                  {formatPln(breakdown.pricePerTruckPln)}
                  {breakdown.oversizePerTruckPln > 0 && ` + ${formatPln(breakdown.oversizePerTruckPln)}`} {currencyUnit}
                </span>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)]">
                <span>{s.transportTrucks}</span>
                <span>× {breakdown.trucks}</span>
              </div>
              <div className="flex justify-between text-[11px] font-mono text-[var(--text-value)] font-semibold">
                <span>{s.transportTotalCost}</span>
                <span>{formatPln(breakdown.totalPln)} {currencyUnit}</span>
              </div>
              <div className="text-right text-[13px] font-mono font-bold text-[var(--text-value)]">
                = {formatEur(breakdown.eurPerTon)} {currencySymbol}
              </div>
            </div>
          )}

          {isAuto && !breakdown && route.distanceKm !== null && (
            <p className="text-[10px] text-[var(--accent-hrs)] leading-snug">⚠️ {s.transportNoTariff}</p>
          )}
        </div>
      )}
    </div>
  );
}
