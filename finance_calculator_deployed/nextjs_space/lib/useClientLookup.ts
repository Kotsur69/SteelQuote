'use client';

import { useEffect, useRef, useState } from 'react';

const LOOKUP_DEBOUNCE_MS = 250;

// Musi być zgodne z MIN_QUERY_LENGTH w app/api/clients/search/route.ts. Odcinamy
// krótsze frazy już tutaj, żeby w ogóle nie strzelać zapytania, o którym z góry
// wiadomo, że wróci puste.
const MIN_QUERY_LENGTH = 2;

export interface ClientSuggestion {
  id: number;
  company: string;
  nip: string;
  address: string;
  sapId: string;
}

interface ClientLookupResult {
  suggestions: ClientSuggestion[];
  // Podpowiedzi to wygoda, nie warunek wystawienia oferty — dlatego błąd nie blokuje
  // formularza, ale MUSI być widoczny. Bez tego padnięte API wygląda dla handlowca
  // identycznie jak "tej firmy nie ma w bazie" i skłania do wpisania duplikatu ręcznie.
  failed: boolean;
}

// Podpowiedzi klientów pod pola "Firma" i "NIP" w kalkulatorze.
//
// Świadomie NIE nadbudowuje useOfferSearch: tamten hook sam trzyma stan frazy
// (`search`/`setSearch`), a tutaj frazą jest wartość pola formularza, której
// właścicielem jest Calculator. Wspólny jest sam wzorzec — debounce plus
// numerowanie zapytań — i to on jest tu powtórzony, a nie hook.
//
// `fallbackQuery` ratuje sytuację, w której szukane pole jest puste, a sąsiednie nie:
// handlowiec ma wpisaną firmę, kasuje NIP i klika w to puste pole. Bez fallbacku
// wyszukiwarka milczy (pusta fraza < 2 znaków), mimo że firma na ekranie jednoznacznie
// wskazuje, o którego klienta chodzi. Z fallbackiem pole NIP szuka wtedy po nazwie
// firmy i podpowiada dokładnie ten brakujący NIP.
export function useClientLookup(
  query: string,
  enabled: boolean,
  fallbackQuery = ''
): ClientLookupResult {
  const [suggestions, setSuggestions] = useState<ClientSuggestion[]>([]);
  const [failed, setFailed] = useState(false);

  // Numer ostatniego wystrzelonego zapytania. Ref, nie state — jego zmiana nie ma
  // przerysowywać komponentu, ma tylko unieważniać starsze odpowiedzi.
  //
  // Bez tego: handlowiec dopisuje "huta" litera po literze, odpowiedź na "hu"
  // wraca PO odpowiedzi na "huta" i podmienia listę na wyniki frazy, której już
  // nie ma w polu. Ten sam problem i to samo lekarstwo co w useOfferSearch.
  const latestRequest = useRef(0);

  useEffect(() => {
    const typed = query.trim();
    // Własna treść pola ma pierwszeństwo — fallback wchodzi tylko wtedy, gdy z tego,
    // co wpisano, i tak nie dałoby się nic sensownie wyszukać.
    const phrase = typed.length >= MIN_QUERY_LENGTH ? typed : fallbackQuery.trim();

    if (!enabled || phrase.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setFailed(false);
      return;
    }

    const timer = setTimeout(async () => {
      const requestId = ++latestRequest.current;
      const isStale = () => requestId !== latestRequest.current;

      try {
        const response = await fetch(`/api/clients/search?q=${encodeURIComponent(phrase)}`);
        if (!response.ok) throw new Error(`Client lookup failed: ${response.status}`);

        const data = await response.json();
        if (isStale()) return;

        setSuggestions(Array.isArray(data.clients) ? data.clients : []);
        setFailed(false);
      } catch (error) {
        console.error('Client lookup error:', error);
        if (isStale()) return;

        setSuggestions([]);
        setFailed(true);
      }
    }, LOOKUP_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, enabled, fallbackQuery]);

  return { suggestions, failed };
}
