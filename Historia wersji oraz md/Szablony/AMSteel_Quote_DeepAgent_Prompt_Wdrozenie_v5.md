# Prompt dla DeepAgent (AbacusAI) — wdrozenie v5 (skok z v1.2 na v1.4: waluta+ustawienia,
# numery ofert, CS/DE, JWT hardening, katalog klientow+kontakty, panel Kontakty admina,
# zaokraglanie cen w gore, PGL bazowe osobno dla HRS/CR/HDG)

Skopiuj ponizszy tekst do DeepAgent i dolacz caly folder `finance_calculator_deployed/nextjs_space`
BEZPOSREDNIO Z DYSKU (nie z GitHuba) — obecny stan roboczy NIE jest jeszcze zacommitowany ani
wypchniety. Najlatwiej: spakuj folder `nextjs_space` do zipa (bez `node_modules`, `.next`, `.env`,
`.env.local`, `package-lock.json`) i dolacz zip do czatu DeepAgenta.

**WAZNE zanim wyslesz:** ostatni potwierdzony deploy na produkcje to **v1.2 z 2026-07-14** — kod na
https://steelpricinghub.abacusai.app nie ma jeszcze WALUTY, PANELU USTAWIEN, NUMEROW OFERT, JEZYKOW
CS/DE, KATALOGU KLIENTOW ani KONTAKTOW. Ten deploy wciaga to wszystko naraz (v1.3 + v1.4 + dzisiejsze
zmiany), zadna z tych czesci nigdy jeszcze nie chodzila na zywym ruchu. Zrob **kopie bazy przed
migracjami** (`pg_dump $DATABASE_URL > backup_przed_v1.4_<data>.sql` albo rownowazna opcja Abacusa) —
to jednorazowy, wiekszy skok niz poprzednie deploye.

---

Cel: chce wdrozyc do dzialajacej aplikacji (https://steelpricinghub.abacusai.app) nowa wersje
CALEGO projektu, ktora dostarczam w zalaczonym zipie/folderze. To NIE nowa aplikacja, tylko kolejna
wersja istniejacego projektu Next.js 14 (App Router, zwykly pg, JWT przez jose, bcryptjs). Zasada
nadrzedna: honoruj dokladnie moje pliki. Nie przepisuj logiki, nie zmieniaj stylu, nie "poprawiaj"
kodu, nie dopisuj niczego od siebie. Podmien tresc plikow jeden do jednego na te, ktore dostarczam.

## 1. Jak podmienic pliki

Zalaczony folder/zip to caly `nextjs_space` (bez `node_modules`, `.next`, `.env`, `.env.local`,
`package-lock.json` — celowo wyciete, patrz punkt 3). Traktuj go jako **zrodlo plikow do
nadpisania** istniejacego projektu, NIGDY jako zamiennik calego katalogu na serwerze — nadpisz
kazdy plik, ktory jest w zrodle, jego zawartoscia, ale NIE kasuj z serwera plikow, ktorych tam nie
ma (np. `.env`, `.abacus.donotdelete`), bo ich tam celowo brakuje.

Jesli jakas sciezka po twojej stronie rozni sie od mojej, zachowaj MOJA wersje pliku i tylko
dopasuj lokalizacje do istniejacej struktury projektu.

## 2. Co konkretnie zmienia ta wersja (kontekst, zebys nie "poprawial" tego inaczej)

**A) Funkcje v1.3 — waluta, ustawienia, numery ofert, jezyki, uprawnienia admina:**
- Waluta EUR/PLN (`lib/currency.ts`, `contexts/CurrencyContext.tsx`) — EUR jest jedynym zrodlem
  prawdy, PLN to wylacznie warstwa prezentacji. Zapisane oferty maja zamrozony snapshot kursu —
  pozniejsza zmiana ustawien nigdy nie dotyka starych ofert.
- Panel ustawien admina (`app/admin/ustawienia/page.tsx`, `app/api/settings/route.ts`) — kurs
  EUR/PLN, PGL bazowe, transport bazowy. Tylko admin zapisuje, inne role tylko czytaja.
- Numery ofert + nazwa zastepcza + szukanie (`lib/search.ts`, `lib/useOfferSearch.ts`,
  `components/OfferSearchInput.tsx`).
- Jezyki CS/DE obok PL/EN.
- Rozszerzone uprawnienia admina (edycja/wysylka/duplikat, zatwierdz/odrzuc), zrownane z senior.

**B) Bezpieczenstwo JWT (`lib/jwtSecret.ts`, `lib/auth.ts`, `middleware.ts`):**
- JWT_SECRET nie ma juz cichego fallbacku na `'default-secret'` — brak zmiennej srodowiskowej ma
  rzucic blad przy starcie, a nie dzialac dalej z podatnym sekretem. To zamierzone i krytyczne —
  NIE dodawaj z powrotem zadnego fallbacku "dla bezpieczenstwa startu". Upewnij sie, ze
  `JWT_SECRET` jest ustawiony w srodowisku Abacusa PRZED buildem, inaczej aplikacja nie wystartuje.

