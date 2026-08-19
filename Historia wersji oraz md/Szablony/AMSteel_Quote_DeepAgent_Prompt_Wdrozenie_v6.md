# Prompt dla DeepAgent (AbacusAI) — wdrozenie v6 (skok z v1.2 na v1.5: WSZYSTKO od 2026-07-14:
# waluta+ustawienia, numery ofert, CS/DE, JWT hardening, katalog klientow+kontakty, panel Kontakty
# admina, zaokraglanie cen w gore, PGL bazowe per typ stali, historia cen PGL, tryb wysoki kontrast,
# minimalna marza + bezposrednia wysylka juniora, wersjonowanie ofert, klik-edycja, 3 nowe typy stali
# PICKLED/TEARDROP/ZM)

Skopiuj ponizszy tekst do DeepAgent i dolacz zalaczony zip **`AMSteel_Quote_v1.5_deploy.zip`**
(spakowany z commita `ec8b3be` na `main`, dokladnie to, co jest na GitHubie:
https://github.com/Kotsur69/SteelQuote). Zip zawiera caly folder `nextjs_space` BEZ `node_modules`,
`.next`, `.env`, `.env.local` i `package-lock.json` (projekt jedzie na yarnie, npm-owy lock miesza
w instalacji).

**WAZNE zanim wyslesz:** ostatni potwierdzony deploy na produkcje to **v1.2 z 2026-07-14** — kod na
https://steelpricinghub.abacusai.app NIE MA jeszcze kompletnie NICZEGO z tego, co opisano nizej.
To jest najwiekszy jednorazowy skok tego projektu: **11 migracji (007-017)** i pol miesiaca zmian
(sesje 2026-07-14 → 2026-08-12) naraz, z ktorych ZADNA jeszcze nigdy nie chodzila na zywym ruchu.
**Zrob kopie bazy przed migracjami** (`pg_dump $DATABASE_URL > backup_przed_v1.5_<data>.sql` albo
rownowazna opcja Abacusa) — to obowiazkowe przy tym deployu, nie opcjonalne.

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

## 2. Co konkretnie zmienia ta wersja (kontekst, zebys nie "poprawial" tego inaczej)

**A) v1.3 — waluta, ustawienia, numery ofert, jezyki, uprawnienia admina:**
- Waluta EUR/PLN (`lib/currency.ts`, `contexts/CurrencyContext.tsx`) — EUR jest jedynym zrodlem
  prawdy, PLN to wylacznie warstwa prezentacji. Zapisane oferty maja zamrozony snapshot kursu —
  pozniejsza zmiana ustawien nigdy nie dotyka starych ofert.
- Panel ustawien admina (`app/admin/ustawienia/page.tsx`, `app/api/settings/route.ts`).
- Numery ofert + nazwa zastepcza + szukanie (`lib/search.ts`, `lib/useOfferSearch.ts`,
  `components/OfferSearchInput.tsx`).
- Jezyki CS/DE obok PL/EN.
- Rozszerzone uprawnienia admina (edycja/wysylka/duplikat, zatwierdz/odrzuc), zrownane z senior.

**B) Bezpieczenstwo JWT (`lib/jwtSecret.ts`, `lib/auth.ts`, `middleware.ts`):**
- `JWT_SECRET` nie ma juz cichego fallbacku na `'default-secret'` — brak zmiennej srodowiskowej ma
  rzucic blad przy starcie, a nie dzialac dalej z podatnym sekretem. To zamierzone i krytyczne —
  NIE dodawaj z powrotem zadnego fallbacku "dla bezpieczenstwa startu". Upewnij sie, ze
  `JWT_SECRET` jest ustawiony w srodowisku Abacusa PRZED buildem, inaczej aplikacja nie wystartuje.

**C) v1.4 — katalog klientow + kontakty (migracje 009+010):**
- Wspolny katalog klientow dzialu: SAP ID, wyszukiwarki firma/NIP w panelu klienta kalkulatora,
  osobna tabela `client_contacts` (jedna firma moze miec wiele osob kontaktowych).
- Zasada "uzupelniamy luki, nie nadpisujemy": zapis oferty NIGDY nie kasuje istniejacych danych
  klienta/kontaktu wpisanych przez innego handlowca — tylko dopisuje puste pola.
- Klient i oferta zapisuja sie w JEDNEJ transakcji (BEGIN/COMMIT) — upsert klienta PRZED update
  oferty, rollback gdy update oferty nic nie zwroci.

