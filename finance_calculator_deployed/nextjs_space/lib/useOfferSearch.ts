'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 250;

// Wspolna hydraulika szukania ofert dla /offers, /senior i /admin/oferty.
// Filtruje BAZA (?q=), nie front — ta sama fraza dziala tak samo z kazdego panelu.
//
// Dwa problemy, ktore ten hook rozwiazuje:
//
// 1. Debounce — nie strzelamy do API na kazdy wcisniety klawisz.
//
// 2. Wyscig odpowiedzi. Kazde wpisanie frazy to osobny fetch, a odpowiedzi moga
//    wrocic w innej kolejnosci, niz poszly zapytania. Odpowiedz na "hu", ktora
//    dotrze PO odpowiedzi na "huta", nadpisalaby liste wynikami dla frazy, ktorej
//    handlowiec juz nie widzi w polu. Dlatego kazde zapytanie dostaje numer, a
//    wynik trafia do stanu tylko wtedy, gdy to wciaz NAJNOWSZE zapytanie.
export function useOfferSearch(delayMs: number = SEARCH_DEBOUNCE_MS) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), delayMs);
    return () => clearTimeout(timer);
  }, [search, delayMs]);

  // Numer ostatniego wystrzelonego zapytania. Ref, nie state — zmiana nie ma
  // przerysowywac komponentu, ma tylko uniewazniac starsze odpowiedzi.
  const latestRequest = useRef(0);

  // Wywolaj PRZED fetchem. Zwraca funkcje, ktora mowi, czy ta odpowiedz jest
  // wciaz aktualna — jesli nie, wynik trzeba wyrzucic, a nie wstawic do stanu.
  const beginRequest = useCallback(() => {
    const requestId = ++latestRequest.current;
    return () => requestId === latestRequest.current;
  }, []);

  return { search, setSearch, debouncedSearch, beginRequest };
}