**C) Katalog klientow + kontakty (v1.4, migracje 009+010):**
- Wspolny katalog klientow dzialu: numer SAP ID, wyszukiwarki firma/NIP w panelu klienta
  kalkulatora, osobna tabela `client_contacts` (jedna firma moze miec wiele osob kontaktowych).
- Zasada "uzupelniamy luki, nie nadpisujemy": zapis oferty NIGDY nie kasuje istniejacych danych
  klienta/kontaktu wpisanych przez innego handlowca — tylko dopisuje puste pola.
- NOWY przycisk w kalkulatorze "Zapisz kontakt do firmy" — pozwala zapisac kontakt do katalogu OD
  RECI, bez zapisywania calej oferty (`POST /api/clients/contacts`, plik zmieniony, nie nowy).
- NOWY panel admina "Kontakty" (`app/admin/kontakty/page.tsx` — NOWY plik, `app/api/admin/contacts/
  route.ts` — NOWY plik, wpis w nawigacji w `components/AdminLayout.tsx`): pelny CRUD (podglad
  listy, edycja, usuwanie) nad `client_contacts`. W odroznieniu od zapisu przez handlowca, admin tu
  NADPISUJE pola wprost — to swiadome narzedzie korekty, nie kolejny "miekki" zapis.

**D) Zaokraglanie ceny koncowej w gore (decyzja biznesowa: nigdy nie zanizac ceny):**
- Nowe funkcje `ceilToUnit`/`formatMoneyCeil`/`formatOfferMoneyCeil` w `lib/currency.ts`.
  Cena koncowa pozycji, suma zestawienia i wartosc na listach ofert (`app/offers`, `app/senior`,
  `app/admin/oferty`) oraz w PDF (`app/api/generate-pdf/route.ts`) sa teraz zaokraglane do pelnej
  jednostki waluty (Math.ceil), zamiast pokazywac 2 miejsca po przecinku. Reszta kwot (rozbicie
  dopłat, sumy posrednie) zostaje bez zmian na 2 miejscach po przecinku — to dotyczy WYLACZNIE
  ceny koncowej i sum wartosci.
- Domyslna wartosc pola "Dopłata dodatkowa" (`extra`) w nowej kalkulacji zmieniona z 10 na 0 —
  to swiadoma zmiana w diffie, nie przypadkowa regresja. Potwierdz przy tescie (punkt 6).

**E) Dzisiejsze zmiany — PGL bazowe osobno per typ stali + naprawa "martwych" ustawien
(migracja 011):**
- **Bugfix:** ustawienia zapisane przez admina (PGL, kurs) nie byly widoczne w kalkulatorze do
  czasu twardego przeladowania karty przegladarki — kontekst waluty ladowal ustawienia raz przy
  starcie karty i nie odswiezal sie przy nawigacji klienta. Kalkulator wola teraz `refreshSettings()`
  przy kazdym wejsciu, wiec zmiana admina jest widoczna od razu.
- **Nowa funkcja:** PGL bazowe konfiguruje sie teraz osobno dla HRS, CR i HDG (kolumny
  `pgl_base_hrs/cr/hdg` zamiast jednej `pgl_base`) — panel ustawien admina ma trzy pola, kalkulator
  automatycznie przelacza wartosc PGL na domyslna dla wybranego typu przy zmianie typu stali.

## 3. NIE ruszaj sekretow, konfiguracji ani lockfile'a
- Nie zmieniaj `DATABASE_URL`, `JWT_SECRET`, `ABACUSAI_API_KEY`, `NEXTAUTH_SECRET` ani zadnych
  innych zmiennych srodowiskowych. Sprawdz tylko, ze `JWT_SECRET` w ogole istnieje (patrz punkt 2B).
- Nie nadpisuj i nie kasuj `.env` po stronie Abacusa (moje zrodlo go nie zawiera — celowo).
- Nie ruszaj `.abacus.donotdelete` — marker platformy, nie plik aplikacji.
- Projekt jedzie na **yarnie** (`.yarnrc.yml`) — w zrodle **nie ma** `package-lock.json` (celowo
  wyciety). Uzyj `yarn install`, nie `npm install`.
- Zignoruj `.env.example` jesli je nadpiszesz (placeholdery, nie prawdziwa konfiguracja).

## 4. Migracje bazy danych — OBOWIAZKOWE, W TEJ KOLEJNOSCI, PRZED buildem

```
psql $DATABASE_URL -f migrations/007_create_settings_table.sql
psql $DATABASE_URL -f migrations/008_offer_display_name.sql
psql $DATABASE_URL -f migrations/009_add_sap_id_and_client_lookup.sql
psql $DATABASE_URL -f migrations/010_create_client_contacts.sql
psql $DATABASE_URL -f migrations/011_split_pgl_base_by_type.sql
```

- Migracje 001-006 juz sa uruchomione na produkcji (idempotentne, ponowne puszczenie bezpieczne,
  ale niepotrzebne).