**D) Zaokraglanie ceny koncowej w gore:**
- `ceilToUnit`/`formatMoneyCeil`/`formatOfferMoneyCeil` w `lib/currency.ts`. Cena koncowa pozycji,
  suma zestawienia i wartosc na listach ofert oraz w PDF sa zaokraglane w gore (Math.ceil) do pelnej
  jednostki waluty — nigdy nie zanizamy ceny. Reszta kwot (rozbicie dopłat, sumy posrednie) zostaje
  na 2 miejscach po przecinku.

**E) PGL bazowe osobno per typ stali + naprawa "martwych" ustawien (migracja 011):**
- Bugfix: kontekst waluty odswieza ustawienia przy kazdym wejsciu do kalkulatora (`refreshSettings()`)
  — zmiana admina jest widoczna od razu, bez twardego przeladowania karty.
- PGL bazowe konfiguruje sie osobno dla HRS, CR, HDG (kolumny `pgl_base_hrs/cr/hdg`).

**F) v1.5 — sync kontaktow + tryb wysoki kontrast (migracja 012):**
- `syncPrimaryContact()` — edycja klienta w panelu „Klienci" synchronizuje kontakt glowny z
  `client_contacts` w tej samej transakcji (wczesniej osoba zapisana tam nie trafiala do zakladki
  „Kontakty").
- Tryb „Wysoki kontrast" (🔲, obok Jasny/Ciemny na wszystkich 4 stronach) — JEDEN staly motyw
  (czarny tekst/obramowania na bialym) + powiekszenie tekstu (`zoom: 1.18`) dla starszych
  laptopow/ekranow 800x600. `localStorage` klucz `ssc-high-contrast`.

**G) v1.5 — historia cen PGL, kolory HRS/CR/HDG, klikalne UI (migracja 013):**
- Nowa tabela `pgl_price_history` — kazda zmiana PGL bazowego (per typ) loguje kto/kiedy/z jakiej
  na jaka wartosc. Widoczna tylko dla admina (`GET /api/settings/pgl-history`), eksport do Excela.
  Zapis ustawien jest transakcyjny (`SELECT ... FOR UPDATE` na `app_settings`), zeby rownolegly
  zapis nie wpisal do historii juz nieaktualnej "starej" wartosci.
- Kolory HRS (pomaranczowy) / CR (niebieski) / HDG (zielony) spojne w calym panelu ustawien.
- Pulpit admina: 7 kafelkow statusow ofert klikalnych → `/admin/oferty?status=...` z filtrem.
- Wiersz w tabeli zestawienia kalkulatora klikalny = edycja pozycji (jak przycisk ✏️).

**H) v1.5 — kolumna „Uwagi" w PDF:**
- `lib/itemNotes.ts` odtwarza z zapisanych `inputs` pozycji pelna liste „Etykieta: wartosc" dla
  wszystkich dopłat huty i SSC — kolumna „Uwagi" w PDF (byla od dawna, zawsze pusta) faktycznie
  sie teraz wypelnia. Stare oferty sprzed `inputs` → pusta kolumna jak dotychczas.

**I) v1.5 — minimalna marza + bezposrednia wysylka juniora (migracja 014):**
- `app_settings.min_margin_pct` (domyslnie 7%). `lib/offerReview.ts`: KAZDA pozycja musi miec
  marze >= progu ORAZ PGL >= bazy dla typu, inaczej cala oferta wymaga zatwierdzenia. **Serwer jest
  granica zaufania** — `api/offers/[id]/send` i `api/offers/[id]` PUT licza to samo niezaleznie od
  tego, co przyszlo z klienta. Junior moze wyslac oferte SAM (bez zatwierdzenia seniora/admina),
  jesli marza i PGL kazdej pozycji spelniaja prog. Pozycje bez zapisanej marzy (stare oferty) →
  traktowane jako wymagajace zatwierdzenia (bezpieczny wariant domyslny).

**J) v1.5 — wersjonowanie edytowanych ofert (migracja 015):**
- `offers.root_offer_id` + `offers.version_number`. Edycja juz zapisanej oferty **tworzy nowa
  wersje** (nowy wiersz), zamiast nadpisywac — poprzedni stan zostaje widoczny w historii
  (`offer_30`, `offer_30.1`, `offer_30.2`...). Bez realnej zmiany (porownanie `deepEqual` na
  JSONB pod `SELECT ... FOR UPDATE`) → zwykly UPDATE, bez nowej wersji. Oferta `sent` zostaje
  read-only dla wszystkich, laczne z adminem.
