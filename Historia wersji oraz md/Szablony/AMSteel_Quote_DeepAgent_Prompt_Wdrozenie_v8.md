# Prompt dla DeepAgent (AbacusAI) — wdrozenie v8 (v1.6 → v1.7)
# Skok maly: DWIE migracje (019, 020), reszta to podmiana plikow. Glowne nowosci:
# zespoly seniora + zakres panelu "Analiza" dla seniora (own + zespol), transport liczony
# z realnej trasy drogowej wg cennika przewoznika, metryki skutecznosci w panelu "Handlowcy",
# ochrona przed utrata niezapisanych zmian + przycisk "Nowa oferta", dopracowana paleta
# wysokiego kontrastu, doplata za Lezke zalezna od szerokosci + tabela gatunkow TEARDROP.

Skopiuj ponizszy tekst do DeepAgent i dolacz zalaczony zip **`AMSteel_Quote_v1.7_deploy.zip`**
(spakowany z galezi `feat/analytics-panel`, commit `de6fca0`, dokladnie to, co jest na GitHubie:
https://github.com/Kotsur69/SteelQuote/tree/feat/analytics-panel). Zip zawiera caly folder
`nextjs_space` BEZ `node_modules`, `.next`, `.env`, `.env.local` i `package-lock.json` (projekt
jedzie na yarnie, npm-owy lock miesza w instalacji).

**Stan wyjsciowy:** na produkcji (https://steelpricinghub.abacusai.app) jest **v1.6** —
panel "Analiza" i migracja `018` (`offers.client_decision`, os won/lost) sa juz wdrozone,
migracje `001`-`018` puszczone (`001`-`017` od deployu v1.5 z 17.08.2026, `018` przy deployu
panelu Analiza). Ten deploy dokłada **dwie** migracje (`019`, potem `020`) i podmienia pliki.
**Zrob kopie bazy przed migracjami** (`pg_dump $DATABASE_URL > backup_przed_v1.7_<data>.sql`
albo rownowazna opcja Abacusa) — mimo ze obie migracje sa wylacznie dodajace.

---

Cel: chce wdrozyc do dzialajacej aplikacji (https://steelpricinghub.abacusai.app) nowa wersje
CALEGO projektu, ktora dostarczam w zalaczonym zipie. To NIE nowa aplikacja, tylko kolejna wersja
istniejacego projektu Next.js 14 (App Router, zwykly `pg`, JWT przez `jose`, `bcryptjs`). Zasada
nadrzedna: **honoruj dokladnie moje pliki**. Nie przepisuj logiki, nie zmieniaj stylu, nie
"poprawiaj" kodu, nie dopisuj niczego od siebie. Podmien tresc plikow jeden do jednego na te, ktore
dostarczam.

## 1. Jak podmienic pliki

Zalaczony zip to caly `nextjs_space` (bez `node_modules`, `.next`, `.env`, `.env.local`,
`package-lock.json` — celowo wyciete, patrz punkt 3). Traktuj go jako **zrodlo plikow do
nadpisania** istniejacego projektu, NIGDY jako zamiennik calego katalogu na serwerze — nadpisz
kazdy plik, ktory jest w zrodle, jego zawartoscia, ale NIE kasuj z serwera plikow, ktorych tam nie
ma (np. `.env`, `.abacus.donotdelete`), bo ich tam celowo brakuje.

Jesli jakas sciezka po twojej stronie rozni sie od mojej, zachowaj MOJA wersje pliku i tylko
dopasuj lokalizacje do istniejacej struktury projektu.

### Nowe pliki w tej wersji (nie istnialy w v1.6 — maja powstac)
- `migrations/019_create_team_members.sql`
- `migrations/020_transport_tariff.sql`
- `lib/teams.ts` — czlonkostwo zespolu senior↔junior (tabela `team_members`)
- `app/api/teams/route.ts` — CRUD zespolu seniora (dodaj/usun juniora, lista przypisywalnych)
- `components/TeamEditor.tsx` — edytor zespolu (w panelu ustawien)
- `lib/transportRouting.ts` — wyznaczanie odleglosci drogowej (Geoapify → fallback Nominatim + OSRM), cache w `route_cache`
- `lib/transportTariff.ts` — wybor pasma cennika, model kosztu (ciezarowki, doplaty), przeliczenie PLN→EUR
- `components/TransportPanel.tsx` — sekcja "Trasa i transport" w kalkulatorze
- `app/api/transport/route.ts` — jedyny endpoint liczacy transport z trasy
- `app/api/settings/tariff/route.ts` — odczyt/zapis pasm cennika transportowego (tylko admin)
- `lib/unsavedGuard.tsx` — kontekst + hook ochrony przed utrata niezapisanych zmian

### Pliki zmienione (podmien 1:1)
`middleware.ts` (bez zmian w tej wersji — zostaje jak w v1.6), `app/providers.tsx`,
`components/Navigation.tsx`, `components/AdminLayout.tsx`, `components/Calculator.tsx`,
`components/ClientCombobox.tsx`, `components/ContactCombobox.tsx`,
`components/analytics/FilterBar.tsx`, `app/offers/page.tsx`, `app/senior/page.tsx`,
`app/analytics/page.tsx`, `app/admin/handlowcy/page.tsx`, `app/admin/ustawienia/page.tsx`,
`app/api/admin/users/route.ts`, `app/api/analytics/route.ts`,
`app/api/offers/[id]/decision/route.ts`, `app/api/offers/[id]/send/route.ts`,
`app/api/settings/route.ts`, `app/globals.css`, `lib/analytics.ts`, `lib/analyticsQuery.ts`,
`lib/analyticsExport.ts`, `lib/calculatorData.ts`, `lib/currency.ts`, `lib/excelExport.ts`,
`lib/pglHistoryExport.ts`, `lib/themeVars.ts`, `lib/translations.ts`, `.env.example`.

## 2. Co konkretnie zmienia ta wersja (kontekst, zebys nie "poprawial" tego inaczej)

**A) Zespoly seniora + zakres panelu "Analiza" dla seniora (migracja 019):**
- Nowa tabela `team_members` (`senior_id`, `junior_id`, PK zlozony). Relacja many-to-many:
  ten sam junior moze byc w zespole kilku seniorow, kazdy z nich liczy jego oferty u siebie raz.
  Role sprawdzane sa w API, NIE `CHECK`-constraintem — zmiana roli konta nie ma wywalac starego
  wiersza czlonkostwa. Stary wiersz jest nieszkodliwy.
- W panelu "Analiza" (`app/analytics`): **junior** widzi wylacznie swoje oferty, **senior** widzi
  swoje + kazdego czlonka zespolu (`lib/analyticsQuery.ts` woła `teamMemberIds(userId)` tylko dla
  roli senior), **admin** widzi cala firme (nigdy nie czyta `team_members`, wiec nic sie nie dublu-
  je). Filtr `?users=` moze zawezic zakres seniora, ale nigdy poza zespol — pilnuje tego serwer.
- Edytor zespolu jest w panelu ustawien (`components/TeamEditor.tsx`, `app/api/teams/route.ts`).
- **Konsekwencje pominiecia `019`:**
  - `GET /api/analytics` i strona `/analytics` **zwroca 500 dla KAZDEGO seniora** (`42P01`,
    `relation "team_members" does not exist` — `teamMemberIds()` nie ma fallbacku). Junior i admin
    dzialaja.
  - `GET/POST/DELETE /api/teams` → 500; edytor zespolu w ustawieniach nie dziala.
- `019` jest **wylacznie dodajaca**: `CREATE TABLE IF NOT EXISTS team_members` + 2
  `CREATE INDEX IF NOT EXISTS`. Bez `BEGIN/COMMIT` (same DDL), idempotentna, bezpieczna do
  ponownego puszczenia. Nie rusza zadnych istniejacych danych.

**B) Poprawka zapisu decyzji klienta (won/lost):**
- W v1.6 (juz na produkcji) `POST /api/offers/[id]/decision` w pewnych przypadkach **nie utrwalal**
  decyzji — funkcja "wygrana/przegrana" wygladala, jakby dzialala, ale nic nie zapisywala. Ta
  wersja to naprawia (`app/api/offers/[id]/decision/route.ts`). Zachowanie docelowe bez zmian:
  decyzje mozna zapisac tylko na ofercie `sent`, `decision = 'pending'` czysci ja w calosci,
  wlasciciel zapisuje na swojej, senior i admin na dowolnej.
- UI na liscie `/offers`: gdy decyzja jest juz zapisana (`won`/`lost`), przyciski "oznacz jako
  wygrana/przegrana" **znikaja** — zostaje tylko "↺ cofnij decyzje". Zmiana decyzji wymaga
  najpierw cofniecia. Sam endpoint bez zmian (nadal przyjmuje kazda z trzech wartosci).

**C) Transport liczony z realnej trasy drogowej (migracja 020):**
- Do tej pory transport byl JEDNA liczba (`app_settings.transport_base`, €/t) wpisywana recznie.
  Od tej wersji liczy sie go z realnej odleglosci drogowej z adresu nadania (domyslnie Krakow) do
  adresu klienta, wg cennika przewoznika.
