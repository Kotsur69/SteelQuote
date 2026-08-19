'use client';

import { useId } from 'react';
import { useClientLookup, type ClientSuggestion } from '@/lib/useClientLookup';
import { useComboboxNavigation } from '@/lib/useComboboxNavigation';

interface ClientComboboxProps {
  label: string;
  value: string;
  /** Ręczne pisanie w polu. Nowa firma musi dać się wpisać bez wybierania z listy. */
  onChange: (value: string) => void;
  /** Wybór podpowiedzi — uzupełnia CAŁY komplet danych firmy, nie tylko to pole. */
  onSelect: (client: ClientSuggestion) => void;
  placeholder?: string;
  /**
   * Fraza używana, gdy własne pole jest (jeszcze) za krótkie, żeby czegokolwiek szukać.
   * Pole NIP dostaje tu nazwę firmy i odwrotnie — dzięki temu skasowanie NIP-u przy
   * wpisanej firmie nie wyłącza podpowiedzi, tylko pozwala wskazać brakującą wartość.
   */
  fallbackQuery?: string;
  isDark: boolean;
  highContrast?: boolean;
  /** Komunikat pod polem, gdy API podpowiedzi nie odpowiada. */
  lookupErrorLabel: string;
  className?: string;
}

// Pole "Firma" / "NIP" z podpowiedziami z katalogu klientów.
//
// Wpisywanie jest ZAWSZE dozwolone — to jest combobox, nie select. Podpowiedzi są
// skrótem ("ta firma już u nas była, weź jej dane"), a nie warunkiem; nowego klienta
// trzeba móc wpisać ręcznie, inaczej nie da się wystawić pierwszej oferty.
export default function ClientCombobox({
  label,
  value,
  onChange,
  onSelect,
  placeholder,
  fallbackQuery = '',
  isDark,
  highContrast = false,
  lookupErrorLabel,
  className = '',
}: ClientComboboxProps) {
  // useId, nie licznik modułowy — te same identyfikatory muszą wyjść z renderu na
  // serwerze i na kliencie, inaczej Next zgłasza niezgodność hydracji.
  const listboxId = useId();

  // Otwieranie, podświetlenie i klawiatura siedzą we wspólnym hooku — ContactCombobox
  // używa dokładnie tego samego zachowania.
  const { isOpen, setIsOpen, activeIndex, setActiveIndex, containerRef, bind } =
    useComboboxNavigation(value);

  // Podpowiedzi pobieramy tylko przy otwartej liście. Zamknięcie pola przestaje
  // odpytywać API, zamiast trzymać wyniki, których i tak nie widać.
  const { suggestions, failed } = useClientLookup(value, isOpen, fallbackQuery);

  const { choose, handleKeyDown } = bind<ClientSuggestion>(suggestions, onSelect);

  const showList = isOpen && suggestions.length > 0;

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={`${listboxId}-input`}
        className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-secondary)]"
      >
        {label}
      </label>

      <input
        id={`${listboxId}-input`}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[#a78bfa] outline-none transition-colors w-full
          ${!highContrast && !isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
      />

      {failed && (
        // role="status" zamiast cichego znikania: czytnik ekranu ma to ogłosić,
        // a handlowiec ma wiedzieć, że brak podpowiedzi to awaria, nie pusta baza.
        <span role="status" className="text-[10px] text-[#f59e0b] font-mono">
          {lookupErrorLabel}
        </span>
      )}

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute top-full left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto bg-[var(--bg-card)] border border-[var(--border)] rounded shadow-lg animate-[fadeIn_0.15s_ease-out]"
        >
          {suggestions.map((client, index) => (
            <li
              key={client.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // onMouseDown, nie onClick: onClick leci PO blurze inputa, a blur zdążyłby
              // zamknąć listę i klik trafiłby w pustkę.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(client);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`px-3 py-2 cursor-pointer border-b border-[var(--border)] last:border-b-0 transition-colors
                ${index === activeIndex ? 'bg-[rgba(167,139,250,0.14)]' : ''}`}
            >
              <div className="text-[var(--text-primary)] font-mono text-xs truncate">
                {client.company || '—'}
              </div>
              {/* Druga linia rozstrzyga wybór, gdy dwie firmy nazywają się podobnie. */}
              <div className="text-[10px] text-[var(--text-secondary)] font-mono truncate">
                {[
                  client.nip && `NIP ${client.nip}`,
                  client.sapId && `SAP ${client.sapId}`,
                  client.address,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