- Klik w cala oferte (karta/wiersz) na „Moje oferty"/„Panel seniora"/„Admin → Oferty" = edycja
  (gdy uzytkownik ma uprawnienie), jak klikalny wiersz zestawienia w kalkulatorze.

**K) v1.5 — trzy nowe typy stali: PICKLED, TEARDROP, ZM (migracje 016+017):**
- **PICKLED** (HRS Trawiona) — jak HRS, bez toggle'ow protection/packaging/surface/weld, wlasna
  tabela gatunkow **NIEKOMPLETNA** (35 pozycji C15E→SAPH440, reszta dojdzie pozniej — nie blokuje
  tego deployu), wlasna dopłata za trawienie (zalezna wylacznie od grubosci).
- **TEARDROP** (Blacha łezkowa) — jak HRS, bez selektora gatunku (dopłata gatunkowa = 0), matryca
  dopłat wymiarowych aliasowana wprost do HRS. Stala dopłata "Dopłata Łezka" = 30.
- **ZM** (Magnelis, powłoka ZnAlMg) — jak HDG (4 grupy dopłat, nie 5 — bez osobnego
  "wykonania/finish"), wlasna 9-klasowa matryca powłoki ZM70…ZM430, niedostepna ponizej 800mm
  szerokosci (to dane klienta, nie luka).
- Zakladki typu w siatce 3×2. Kolory odznak typu na listach ofert i w PDF jawnie mapowane per typ
  (wczesniej wszystko poza HRS/CR domyslnie dostawalo kolor HDG — poprawione przy okazji).

## 3. NIE ruszaj sekretow, konfiguracji ani lockfile'a
- Nie zmieniaj `DATABASE_URL`, `JWT_SECRET`, `ABACUSAI_API_KEY`, `NEXTAUTH_SECRET` ani zadnych
  innych zmiennych srodowiskowych. Sprawdz tylko, ze `JWT_SECRET` w ogole istnieje (patrz punkt 2B).
- Nie nadpisuj i nie kasuj `.env` po stronie Abacusa (moje zrodlo go nie zawiera — celowo).
- Nie ruszaj `.abacus.donotdelete` — marker platformy, nie plik aplikacji.
- Projekt jedzie na **yarnie** (`.yarnrc.yml`) — w zrodle **nie ma** `package-lock.json` (celowo
  wyciety). Uzyj `yarn install`, nie `npm install`.
- Zignoruj `.env.example` jesli je nadpiszesz (placeholdery, nie prawdziwa konfiguracja).

## 4. Migracje bazy danych — OBOWIAZKOWE, W TEJ DOKLADNEJ KOLEJNOSCI, PRZED buildem

```
psql $DATABASE_URL -f migrations/007_create_settings_table.sql
psql $DATABASE_URL -f migrations/008_offer_display_name.sql
psql $DATABASE_URL -f migrations/009_add_sap_id_and_client_lookup.sql
psql $DATABASE_URL -f migrations/010_create_client_contacts.sql
psql $DATABASE_URL -f migrations/011_split_pgl_base_by_type.sql
psql $DATABASE_URL -f migrations/012_resync_client_contacts.sql
psql $DATABASE_URL -f migrations/013_create_pgl_price_history.sql
psql $DATABASE_URL -f migrations/014_add_min_margin_pct.sql
psql $DATABASE_URL -f migrations/015_offer_versions.sql
psql $DATABASE_URL -f migrations/016_add_pgl_base_new_types.sql
psql $DATABASE_URL -f migrations/017_widen_pgl_price_history_steel_type.sql
```

- Migracje 001-006 juz sa uruchomione na produkcji (idempotentne, ponowne puszczenie bezpieczne,
  ale niepotrzebne).
- Wszystkie migracje 007-017 sa **transakcyjne** (`BEGIN`/`COMMIT`) i **idempotentne**
  (`IF NOT EXISTS` / `COALESCE` przy backfillu) — bezpieczne do ponownego puszczenia, jesli
  czesciowo juz przeszly. Uruchamiaj DOKLADNIE w tej kolejnosci — kazda kolejna moze zakladac,
  ze poprzednia juz przeszla (np. 011 zaklada istnienie `app_settings` z 007, 017 rozszerza CHECK
  na `pgl_price_history.steel_type` z 013, 016 zaklada `app_settings` z 011).