- Migracja `020` (transakcyjna, `BEGIN/COMMIT`, wszystko `IF NOT EXISTS`, idempotentna):
  - `app_settings` + 3 kolumny: `transport_truck_capacity_t` (NUMERIC, DEFAULT 21),
    `transport_origin_address` (TEXT, DEFAULT `'Kraków, Polska'`),
    `transport_oversize_long_pln` (NUMERIC, DEFAULT 250) + 2 `CHECK`-i (drop-then-add).
  - Nowa tabela `transport_tariff_bands` (pasma odleglosci: ALBO ryczalt `flat_price_pln`, ALBO
    stawka `price_per_km_pln`, nigdy oba — `CHECK`; `distance_to_km IS NULL` = ostatnie pasmo),
    unikatowy indeks po `distance_from_km`, + seed 4 pasm (wysylka z Krakowa, stan 2026-09-10)
    wstawiany tylko gdy tabela jest pusta.
  - Nowa tabela `route_cache` (znormalizowany adres → km + wspolrzedne + provider), unikatowy
    indeks po parze `(origin_key, dest_key)`.
- Model kosztu (`lib/transportTariff.ts`): km z API → cena za JEDNA ciezarowke z pasma cennika →
  liczba ciezarowek = `ceil(tony_calej_oferty / transport_truck_capacity_t)` (nawet 1 tona = cala
  ciezarowka) → koszt = ciezarowki × cena + doplaty ponadgabarytowe → `/ tony_oferty` → zl/t →
  €/t po kursie z `app_settings`. Stawki trzymane w PLN (tak kwotuje przewoznik), przeliczenie na
  EUR i **zamrozenie w `offer_data` razem z kursem** — dokladnie jak PGL bazowe. Nie "naprawiaj"
  tego przez trzymanie stawek w EUR.