- Wszystkie piec migracji 007-011 sa **transakcyjne** (`BEGIN`/`COMMIT`) i **idempotentne**
  (`IF NOT EXISTS` / `COALESCE` przy backfillu) — bezpieczne do ponownego puszczenia, jesli
  czesciowo juz przeszly. Uruchamiaj DOKLADNIE w tej kolejnosci — kazda kolejna zaklada, ze
  poprzednia juz przeszla (np. 011 zaklada istnienie tabeli `app_settings` z 007).
- Konsekwencje pominiecia:
  - Bez **007**: panel ustawien admina nie zapisze zmian (API zwroci wartosci domyslne, apka
    sama sie nie wywali).
  - Bez **008**: aplikacja **PADNIE** — SELECT na `display_name`, ktorej nie bedzie: lista ofert,
    panel seniora i panel admina zwroca 500.
  - Bez **009** lub **010**: podpowiedzi klienta i zapis oferty zwroca 500 (kod odwoluje sie do
    `clients.sap_id` i tabeli `client_contacts`), panel "Kontakty" admina bedzie pusty/bledny.
  - Bez **011**: panel ustawien admina i kalkulator beda odwolywac sie do kolumn `pgl_base_hrs/
    cr/hdg`, ktorych nie bedzie — 500 na `/api/settings` i domyslnych ustawieniach kalkulatora.
- Weryfikacja po migracjach (wszystkie musza przejsc bez bledu):
  ```
  SELECT * FROM app_settings LIMIT 1;
  SELECT display_name FROM offers LIMIT 1;
  SELECT sap_id FROM clients LIMIT 1;
  SELECT 1 FROM client_contacts LIMIT 1;
  SELECT pgl_base_hrs, pgl_base_cr, pgl_base_hdg FROM app_settings LIMIT 1;
  ```

## 5. Zbuduj — ale NIE wdrazaj automatycznie na produkcje
- Sprawdz najpierw, ze `JWT_SECRET` istnieje w srodowisku (punkt 2B) — bez niego build/start
  aplikacji celowo padnie.
- Uruchom `yarn install`, potem wszystkie migracje z punktu 4 w kolejnosci, potem `next build`.
- Jesli build zglosi blad typow lub lintu, pokaz mi tresc bledu i **zatrzymaj sie** — nie obchodz
  bledu przez wylaczanie sprawdzania, nie "napraw" tego po swojemu. Czekaj na moja decyzje.
- Jesli build przejdzie czysto: **zastosuj zmiany w projekcie i zatrzymaj sie na tym etapie.**
  NIE klikaj/nie wywoluj samodzielnie przycisku "Redeploy" ani niczego rownowaznego, co wypycha to
  na zywy produkcyjny ruch. Ja sam przetestuje wersje w podgladzie/preview Abacusa i dopiero wtedy
  recznie kliknij Redeploy, gdy uznam, ze wszystko dziala.
- Potwierdz mi krotko: wynik builda (sukces/blad), czy wszystkich piec migracji przeszlo bez bledu
  (wraz z wynikiem zapytan weryfikacyjnych z punktu 4), oraz ze **nie** kliknales Redeploy.

## 6. Checklist do mojego recznego testu w Abacusie (PRZED klikinieciem Redeploy)
Nie musisz tego robic Ty — to ja sprawdzam w przegladarce na podgladzie, zanim wdroze na zywo:
- logowanie nadal dziala (junior/senior/admin), token sesji nie jest odrzucany,
- przelacznik EUR/PLN w kalkulatorze przelicza poprawnie, stare oferty (jesli jakies sa w bazie)
  zachowuja zamrozona cene/walute,
- panel ustawien admina: kurs EUR/PLN, TRZY pola PGL bazowego (HRS/CR/HDG) i transport zapisuja
  sie, zmiana jest widoczna w kalkulatorze OD RAZU, bez przeladowania strony,
- kalkulator: zmiana typu stali (HRS/CR/HDG) automatycznie przelacza PGL bazowe na wartosc
  skonfigurowana dla tego typu,
- cena koncowa pozycji i suma zestawienia w kalkulatorze pokazuja liczbe calkowita (zaokraglona
  w gore), reszta kwot (dopłaty, sumy posrednie) nadal na 2 miejscach po przecinku,
- domyslna "Dopłata dodatkowa" w nowej kalkulacji to 0 (bylo 10) — potwierdz, ze to zamierzone,
- panel klienta w kalkulatorze: wyszukiwarki firma/NIP podpowiadaja z katalogu, wybor uzupelnia
  SAP ID i dane kontaktowe; przycisk "Zapisz kontakt do firmy" dziala samodzielnie, bez zapisu
  oferty,
- nowy panel `/admin/kontakty`: lista kontaktow z nazwa firmy, edycja i usuwanie dzialaja,
- numery ofert + wyszukiwanie po ID/nazwie/fragmencie dziala na `/offers`, `/senior`,
  `/admin/oferty`,
- jezyki CS/DE dostepne obok PL/EN, etykiety sie nie gubia,
- panel admina: zatwierdzanie/odrzucanie/edycja ofert (senior i admin) dziala jak wczesniej,
- "Eksportuj do PDF" i eksport do Excela nadal dzialaja, PDF pokazuje zaokraglone ceny koncowe.
