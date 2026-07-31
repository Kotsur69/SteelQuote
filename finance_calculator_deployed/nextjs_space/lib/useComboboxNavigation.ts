'use client';

import { useEffect, useRef, useState } from 'react';

// Obsługa klawiatury i zamykania listy — wspólna dla wszystkich pól z podpowiedziami.
//
// Wyciągnięte z ClientCombobox przy dokładaniu ContactCombobox. To jedyny fragment,
// który w obu polach jest IDENTYCZNY (dane, filtrowanie i rysowanie wiersza już nie),
// a jednocześnie najłatwiej się rozjeżdża: poprawka zawijania strzałek zrobiona
// w jednym pliku po cichu omijałaby drugi.
// Podpowiedzi pobierane są tylko przy OTWARTEJ liście, więc lista wyników nie może być
// argumentem tego hooka — w chwili wywołania jeszcze nie istnieje. Stąd dwa kroki:
// hook oddaje `isOpen`, komponent pobiera nim dane, a potem domyka całość przez `bind`.
export function useComboboxNavigation(
  // Zmiana tej wartości kasuje podświetlenie. Po zmianie frazy stara pozycja kursora
  // wskazuje już inny wiersz, więc Enter wybrałby coś, czego handlowiec nie widział.
  resetKey: string
) {
  const [isOpen, setIsOpen] = useState(false);
  // -1 = żaden wiersz. Strzałki i mysz ustawiają to samo pole, dzięki czemu Enter
  // zawsze wybiera dokładnie to, co widać jako podświetlone.
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lista leży absolutnie NAD resztą formularza, więc klik gdzie indziej musi ją
  // zamykać — inaczej zasłania pola pod spodem.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => setActiveIndex(-1), [resetKey]);

  // Drugi krok: dopina zachowanie do konkretnej listy podpowiedzi. Zwykła funkcja,
  // nie hook — nie trzyma stanu i wolno ją wywołać po dowolnym `if`-ie.
  function bind<T>(items: T[], onChoose: (item: T) => void) {
    const choose = (item: T) => {
      onChoose(item);
      setIsOpen(false);
      setActiveIndex(-1);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      // Escape zamyka listę, ale NIE czyści pola — wpisany tekst to potencjalnie nazwa
      // nowej firmy albo nowej osoby, której nie wolno skasować za plecami handlowca.
      if (event.key === 'Escape') {
        setIsOpen(false);
        setActiveIndex(-1);
        return;
      }

      if (items.length === 0) return;

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        // preventDefault, bo strzałki w inpucie domyślnie skaczą kursorem po tekście.
        event.preventDefault();
        setIsOpen(true);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        // Zawijanie modulo: z dołu listy wracamy na górę i odwrotnie.
        const count = items.length;
        setActiveIndex((prev) => (prev + step + count) % count);
        return;
      }

      if (event.key === 'Enter' && activeIndex >= 0) {
        // Bez tego Enter wysłałby formularz zamiast wybrać podpowiedź.
        event.preventDefault();
        choose(items[activeIndex]);
      }
    };

    return { choose, handleKeyDown };
  }

  return { isOpen, setIsOpen, activeIndex, setActiveIndex, containerRef, bind };
}