- Wyznaczanie trasy (`lib/transportRouting.ts`): najpierw Geoapify (jesli jest klucz — patrz
  punkt 3), w razie braku/bledu fallback na publiczne Nominatim + OSRM. Kazdy wynik ladowany do
  `route_cache`, zeby ta sama trasa liczyla sie raz.
- **Kod jest odporny na brak migracji `020`** — `app/api/settings/route.ts`, `app/api/transport/`
  i odczyt cennika lapia `42703`/`42P01` i **spadaja na cennik domyslny + reczne wpisanie km**,
  bez 500. Czyli `020` NIE wywala aplikacji, ale **transport nie bedzie sie liczyl z realnej
  trasy dopoki jej nie puscisz**. Konsekwencja pominiecia: sekcja "Trasa i transport" dziala na
  wbudowanym cenniku i wymaga recznych kilometrow; parametry transportu w ustawieniach wracaja do
  wartosci domyslnych.

**D) Panel "Handlowcy" (panel admina) — metryki skutecznosci
(`app/admin/handlowcy/page.tsx`, `app/api/admin/users/route.ts`):**
- Dwie nowe kolumny na liscie: **skutecznosc %** (z ofert wygranych/przegranych; oferty bez
  decyzji nie wplywaja na wynik) oraz **laczny tonaz ofertowany**.
- Pod kazdym wierszem rozwijana sekcja "Wyniki": data zalozenia konta, data pierwszej i ostatniej
  oferty, liczba ofert wygranych/przegranych/bez decyzji, tonaz wygrany/przegrany/bez decyzji,
  srednia marza wazona tonazem.
- Wszystkie liczby z **najnowszej wersji kazdej oferty** (edycje/wersjonowanie z migracji 015 nie
  licza sie podwojnie). Dotychczasowa kolumna "Liczba ofert" bez zmian.

