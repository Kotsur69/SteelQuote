'use client';

import type { Translations } from '@/lib/translations';
import type { TransportBreakdown } from '@/lib/transportTariff';

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
  /** Klient odbiera towar sam spod zakładu — transport = 0, reszta trasy nieistotna. */
  selfPickup: boolean;
}

export const EMPTY_TRANSPORT_ROUTE: TransportRoute = {
  destAddress: '',
  distanceKm: null,
  destLabel: null,
  hasLongElements: false,
  oversizeManual: false,
  manualMode: false,
  selfPickup: false,
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
  /** EUR -> waluta wyświetlania, sformatowane (ta sama funkcja co reszta podsumowania). */
  formatEur: (eur: number) => string;
  currencySymbol: string;
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
  formatEur,
  currencySymbol,
  t,
  isDark,
}: TransportPanelProps) {
  const s = t.summary;
  // Kwota liczona automatycznie tylko wtedy, gdy handlowiec nie przejął sterowania.
  const isAuto = !route.manualMode && !route.oversizeManual && !route.selfPickup;
  // Przy odbiorze własnym reszta trasy jest nieistotna — transport i tak wynosi 0.
  const routeDisabled = route.selfPickup;

  const lightBorder = !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : '';

  return (
    <div className="border-b border-[rgba(42,48,72,0.5)]">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-[rgba(255,255,255,0.025)] transition-colors text-left"
      >
        <span className="text-[10px] text-[var(--text-muted)] font-mono w-3">{open ? '▾' : '▸'}</span>
        <span className="flex-1 text-xs text-[var(--text-secondary)]">{s.transportRouteTitle}</span>
        {/* Zwinięty panel i tak pokazuje kluczową liczbę — handlowiec nie musi go
            rozwijać, żeby sprawdzić, na jakiej odległości stoi wycena. */}
        {route.distanceKm !== null && (
          <span className="font-mono text-[11px] text-[var(--text-muted)]">
            {route.distanceKm.toFixed(1)} km
          </span>
        )}
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={route.selfPickup}
              onChange={e => onRouteChange({ selfPickup: e.target.checked })}
              className="accent-[var(--accent-cr)]"
            />
            <span className="text-[10px] text-[var(--text-secondary)] font-semibold">{s.transportSelfPickup}</span>
          </label>

          <div
            className={`space-y-2.5 ${routeDisabled ? 'opacity-40 pointer-events-none' : ''}`}
            aria-disabled={routeDisabled}
          >
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

          {route.oversizeManual && (
            <p className="text-[10px] text-[var(--accent-hrs)] leading-snug">
              ⚠️ {s.transportOversizeManualNotice}
            </p>
          )}
          </div>

          {route.selfPickup && (
            <p className="text-[10px] text-[var(--text-muted)] leading-snug">🚚 {s.transportSelfPickupNotice}</p>
          )}

          {/* Rozbicie kosztu. To jest ten "widoczny banner": handlowiec widzi wprost,
              ile kursów policzył system i z jakiego tonażu to wyszło — a więc dlaczego
              €/t skoczyło po dodaniu kolejnej pozycji. */}
          {isAuto && breakdown && (
            <div className="rounded border border-[rgba(59,142,245,0.25)] bg-[rgba(59,142,245,0.08)] px-2.5 py-2 space-y-1">
              <p className="text-[10px] text-[var(--text-secondary)]">
                {s.transportRecalcNotice
                  .replace('{tons}', offerTons.toFixed(2))
                  .replace('{trucks}', String(breakdown.trucks))}
              </p>
              <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)]">
                <span>{s.transportPerTruck}</span>
                <span>
                  {breakdown.pricePerTruckPln.toFixed(2)}
                  {breakdown.oversizePerTruckPln > 0 && ` + ${breakdown.oversizePerTruckPln.toFixed(2)}`} zł
                </span>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)]">
                <span>{s.transportTrucks}</span>
                <span>× {breakdown.trucks}</span>
              </div>
              <div className="flex justify-between text-[11px] font-mono text-[var(--text-value)] font-semibold">
                <span>{s.transportTotalCost}</span>
                <span>{breakdown.totalPln.toFixed(2)} zł</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)]">
                <span>= {formatEur(breakdown.eurPerTon)}</span>
                <span>{currencySymbol}</span>
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