- Migracje 008/009/010 probuja wlaczyc `pg_trgm` (`CREATE EXTENSION IF NOT EXISTS`) pod GIN-owe
  indeksy trigramowe (szybkie `ILIKE '%fraza%'`). Jesli hosting nie da uprawnien do `CREATE
  EXTENSION`, migracja **sama to lapie** (`EXCEPTION WHEN OTHERS`) i spada na zwykly indeks btree
  po `lower(...)` — wyszukiwanie dziala dalej, tylko wolniej. Nie traktuj ewentualnego
  `NOTICE: pg_trgm niedostepny` jako bledu.
- Konsekwencje pominiecia (od najbardziej do najmniej krytycznej):
  - Bez **008**: aplikacja **PADNIE** — SELECT na `display_name`: lista ofert, panel seniora i
    panel admina zwroca 500.
  - Bez **015**: `GET`/`PUT /api/offers/[id]` i listy ofert **PADNA** (`42703`, undefined_column)
    — SELECT-uja wprost `root_offer_id`/`version_number`.
  - Bez **016**: `GET /api/settings` **PADNIE** (`42703`) — cala aplikacja przestaje dzialac, nie
    tylko 3 nowe typy stali.
  - Bez **009** lub **010**: podpowiedzi klienta i zapis oferty zwroca 500 (kod odwoluje sie do
    `clients.sap_id` i tabeli `client_contacts`), panel „Kontakty" admina bedzie pusty/bledny.
  - Bez **011**: panel ustawien admina i kalkulator odwoluja sie do `pgl_base_hrs/cr/hdg`,
    ktorych nie bedzie — 500 na `/api/settings`.
  - Bez **017**: zapis historii cen dla PICKLED/TEARDROP/ZM wywali CHECK constraint na
    `pgl_price_history.steel_type` (kod `23514`) — reszta aplikacji dziala.
  - Bez **007**: panel ustawien admina nie zapisze zmian (API zwroci wartosci domyslne, apka
    sama sie nie wywali).
  - Bez **014**: `/api/settings` po prostu nie zapisze progu marzy — reszta kodu ma fallback na
    wartosc domyslna (7%), apka nie pada.
  - Bez **012** lub **013**: apka NIE pada — `012` (backfill kontaktow) i `013` (historia PGL)
    maja lagodna degradacje (pusta lista / `42P01` → pusty wynik zamiast 500).
- Weryfikacja po migracjach (wszystkie musza przejsc bez bledu):
  ```sql
  SELECT * FROM app_settings LIMIT 1;
  SELECT display_name FROM offers LIMIT 1;
  SELECT sap_id FROM clients LIMIT 1;
  SELECT 1 FROM client_contacts LIMIT 1;
  SELECT pgl_base_hrs, pgl_base_cr, pgl_base_hdg FROM app_settings LIMIT 1;
  SELECT 1 FROM pgl_price_history LIMIT 1;
  SELECT min_margin_pct FROM app_settings LIMIT 1;
  SELECT root_offer_id, version_number FROM offers LIMIT 1;
  SELECT pgl_base_pickled, pgl_base_teardrop, pgl_base_zm FROM app_settings LIMIT 1;
  ```

## 5. Zbuduj — ale NIE wdrazaj automatycznie na produkcje
- Sprawdz najpierw, ze `JWT_SECRET` istnieje w srodowisku (punkt 2B) — bez niego build/start
  aplikacji celowo padnie.
- Uruchom `yarn install`, potem WSZYSTKIE migracje z punktu 4 w kolejnosci, potem `next build`.
- Jesli build zglosi blad typow lub lintu, pokaz mi tresc bledu i **zatrzymaj sie** — nie obchodz
  bledu przez wylaczanie sprawdzania, nie "napraw" tego po swojemu. Czekaj na moja decyzje.
- Jesli build przejdzie czysto: **zastosuj zmiany w projekcie i zatrzymaj sie na tym etapie.**
  NIE klikaj/nie wywoluj samodzielnie przycisku "Redeploy" ani niczego rownowaznego, co wypycha to
  na zywy produkcyjny ruch. Ja sam przetestuje wersje w podgladzie/preview Abacusa i dopiero wtedy
  recznie kliknij Redeploy, gdy uznam, ze wszystko dziala.