**E) Ochrona przed utrata niezapisanych zmian + przycisk "Nowa oferta"
(`lib/unsavedGuard.tsx`, `app/providers.tsx`, `components/Navigation.tsx`,
`components/Calculator.tsx`, `app/offers/page.tsx`):**
- Przy rozpoczeciu nowej oferty, otwarciu innej oferty, przejsciu na inna zakladke oraz
  zamknieciu/odswiezeniu karty przegladarki pojawia sie ostrzezenie z wyborem
  "Zapisz i kontynuuj" / "Odrzuc zmiany" / "Anuluj". Okno jest tlumaczone (PL/EN/CS/DE).
- Nowy zielony przycisk "Nowa oferta" po prawej stronie paska nawigacji — czysci kalkulator, dane
  klienta i zestawienie. Klik w zakladke "Kalkulator" robi teraz to samo.
- Zawiera juz poprawke fantomowego ostrzezenia, ktore pokazywalo sie tuz po "Nowa oferta".

**F) Dopracowana paleta wysokiego kontrastu (`lib/themeVars.ts`, `app/globals.css`):**
- Czysto wizualne dostrojenie trybu wysokiego kontrastu w jasnym i ciemnym motywie (kolory,
  obramowania, stany `hover:`). Bez zmiany logiki przelaczania motywu.

**G) Doplata za Lezke zalezna od szerokosci + tabela gatunkow TEARDROP
(`lib/calculatorData.ts`, `components/Calculator.tsx`):**
- Doplata przetworcza za blache lzawa (TEARDROP) zalezy teraz od szerokosci arkusza (pasma
  szerokosci), a nie jest stala. Uzupelniona tabela gatunkow TEARDROP. Reszta logiki cen bez zmian.

**H) Auto-dopasowanie szerokosci kolumn we wszystkich eksportach Excela
(`lib/excelExport.ts`, `lib/analyticsExport.ts`, `lib/pglHistoryExport.ts`):**
- Kolumny w plikach `.xlsx` (zestawienie, eksport panelu Analiza, historia PGL) dostaja szerokosc
  dopasowana do zawartosci. Czysto kosmetyczne.

**I) Wysylka oferty wymaga danych firmy klienta (`app/api/offers/[id]/send/route.ts`):**
- Oferte mozna zapisac bez danych klienta, ale `POST /api/offers/[id]/send` odrzuca teraz wysylke
  (`422`), jesli w `offer_data.clientInfo` brakuje nazwy firmy lub NIP — ten sam helper, ktorego
  uzywa formularz kalkulatora i zapis kontaktow. Brak wiersza oferty przechodzi dalej i obsluguje
  go istniejacy `409`.

## 3. NIE ruszaj sekretow, konfiguracji ani lockfile'a
- Nie zmieniaj `DATABASE_URL`, `JWT_SECRET`, `ABACUSAI_API_KEY`, `NEXTAUTH_SECRET` ani zadnych
  innych zmiennych srodowiskowych. Sprawdz tylko, ze `JWT_SECRET` w ogole istnieje — brak tej
  zmiennej celowo wywala start aplikacji (bez cichego fallbacku), zachowanie z v1.3, nie regres.
- **Nowa, OPCJONALNA zmienna: `GEOAPIFY_API_KEY`.** Sluzy do dokladniejszego liczenia trasy TIR-a
  w `/api/transport`. Jesli jej nie ustawie — aplikacja liczy odleglosci na darmowych serwerach
  OpenStreetMap (Nominatim + OSRM), bez klucza. **Nie wymysl jej i nie wpisuj wartosci.** Jesli
  chcesz, zostaw w srodowisku pusta/niezdefiniowana — kod to obsluguje.
- Nie nadpisuj i nie kasuj `.env` po stronie Abacusa (moje zrodlo go nie zawiera — celowo).
- Nie ruszaj `.abacus.donotdelete` — marker platformy, nie plik aplikacji.
- Projekt jedzie na **yarnie** (`.yarnrc.yml`) — w zrodle **nie ma** `package-lock.json` (celowo
  wyciety). Uzyj `yarn install`, nie `npm install`.
