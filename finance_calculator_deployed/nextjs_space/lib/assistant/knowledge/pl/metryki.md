# Metryki - definicje

Asystent liczy tym samym silnikiem co panel Analiza, więc liczby są zgodne z panelem.

## Zasady liczenia
- **Zakres** - tylko oferty widoczne dla pytającego (patrz role-i-widocznosc.md).
- **Wersje** - każda rodzina wersji liczy się raz, według najnowszej wersji (wybieranej przed filtrami). Oferta edytowana cztery razy to jedna oferta; renegocjacja zakończona wygraną to jedna wygrana oferta.
- **Data** - każda metryka ma podstawę daty: utworzenia, wysłania albo decyzji klienta. Przy podstawie "wysłania" lub "decyzji" oferty bez tej daty nie wchodzą do wyniku. Dzień oferty wyznacza strefa czasowa bazy danych.
- **Typ stali** - filtr zawęża **pozycje**, nie oferty: oferta z HRS i HDG przy pytaniu o HDG liczy tylko tony i wartość pozycji HDG; oferta bez pasującej pozycji odpada.
- **Pieniądze** - źródłem prawdy jest EUR (suma wartości pozycji, transport wliczony). PLN = wartość EUR x kurs zamrożony w każdej ofercie (nie dzisiejszy kurs). Odpowiedzi podają EUR i PLN.
- **Marża ważona** - średnia marża % ważona tonażem; pozycje bez zapisanej marży są pomijane (nie liczą się jako 0). Asystent podaje też **średnią prostą** marży per oferta.
- **Skuteczność (win rate)** = wygrane / (wygrane + przegrane), osobno dla liczby ofert i dla ton. Oferty bez decyzji się nie liczą. Brak decyzji w okresie = brak wyniku (nie 0%).
- **Bez decyzji** w panelu Analiza obejmuje wszystkie oferty bez wygranej/przegranej, także jeszcze niewysłane.
- Asystent nie prognozuje, nie zgaduje i nie używa danych spoza aplikacji. Brak ofert = "brak ofert spełniających kryteria".

## Katalog metryk
| Metryka | Znaczenie | Podstawa daty | Jednostka |
|---|---|---|---|
| offers_created | oferty utworzone | utworzenia | liczba |
| offers_sent | oferty wysłane do klienta | wysłania | liczba |
| offers_won / offers_lost | oferty wygrane / przegrane | decyzji | liczba |
| offers_pending | bez decyzji klienta (także jeszcze niewysłane - jak "Bez decyzji" w panelu) | utworzenia | liczba |
| tons_offered | tony ofert | utworzenia lub wysłania | t |
| tons_won ("sprzedane") | tony ofert wygranych | decyzji | t |
| tons_lost | tony ofert przegranych | decyzji | t |
| value_lost | wartość ofert przegranych | decyzji | EUR + PLN |
| clients_lost | liczba różnych klientów, którzy odrzucili ofertę | decyzji | liczba |
| value_offered | wartość ofert | utworzenia lub wysłania | EUR + PLN |
| value_won ("sprzedaż") | wartość ofert wygranych | decyzji | EUR + PLN |
| clients_offered | liczba różnych klientów z ofertą | utworzenia lub wysłania | liczba |
| clients_won | liczba różnych klientów z wygraną | decyzji | liczba |
| win_rate_offers / win_rate_tons | wygrane / (wygrane + przegrane) | decyzji | % |
| margin_weighted | średnia marża ważona tonażem (jak w panelu) | parametr | % |
| margin_simple | średnia prosta marży per oferta | parametr | % |
| avg_tons_per_offer / avg_value_per_offer | średnie na ofertę | parametr | t / EUR |
| lost_reasons | przegrane oferty wg powodu: liczba, tony, wartość, udział % | decyzji | liczba + t + EUR/PLN + % |

Powody przegranej to lista z aplikacji (Admin -> Powody przegranej), ta sama co w panelu Analiza; asystent nie wymyśla własnych powodów. Każda data liczy się według **najnowszej wersji** oferty (tak jak w panelu). Średnia prosta marży (margin_simple) pojawi się też w panelu Analiza (plan D21).

## Polskie czasowniki -> metryka
| Sformułowanie | Metryka | Data |
|---|---|---|
| zrobił, stworzył, przygotował, wystawił (ofertę) | offers_created / *_offered | utworzenia |
| wysłał, ofertował, złożył ofertę, klient "dostał ofertę" | offers_sent / *_offered | wysłania |
| sprzedał, wygrał, zamknął, "sprzedaż" | *_won | decyzji |
| przegrał, stracił, klient odrzucił / nie przyjął oferty | *_lost (+ clients_lost, lost_reasons) | decyzji |
| marża, średnia marża | margin_weighted + margin_simple | domyślnie wysłania |

"Ile Marek sprzedał" bez jednostki = tony + wartość + liczba ofert wygranych, datowane decyzją klienta.

## Panel Analiza
Domyślnie: ostatnie 90 dni, licz po dacie utworzenia. Przełącznik "Licz po dacie": utworzenia / wysłania / decyzji klienta. Filtry: handlowcy, typy stali, statusy, decyzje klienta, klienci. Miary: tony, wartość, liczba ofert, klienci, marża %.
