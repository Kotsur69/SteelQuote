'use client';

import { useEffect, useRef, useState } from 'react';

const LOOKUP_DEBOUNCE_MS = 250;

export interface ContactSuggestion {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

interface ContactLookupResult {
  suggestions: ContactSuggestion[];
  // Tak samo jak przy firmach: awaria podpowiedzi nie może wyglądać jak "ta firma
  // nie ma zapisanych kontaktów", bo to wprost zachęca do wpisania duplikatu.
  failed: boolean;
}

// Podpowiedzi osób kontaktowych pod polem "Imię" w kalkulatorze.
//
// Różnica wobec useClientLookup jest zamierzona i nie da się tych hooków skleić:
// tam frazą jest zawartość pola i BEZ dwóch znaków nie ma po co strzelać zapytania,
// bo przeszukiwany jest cały katalog. Tutaj zakres jest z góry zawężony do jednej
// firmy, a wymaganiem jest pokazanie osób OD RAZU po wejściu w pole — więc pusta
// fraza jest normalnym, poprawnym zapytaniem ("pokaż wszystkie osoby tej firmy").
export function useContactLookup(
  company: string,
  nip: string,
  query: string,
  enabled: boolean
): ContactLookupResult {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [failed, setFailed] = useState(false);

  // Ten sam strażnik kolejności co w useClientLookup: odpowiedź na starszą frazę
  // potrafi wrócić po nowszej i podmienić listę na nieaktualną.
  const latestRequest = useRef(0);

  useEffect(() => {
    const companyPhrase = company.trim();
    const nipPhrase = nip.trim();
    const phrase = query.trim();

    // Bez firmy nie wiadomo, czyje kontakty pokazać — trasa i tak zwróciłaby pustkę.
    if (!enabled || (companyPhrase === '' && nipPhrase === '')) {
      setSuggestions([]);
      setFailed(false);
      return;
    }

    const timer = setTimeout(async () => {
      const requestId = ++latestRequest.current;
      const isStale = () => requestId !== latestRequest.current;

      try {
        const params = new URLSearchParams({ company: companyPhrase, nip: nipPhrase });
        if (phrase !== '') params.set('q', phrase);

        const response = await fetch(`/api/clients/contacts?${params.toString()}`);
        if (!response.ok) throw new Error(`Contact lookup failed: ${response.status}`);

        const data = await response.json();
        if (isStale()) return;

        setSuggestions(Array.isArray(data.contacts) ? data.contacts : []);
        setFailed(false);
      } catch (error) {
        console.error('Contact lookup error:', error);
        if (isStale()) return;

        setSuggestions([]);
        setFailed(true);
      }
    }, LOOKUP_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [company, nip, query, enabled]);

  return { suggestions, failed };
}