- Zignoruj `.env.example` jesli je nadpiszesz (placeholdery, nie prawdziwa konfiguracja).
- **Brak nowych zaleznosci.** `package.json` w zipie jest identyczny z produkcyjnym (v1.6). Jesli
  `yarn install` chce cokolwiek dociagnac/zmienic w lockfile — pokaz mi to i zatrzymaj sie.

## 4. Migracje bazy danych — OBOWIAZKOWE, PRZED buildem, w tej kolejnosci

```
psql $DATABASE_URL -f migrations/019_create_team_members.sql
psql $DATABASE_URL -f migrations/020_transport_tariff.sql
```

- Migracje `001`-`018` sa juz na produkcji (v1.5 + deploy panelu Analiza). Nie puszczaj ich
  ponownie.
- `019` i `020` nie zaleza od siebie nawzajem — kolejnosc jest po prostu numeryczna. Obie sa
  **wylacznie dodajace** (nowe tabele + nowe kolumny + seed pasm cennika tylko gdy tabela pusta),
  idempotentne, nie modyfikuja ani nie kasuja istniejacych danych.
- `020` konczy sie `COMMIT`-em; jesli cokolwiek w niej padnie, jest `-- ROLLBACK;` w komentarzu
  na koncu pliku. Ma tez dwa `\echo` z kontrolnym SELECT-em przed `COMMIT` — to normalne.
- Konsekwencje pominiecia — patrz punkt 2A (`019`: `/analytics` i `/api/teams` 500 dla seniora)
  i 2C (`020`: transport na cenniku domyslnym + reczne km, bez 500).
- Weryfikacja po migracjach (musi przejsc bez bledu):
  ```sql
  -- 019
  SELECT senior_id, junior_id FROM team_members LIMIT 1;
  \d team_members
  -- oczekiwane indeksy: idx_team_members_senior, idx_team_members_junior

  -- 020
  SELECT transport_truck_capacity_t, transport_origin_address, transport_oversize_long_pln
  FROM app_settings WHERE id = 1;
  SELECT distance_from_km, distance_to_km, flat_price_pln, price_per_km_pln
  FROM transport_tariff_bands ORDER BY distance_from_km;   -- oczekiwane 4 pasma
  \d route_cache
  -- oczekiwany unikatowy indeks: idx_route_cache_pair
  ```

## 5. Zbuduj — ale NIE wdrazaj automatycznie na produkcje
- Sprawdz najpierw, ze `JWT_SECRET` istnieje w srodowisku — bez niego build/start celowo padnie.
- Uruchom `yarn install`, potem migracje `019` i `020` (punkt 4, w tej kolejnosci), potem
  `next build`.
- Jesli build zglosi blad typow lub lintu, pokaz mi tresc bledu i **zatrzymaj sie** — nie obchodz
  bledu przez wylaczanie sprawdzania, nie "napraw" tego po swojemu. Czekaj na moja decyzje.
- Jesli build przejdzie czysto: **zastosuj zmiany w projekcie i zatrzymaj sie na tym etapie.**
  NIE klikaj/nie wywoluj samodzielnie "Redeploy" ani niczego rownowaznego, co wypycha to na zywy
  produkcyjny ruch. Ja sam przetestuje wersje w podgladzie/preview Abacusa i dopiero wtedy recznie
  kliknij Redeploy, gdy uznam, ze wszystko dziala.
- Potwierdz mi krotko: wynik builda (sukces/blad), czy migracje `019` i `020` przeszly bez bledu
  (wraz z wynikiem zapytan weryfikacyjnych z punktu 4), czy `yarn install` nie ruszyl lockfile'a,
  oraz ze **nie** kliknales Redeploy.

## 6. Checklist do mojego recznego testu w Abacusie (PRZED klikinieciem Redeploy)
Nie musisz tego robic Ty — to ja sprawdzam w przegladarce na podgladzie, zanim wdroze na zywo:
- logowanie nadal dziala (junior/senior/admin), token sesji nie jest odrzucany,
- **panel "Analiza" dla seniora laduje sie bez 500** — potwierdza, ze migracja `019` weszla;
  senior widzi swoje oferty + oferty czlonkow zespolu, junior tylko swoje, admin cala firme,