- Potwierdz mi krotko: wynik builda (sukces/blad), czy wszystkich jedenascie migracji przeszlo bez
  bledu (wraz z wynikiem zapytan weryfikacyjnych z punktu 4), oraz ze **nie** kliknales Redeploy.

## 6. Checklist do mojego recznego testu w Abacusie (PRZED klikinieciem Redeploy)
Nie musisz tego robic Ty — to ja sprawdzam w przegladarce na podgladzie, zanim wdroze na zywo:
- logowanie nadal dziala (junior/senior/admin), token sesji nie jest odrzucany,
- przelacznik EUR/PLN w kalkulatorze przelicza poprawnie, stare oferty (jesli jakies sa w bazie)
  zachowuja zamrozona cene/walute,
- panel ustawien admina: kurs EUR/PLN, TRZY (a teraz szesc — HRS/CR/HDG/PICKLED/TEARDROP/ZM) pola
  PGL bazowego, transport i minimalna marza zapisuja sie, zmiana widoczna w kalkulatorze OD RAZU,
- karta „Historia zmian PGL bazowego" w ustawieniach pokazuje wpisy po kazdej zmianie ceny,
  eksport do Excela dziala,
- kalkulator: zmiana typu stali automatycznie przelacza PGL bazowe na wartosc dla tego typu,
- cena koncowa pozycji i suma zestawienia pokazuja liczbe calkowita (zaokraglona w gore), reszta
  kwot nadal na 2 miejscach po przecinku,
- panel klienta w kalkulatorze: wyszukiwarki firma/NIP podpowiadaja z katalogu, wybor uzupelnia
  SAP ID i dane kontaktowe; edycja klienta w „Klienci" synchronizuje kontakt glowny do „Kontakty",
- numery ofert + wyszukiwanie po ID/nazwie/fragmencie dziala na `/offers`, `/senior`, `/admin/oferty`,
- jezyki CS/DE dostepne obok PL/EN, etykiety sie nie gubia,
- tryb „Wysoki kontrast" (🔲) dziala na wszystkich 4 stronach — czarno-bialy, wieksza czcionka,
- pulpit admina: kazdy z 7 kafelkow statusow linkuje do przefiltrowanej listy ofert,
- klik w wiersz zestawienia kalkulatora ORAZ klik w karte/wiersz oferty na listach = edycja
  (bez klikania w konkretny przycisk ✏️),
- junior z pozycjami spelniajacymi prog marzy/PGL moze wyslac oferte BEZ zatwierdzenia seniora;
  ponizej progu — ostrzezenie inline i wymagane zatwierdzenie jak dotychczas,
- edycja juz wyslanej/zapisanej oferty tworzy NOWA WERSJE (`offer_N.1`, `offer_N.2`...), stara
  wersja zostaje widoczna pod „🕓 N poprzednich wersji"; oferta `sent` pozostaje read-only,
- kolumna „Uwagi" w PDF pokazuje realna liste dopłat pozycji (nie pusta),
- trzy nowe zakladki typu stali dzialaja: **PICKLED** (trawienie liczy sie automatycznie z
  grubosci), **TEARDROP** (brak selektora gatunku, stala dopłata Łezka), **ZM** (powłoka
  ZM70…ZM430, brak ponizej 800mm szerokosci to oczekiwane),
  a zapisana oferta z pozycja kazdego z tych typow odtwarza sie poprawnie po „Edytuj",
- panel admina: zatwierdzanie/odrzucanie/edycja ofert (senior i admin) dziala jak wczesniej,
- "Eksportuj do PDF" i eksport do Excela nadal dzialaja, PDF pokazuje zaokraglone ceny koncowe.

## 7. Nie-blokujace, swiadome niedoróbki (nie zglaszaj jako bledow)
- Tabela gatunkow PICKLED jest niekompletna (35 z docelowej listy) — dojdzie w kolejnym wdrozeniu,
  to NIE jest blad tej wersji.
- `MIN_PASSWORD_LENGTH = 4` (`lib/passwordPolicy.ts`) jest **celowa** decyzja biznesowa (dzial
  handlowy uzywa krotkich hasel) — NIE podnosic do 6 bez mojej wyraznej prosby.
- Import Excela (KTS/GPAO → kalkulator) nie istnieje jeszcze w kodzie — swiadomie odlozony,
  nie brakujacy plik.
