'use client';

import { useId } from 'react';
import { useContactLookup, type ContactSuggestion } from '@/lib/useContactLookup';
import { useComboboxNavigation } from '@/lib/useComboboxNavigation';

interface ContactComboboxProps {
  label: string;
  /** Wartość pola "Imię" — ona jest jednocześnie frazą wyszukiwania. */
  value: string;
  /** Firma, której kontakty pokazujemy. Pusta = nie ma czego podpowiadać. */
  company: string;
  nip: string;
  onChange: (value: string) => void;
  /** Wybór osoby uzupełnia KOMPLET danych kontaktowych, nie tylko imię. */
  onSelect: (contact: ContactSuggestion) => void;
  placeholder?: string;
  isDark: boolean;
  lookupErrorLabel: string;
}

// Pole "Imię" z podpowiedziami osób kontaktowych zapisanych dla danej firmy.
//
// Osobny komponent od ClientCombobox, mimo podobnego wyglądu: tamten szuka po CAŁYM
// katalogu firm i wymaga dwóch znaków, ten pokazuje osoby JEDNEJ firmy od razu po
// wejściu w pole. Wspólne zachowanie listy siedzi w useComboboxNavigation.
//
// Wpisywanie jest zawsze dozwolone — nową osobę trzeba móc dopisać ręcznie, a zapis
// oferty utrwali ją w katalogu dla reszty działu.
export default function ContactCombobox({
  label,
  value,
  company,
  nip,
  onChange,
  onSelect,
  placeholder,
  isDark,
  lookupErrorLabel,
}: ContactComboboxProps) {
  const listboxId = useId();

  const { isOpen, setIsOpen, activeIndex, setActiveIndex, containerRef, bind } =
    useComboboxNavigation(value);

  const { suggestions, failed } = useContactLookup(company, nip, value, isOpen);

  const { choose, handleKeyDown } = bind<ContactSuggestion>(suggestions, onSelect);

  const showList = isOpen && suggestions.length > 0;

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
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
        // Kluczowe dla wymagania "kontakt ma się podpowiadać po kliknięciu w imię":
        // samo wejście w pole otwiera listę, bez pisania czegokolwiek.
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        className={`bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:border-[#a78bfa] outline-none transition-colors w-full disabled:cursor-not-allowed
          ${!isDark ? 'border-[#9aa4c4] text-[#0d1220]' : ''}`}
      />

      {failed && (
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
          {suggestions.map((contact, index) => (
            <li
              key={contact.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // onMouseDown, nie onClick: onClick leci PO blurze inputa, a blur zdążyłby
              // zamknąć listę i klik trafiłby w pustkę.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(contact);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`px-3 py-2 cursor-pointer border-b border-[var(--border)] last:border-b-0 transition-colors
                ${index === activeIndex ? 'bg-[rgba(167,139,250,0.14)]' : ''}`}
            >
              <div className="text-[var(--text-primary)] font-mono text-xs truncate">
                {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—'}
              </div>
              {/* Druga linia rozstrzyga wybór, gdy w firmie są dwie osoby o tym samym imieniu. */}
              <div className="text-[10px] text-[var(--text-secondary)] font-mono truncate">
                {[contact.phone, contact.email].filter(Boolean).join(' · ')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
