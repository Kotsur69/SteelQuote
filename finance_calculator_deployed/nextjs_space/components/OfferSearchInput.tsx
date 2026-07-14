'use client';

interface OfferSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Etykieta dla czytnikow ekranu na przycisku czyszczenia (×). */
  clearLabel: string;
  className?: string;
}

// Pole szukania ofert — wspolne dla /offers, /senior i /admin/oferty.
// Szuka po nazwie wlasnej, nazwie zastepczej ("offer_30") i surowym ID; cala
// robote robi baza (?q=), tu jest tylko input i przycisk czyszczenia.
export default function OfferSearchInput({
  value,
  onChange,
  placeholder,
  clearLabel,
  className = '',
}: OfferSearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[var(--bg-input)] border border-[var(--border)] rounded pl-2 pr-6 py-1 text-[11px] font-mono text-[var(--text-primary)] w-56 hover:border-[var(--border-hi)] focus:border-[var(--accent-cr)] focus:outline-none transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label={clearLabel}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}