- edytor zespolu (dodaj/usun juniora) w panelu ustawien dziala,
- na ofercie **wyslanej** da sie zapisac decyzje klienta (won/lost) i po odswiezeniu strony
  decyzja **nadal tam jest** (regres z v1.6 naprawiony); cofniecie do "pending" czysci ja,
- po zapisaniu decyzji przyciski "klient zaakceptowal / odrzucil" **znikaja** — zostaje tylko
  "↺ cofnij decyzje"; zmiana decyzji = najpierw cofnij, potem wybierz ponownie,
- panel "Handlowcy": kolumny skutecznosc % i laczny tonaz ofertowany maja sensowne liczby,
  rozwijana sekcja "Wyniki" pokazuje pelne rozbicie; oferta z wieloma wersjami liczy sie raz,
- sekcja "Trasa i transport" w kalkulatorze: po wpisaniu adresu klienta (albo pobraniu z
  kartoteki) liczy km i koszt; przekroczenie ladownosci daje wiecej niz jedna ciezarowke;
  element 13,6-15,1 m dodaje doplate; tryb reczny (wpisanie km) dziala; przy niedostepnym serwisie
  map jest czytelny fallback, a nie blad,
- cennik transportowy w panelu ustawien admina da sie edytowac (pasma) i zmiana jest widoczna w
  kalkulatorze,
- koszt transportu w zapisanej ofercie jest zamrozony (jak PGL) — pozniejsza zmiana cennika/kursu
  nie zmienia juz wystawionej oferty,
- ochrona niezapisanych zmian: przy "Nowa oferta" / otwarciu innej oferty / zmianie zakladki /
  zamknieciu karty pojawia sie ostrzezenie (PL/EN/CS/DE); po zapisaniu oferty ostrzezenie znika
  (brak fantomowego promptu),
- zielony przycisk "Nowa oferta" czysci kalkulator, dane klienta i zestawienie; klik w zakladke
  "Kalkulator" robi to samo,
- kalkulator: dla blachy lzawej (TEARDROP) doplata przetworcza zmienia sie z szerokoscia arkusza;
  lista gatunkow TEARDROP jest kompletna,
- tryb "Wysoki kontrast" (🔲) dziala i w jasnym, i w ciemnym motywie, na wszystkich stronach,
- eksporty do Excela (zestawienie, panel Analiza, historia PGL) maja dopasowane szerokosci kolumn,
- **nie da sie wyslac oferty bez nazwy firmy i NIP klienta** (blad `422`), ale zapis szkicu bez
  tych danych nadal dziala,
- pozostale funkcje v1.6 (panel Analiza: KPI, wykresy, zakres dat i podstawa daty, eksport;
  os won/lost; pelna tabela gatunkow PICKLED; PDF w jezyku handlowca; baner "edytujesz oferte X";
  PGL bazowe w EUR; wersjonowanie ofert; waluta EUR/PLN; numery ofert + szukanie; katalog klientow
  + kontakty; minimalna marza + bezposrednia wysylka juniora) dzialaja jak przed deployem.

## 7. Nie-blokujace, swiadome decyzje (nie zglaszaj jako bledow)
- `MIN_PASSWORD_LENGTH = 4` (`lib/passwordPolicy.ts`) jest **celowa** decyzja biznesowa (dzial
  handlowy uzywa krotkich hasel) — NIE podnosic do 6 bez mojej wyraznej prosby.
- `GEOAPIFY_API_KEY` niedodane — swiadome; fallback na Nominatim + OSRM jest zamierzony.
- Import Excela (KTS/GPAO → kalkulator) nadal nie istnieje w kodzie — swiadomie odlozony,
  nie brakujacy plik.
- Wysylka oferty do klienta to na razie tylko zmiana statusu na "wyslana" — realna wysylka
  e-mailem/PDF do klienta swiadomie odlozona.
- Uspiony Prisma/NextAuth oraz zdublowane pliki danych kalkulatora (`calc-data.ts` /
  `calculatorData.ts`) — do uporzadkowania, swiadomie odlozone. Aktywny auth to JWT/`pg`.
- Panel Analiza i sekcja transportu nie maja jeszcze wlasnych testow automatycznych — projekt nie
  ma harnessu, swiadomie odlozone.
- `middleware.ts` w zipie jest identyczny jak w v1.6 (`/analytics` juz tam jest) — brak zmian
  w tej wersji, to nie przeoczenie.
