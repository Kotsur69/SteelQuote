# Prompt dla DeepAgent (AbacusAI) — wdrozenie v9 (v1.7 → v1.8)
# Skok sredni: TRZY migracje (021, 022, 023), reszta to podmiana plikow. Glowne nowosci:
# harmonogram kwartalny cen bazowych PGL z automatycznym przelaczeniem + auto-migracja
# nieaktualnego PGL przy edycji/duplikacie oferty, zlom jako % ceny wsadu (konfigurowalny),
# termin platnosci (od-do) obok okresu waznosci oferty + panel terminow klienta, wlasny
# odbior transportu, gatunek "jednorazowy" + komentarz do doplaty dodatkowej w PDF,
# zwijany panel kalkulacji, drag-and-drop w zestawieniu z obsluga dotyku, poprawki PDF
# (totale nie powtarzaja sie na kazdej stronie, rozjazd kolumn przy 5-cyfrowych cenach).

Skopiuj ponizszy tekst do DeepAgent i dolacz zalaczony zip **`AMSteel_Quote_v1.8_deploy.zip`**
(spakowany z galezi `main`, commit `b0949e4`, dokladnie to, co jest na GitHubie:
https://github.com/Kotsur69/SteelQuote/tree/main). Zip zawiera caly folder `nextjs_space`
BEZ `node_modules`, `.next`, `.env`, `.env.local` i `package-lock.json` (projekt jedzie na
yarnie, npm-owy lock miesza w instalacji).

**Stan wyjsciowy:** na produkcji (https://steelpricinghub.abacusai.app) jest **v1.7** —
zespoly seniora, transport z realnej trasy i migracje `019`-`020` sa juz wdrozone, migracje
`001`-`020` puszczone. Ten deploy dokłada **trzy** migracje (`021`, `022`, `023`, w tej
kolejnosci — sa od siebie niezalezne, kolejnosc jest czysto numeryczna) i podmienia pliki.
**Zrob kopie bazy przed migracjami** (`pg_dump $DATABASE_URL > backup_przed_v1.8_<data>.sql`
albo rownowazna opcja Abacusa) — mimo ze wszystkie trzy migracje sa wylacznie dodajace.

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

### Nowe pliki w tej wersji (nie istnialy w v1.7 — maja powstac)
- `migrations/021_create_pgl_quarterly_prices.sql`
- `migrations/022_add_scrap_pct.sql`
- `migrations/023_add_payment_term.sql`
- `lib/quarterUtils.ts` — czyste funkcje rok+kwartal z daty (bez importu `db`, bezpieczne w komponencie klienckim)
- `lib/pglQuarterly.ts` — odczyt/nadpisanie PGL zaplanowanym kwartalem (tabela `pgl_quarterly_prices`)
- `app/api/settings/pgl-quarterly/route.ts` — GET/PUT siatki zaplanowanych cen PGL (tylko admin)
- `lib/pricingEngine.ts` — wzor cenowy wyekstrahowany z kalkulatora, wspoldzielony przez live-kalkulator i auto-migracje nieaktualnego PGL
- `lib/dateUtils.ts` — arytmetyka dat (okres waznosci, termin platnosci od+N dni)
- `components/ClientPaymentTermsPanel.tsx` — panel terminow platnosci per klient (zakladka "Klienci" w widoku seniora)
- `components/ZestawienieRow.tsx` — wiersz zestawienia wyekstrahowany do osobnego komponentu (drag-and-drop)

### Pliki zmienione (podmien 1:1)
`app/admin/klienci/page.tsx`, `app/admin/ustawienia/page.tsx`, `app/api/admin/clients/route.ts`,
`app/api/clients/search/route.ts`, `app/api/generate-pdf/route.ts`, `app/api/offers/[id]/route.ts`,
`app/api/offers/[id]/send/route.ts`, `app/api/settings/route.ts`, `app/senior/page.tsx`,
`components/Calculator.tsx`, `components/TransportPanel.tsx`, `contexts/CurrencyContext.tsx`,
`lib/calculatorData.ts`, `lib/currency.ts`, `lib/itemNotes.ts`, `lib/pdfLabels.ts`,
`lib/serverPdf.ts`, `lib/translations.ts`, `.env.example`.

`middleware.ts` — bez zmian w tej wersji, zostaje jak w v1.7. Brak nowych zaleznosci —
`package.json` w zipie jest identyczny z produkcyjnym (v1.7).

## 2. Co konkretnie zmienia ta wersja (kontekst, zebys nie "poprawial" tego inaczej)

**A) Harmonogram kwartalny cen bazowych PGL z automatycznym przelaczeniem (migracja 021):**
- Admin planuje ceny bazowe PGL per typ stali dla kwartalow Q1-Q4 danego roku, z wyprzedzeniem —
  np. wpisuje cene na Q4 gdy trwa jeszcze Q3. Kalkulator sam uzywa ceny dla kwartalu, w ktorym
  aktualnie jest serwer (`lib/quarterUtils.ts`), bez zadnej dodatkowej akcji admina.
- Tabela `pgl_quarterly_prices` (klucz naturalny year+quarter+steel_type) jest NAKŁADKĄ na
  `app_settings.pgl_base_*`, nie zastepstwem: gdy dla aktualnego kwartalu+typu istnieje
  zaplanowany wiersz, wygrywa on (`applyQuarterlyPglOverride` w `lib/pglQuarterly.ts`);
  w przeciwnym razie zostaje dotychczasowa wartosc reczna jako fallback. Instalacja bez ani
  jednego zaplanowanego kwartalu dziala dokladnie jak dzis.
- Nakladka jest zastosowana we WSZYSTKICH miejscach, ktore czytaja zywe ustawienia: `GET
  /api/settings` (kalkulator), prog "wymaga przegladu" przy `PUT /api/offers/[id]` i `POST
  /api/offers/[id]/send` (ten prog jest udokumentowany jako zywy, nie zamrozony), oraz
  auto-wybor PGL po zmianie okresu waznosci oferty (patrz punkt A niżej: `refreshSettings`
  w `CurrencyContext` przyjmuje teraz opcjonalny `{ year, quarter }`).
- Zapisane, oczekujace i wyslane oferty NIE sa ruszane — trzymaja PGL z dnia wyceny, dokladnie
  jak dotychczas (zamrozenie w `offer_data`).
- Panel admina (`app/admin/ustawienia/page.tsx`) laczy reczne pola PGL i harmonogram w jedna
  tabele: biezacy miesiac obok Q1-Q4, aktywny kwartal podswietlony, jeden przycisk zapisu dla
  calej karty. Kolumna dla kwartalu, ktory ma aktywny harmonogram, jest tam **tylko do
  odczytu** (edycja idzie przez komorke harmonogramu), zeby edycja nie odbijala sie z powrotem.
- Zmiana ceny przez komorke biezacego kwartalu trafia do tego samego logu
  `pgl_price_history` co reczna zmiana (migracja 013) — inaczej zmiana "znikalaby" z historii
  mimo ze realnie zaszla (naprawione w `5d57038`, `PUT /api/settings/pgl-quarterly`).
- **Poprawka regresu wprowadzonego przez ta funkcje:** zapis karty ustawien wczesniej
  nadpisywal `app_settings.pgl_base_*` wartoscia z aktywnego harmonogramu przy KAZDYM zapisie
  karty (nawet takim, ktory zmienial tylko kurs), niszczac cichaczem reczna wartosc fallback.
  Teraz zapis pomija `pglBase*` dla typow, ktorych biezacy kwartal ma aktywny harmonogram —
  te pola i tak sa w tabeli tylko do odczytu, wiec nic edytowalnego nie ginie (`dc85eac`).
- **Auto-migracja nieaktualnego PGL przy edycji/duplikacie oferty** (`b0949e4`): otwarcie do
  edycji zapisanej oferty (albo swiezo zduplikowanej kopii) wycenionej w minionym kwartale PGL
  odswieza automatycznie `pglBase`, PGL/marze/cene kazdego wiersza zestawienia oraz okres
  waznosci do biezacego kwartalu — zamiast po cichu trzymac nieaktualne liczby. Nic nie jest
  zapisywane do bazy dopoki uzytkownik nie zapisze oferty; widoczny, zamykalny baner tlumaczy
  co sie zmienilo i ile wierszy przeliczono (wiersze bez zapisanego snapshotu wejsc dostaja
  tylko podmiane PGL, oznaczone osobno do recznego przegladu). Formula cenowa zostala
  wyekstrahowana do `lib/pricingEngine.ts`, zeby zywy kalkulator i ta sciezka migracji
  uzywaly jednej implementacji.
- **Konsekwencje pominiecia `021`:** `GET /api/settings/pgl-quarterly`, `GET /api/settings`,
  prog przegladu ofert i auto-wybor PGL po zmianie okresu waznosci dostaja `42P01`
  (`relation "pgl_quarterly_prices" does not exist"`) i **cicho spadaja na puste wyniki /
  wartosci reczne** — kod lapie ten kod bledu wszedzie (`readQuarterPrices`,
  `readCurrentQuarterPrices`, `readQuarterlyPricesForYear`). Aplikacja NIE wywala sie, ale
  panel harmonogramu w ustawieniach pokazuje pusta siatke, a admin nie moze zaplanowac cen
  z wyprzedzeniem — kazda zmiana PGL wraca do bycia czysto reczna, jak w v1.7.
- `021` jest **wylacznie dodajaca**: `CREATE TABLE IF NOT EXISTS pgl_quarterly_prices` z
  `CHECK`-ami sanity (rok 2020-2100, kwartal 1-4, typ stali z zamknietej listy, cena >= 0).
  Idempotentna, bezpieczna do ponownego puszczenia. Nie rusza zadnych istniejacych danych.

**B) Zlom jako procent ceny wsadu, konfigurowalny przez admina (migracja 022):**
- Do tej pory "Zlom" w podsumowaniu SSC byl stala kwota (`SCRAP_CONSTANT = 10 €/t` w kodzie,
  teraz usuniete z `lib/calculatorData.ts`). Od tej wersji jest to procent ceny wsadu
  (`pglBase + sumaHuta`), domyslnie 2%, edytowalny przez admina w Ustawieniach (nowe pole
  "Zlom (%)"), dokladnie tak samo jak istniejaca minimalna marza (migracja 014).
- Wartosc zaokraglana do pelnej jednostki waluty na etapie liczenia (nie tylko wyswietlania),
  zeby splywala poprawnie do sumy SSC i ceny koncowej, zgodnie z decyzja zarzadu (`063bb10`).
- **Konsekwencje pominiecia `022`:** `PATCH /api/settings` i `GET /api/settings` lapia `42703`
  (undefined_column) i cofaja sie do domyslnej wartosci 2% w pamieci — admin NIE moze zmienic
  procentu zlomu (zmiana w ustawieniach nie przetrwa), ale kalkulator dalej dziala i liczy
  zlom (na wartosci domyslnej), bez 500.
- `022` to prosty `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS scrap_pct ... DEFAULT 2`
  + `CHECK (scrap_pct BETWEEN 0 AND 100)`. Idempotentna.

**C) Termin platnosci (od-do) obok okresu waznosci oferty (migracja 023):**
- Nowa para pol "Termin platnosci od/do" w kalkulatorze, niezalezna od istniejacego "Wazna
  od/do". Wybranie "od" auto-wypelnia "do" jako od + N dni, gdzie N to wlasny termin klienta
  (jesli ustawiony w nowym panelu "Klienci" — widoczny dla seniora i admina) albo globalny
  domyslny z Ustawien; "do" zostaje w pelni edytowalne i jest przeliczane na nowo za kazdym
  razem gdy zmienia sie "od".
- Stopka PDF pokazuje teraz konkretny zakres dat zamiast generycznego "wg ustalen
  indywidualnych", gdy obie daty sa ustawione.
- `app_settings.payment_term_days` (domyslny, globalny, `DEFAULT 7`) i
  `clients.payment_term_days` (nullable — `NULL` = klient dziedziczy wartosc globalna).
- **Konsekwencje pominiecia `023`:** `PATCH/GET /api/settings`, zapis/odczyt klienta
  (`app/api/admin/clients/route.ts`, `app/api/clients/search/route.ts`) lapia `42703` i
  cofaja sie do domyslnej wartosci 7 dni w pamieci — pole terminu platnosci per klient
  NIE zapisze sie (zawsze wroci do globalnego fallbacku), ale nic nie zwraca 500; PDF pokaze
  wyliczony zakres na podstawie wartosci domyslnej.
- `023` to dwa `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + 2 `CHECK`-i (0-365 dni,
  drop-then-add). Idempotentna.

**D) Gatunek "jednorazowy" + komentarz do doplaty dodatkowej (bez migracji):**
- Handlowiec moze wycenic gatunek spoza katalogu: wpisanie nazwy nieobecnej w tabeli
  aktywnego typu przypina wiersz "gatunek jednorazowy" na gorze listy podpowiedzi; wybranie go
  odslania pole doplaty pod polem gatunku. Wartosc plynie przez `selectedGrade.value` do
  `sumaHuta` jak kazdy gatunek katalogowy — PLN, snapshoty pozycji, odtworzenie przy edycji,
  PDF i Excel dzialaja bez zmian. Brak zmiany schematu: stan jest wyliczany, nie
  przechowywany osobno (`Grade`/`ItemInputs` bez zmiany ksztaltu), stare oferty bez wplywu.
  Przy okazji naprawiony martwy punkt: nieznany gatunek wczesniej cicho wyceniał sie na 0
  bez ostrzezenia.
- Opcjonalny komentarz + checkbox "dolacz do PDF" dla pozycji z niezerowa doplata dodatkowa,
  ukrywany (nie czyszczony) gdy doplata wraca do 0, emitowany do kolumny "Uwagi" w PDF ze
  wszystkich czterech sciezek eksportu. Nowe opcjonalne pola `extraComment`/
  `extraCommentInPdf` w `ItemInputs` (`lib/calculatorData.ts`) — stare zapisane oferty bez
  zmian.

**E) Wlasny odbior transportu (bez migracji):**
- Checkbox "wlasny odbior" w panelu transportu wymusza 0 EUR/t, gdy klient sam odbiera towar,
  wykorzystujac istniejacy mechanizm propagacji kosztu trasy — zeruje transport takze na juz
  dodanych pozycjach zestawienia.

**F) Zwijany panel kalkulacji:**
- Panel kalkulacji (wybor typu stali, tryb ARKUSZ/KRAG, parametry wejsciowe, waga
  arkusza/ostrzezenia, siatka cenowa) zwija sie i rozwija naglowkiem, tak jak istniejacy
  panel danych klienta. Domyslnie rozwiniety; Zestawienie zawsze widoczne ponizej.

**G) Ostrzezenia PGL/marzy widoczne z czerwona ramka:**
- Zamiana bladego 10px zoltego tekstu ostrzezenia na wyrazisty, czerwono obramowany/podbarwiony
  box — dla obu komunikatow: PGL ponizej bazy i marza ponizej minimum. Zgloszenie od
  handlowcow: zolty tekst z ikona ostrzezenia byl latwy do przeoczenia.

**H) Poprawki eksportu PDF:**
- Wiersz totali byl w `<tfoot>` tej samej tabeli co pozycje; silnik druku HTML->PDF Chrome
  powtarza `<thead>/<tfoot>` na kazdej stronie, na ktora rozciaga sie tabela — powyzej ~2
  pozycji totale pojawialy sie po kazdej stronie zamiast tylko po ostatniej pozycji. Totale
  przeniesione do osobnej tabeli po tabeli pozycji, renderuja sie dokladnie raz. Dotyczylo
  ofert w EUR i PLN (wspolny szablon).
- Przejscie na `table-layout: fixed` ze wspolnym `colgroup` i szerszymi kolumnami cena/wartosc
  + `nowrap` — naprawia rozjazd/nakladanie tekstu przy cenie lub wartosci na 5 cyfrach
  (typowe w PLN po przeliczeniu).

**I) Drag-and-drop w zestawieniu z obsluga dotyku:**
- Wiersze zestawienia mozna teraz przeciagac uchwytem (`framer-motion` `Reorder` — biblioteka
  juz byla zaleznoscia projektu, brak nowego pakietu); numeracja Lp. aktualizuje sie
  automatycznie, nowa kolejnosc splywa do eksportu PDF/Excel i zapisanych ofert bez zmian.
  Uchwyt ma `touchAction: none`, zeby przeciaganie dzialalo na telefonach/tabletach, nie
  tylko na desktopie (`Reorder.Item` ustawia to samo tylko przy domyslnym `dragListener`,
  z ktorego wlasny uchwyt rezygnuje). Wiersz wyekstrahowany do `components/ZestawienieRow.tsx`.

**J) Suma ton w wierszu podsumowania zestawienia:**
- Laczna liczba ton pokazuje sie teraz obok sumy wartosci w stopce podsumowania, przeniesiona
  do wiersza `tfoot` wewnatrz tabeli pozycji, zeby suma ton wyrownywala sie pod kolumna Tony,
  a suma wartosci pod kolumna Wartosc — zamiast wisiec w osobnym pasku pod tabela.

## 3. NIE ruszaj sekretow, konfiguracji ani lockfile'a
- Nie zmieniaj `DATABASE_URL`, `JWT_SECRET`, `ABACUSAI_API_KEY`, `NEXTAUTH_SECRET`,
  `GEOAPIFY_API_KEY` ani zadnych innych zmiennych srodowiskowych. Sprawdz tylko, ze
  `JWT_SECRET` w ogole istnieje — brak tej zmiennej celowo wywala start aplikacji.
- **Brak nowych zmiennych srodowiskowych w tej wersji.**
- Nie nadpisuj i nie kasuj `.env` po stronie Abacusa (moje zrodlo go nie zawiera — celowo).
- Nie ruszaj `.abacus.donotdelete` — marker platformy, nie plik aplikacji.
- Projekt jedzie na **yarnie** (`.yarnrc.yml`) — w zrodle **nie ma** `package-lock.json`
  (celowo wyciety). Uzyj `yarn install`, nie `npm install`.
- Zignoruj `.env.example` jesli je nadpiszesz (placeholdery, nie prawdziwa konfiguracja).
- **Brak nowych zaleznosci.** `package.json` w zipie jest identyczny z produkcyjnym (v1.7).
  Jesli `yarn install` chce cokolwiek dociagnac/zmienic w lockfile — pokaz mi to i zatrzymaj
  sie.

## 4. Migracje bazy danych — OBOWIAZKOWE, PRZED buildem, w tej kolejnosci

```
psql $DATABASE_URL -f migrations/021_create_pgl_quarterly_prices.sql
psql $DATABASE_URL -f migrations/022_add_scrap_pct.sql
psql $DATABASE_URL -f migrations/023_add_payment_term.sql
```

- Migracje `001`-`020` sa juz na produkcji (v1.5 + panel Analiza + v1.7). Nie puszczaj ich
  ponownie.
- `021`, `022`, `023` nie zaleza od siebie nawzajem — kolejnosc jest po prostu numeryczna.
  Wszystkie trzy sa **wylacznie dodajace** (nowa tabela / nowe kolumny + `CHECK`-i),
  idempotentne, nie modyfikuja ani nie kasuja istniejacych danych.
- Konsekwencje pominiecia kazdej — patrz punkty 2A, 2B, 2C powyzej. Zadna z trzech nie
  wywala aplikacji przy pominieciu (kod wszedzie lapie `42703`/`42P01` i spada na wartosci
  domyslne) — tracisz tylko odpowiednia nowa funkcje.
- Weryfikacja po migracjach (musi przejsc bez bledu):
  ```sql
  -- 021
  SELECT year, quarter, steel_type, price FROM pgl_quarterly_prices LIMIT 1;
  \d pgl_quarterly_prices

  -- 022
  SELECT scrap_pct FROM app_settings WHERE id = 1;   -- oczekiwane 2.00

  -- 023
  SELECT payment_term_days FROM app_settings WHERE id = 1;   -- oczekiwane 7
  SELECT payment_term_days FROM clients LIMIT 1;             -- kolumna istnieje, NULL dozwolony
  ```

## 5. Zbuduj — ale NIE wdrazaj automatycznie na produkcje
- Sprawdz najpierw, ze `JWT_SECRET` istnieje w srodowisku — bez niego build/start celowo
  padnie.
- Uruchom `yarn install`, potem migracje `021`, `022`, `023` (punkt 4, w tej kolejnosci),
  potem `next build`.
- Jesli build zglosi blad typow lub lintu, pokaz mi tresc bledu i **zatrzymaj sie** — nie
  obchodz bledu przez wylaczanie sprawdzania, nie "napraw" tego po swojemu. Czekaj na moja
  decyzje.
- Jesli build przejdzie czysto: **zastosuj zmiany w projekcie i zatrzymaj sie na tym etapie.**
  NIE klikaj/nie wywoluj samodzielnie "Redeploy" ani niczego rownowaznego, co wypycha to na
  zywy produkcyjny ruch. Ja sam przetestuje wersje w podgladzie/preview Abacusa i dopiero
  wtedy recznie kliknij Redeploy, gdy uznam, ze wszystko dziala.
- Potwierdz mi krotko: wynik builda (sukces/blad), czy migracje `021`, `022`, `023` przeszly
  bez bledu (wraz z wynikiem zapytan weryfikacyjnych z punktu 4), czy `yarn install` nie
  ruszyl lockfile'a, oraz ze **nie** kliknales Redeploy.

## 6. Checklist do mojego recznego testu w Abacusie (PRZED klikinieciem Redeploy)
Nie musisz tego robic Ty — to ja sprawdzam w przegladarce na podgladzie, zanim wdroze na zywo:
- logowanie nadal dziala (junior/senior/admin), token sesji nie jest odrzucany,
- panel ustawien: siatka harmonogramu PGL (Q1-Q4 x typ stali) laduje sie i da sie zapisac;
  wpisanie ceny na przyszly kwartal i zmiana zegara/dnia na ten kwartal (albo test na
  biezacym) powoduje, ze kalkulator sam uzywa nowej ceny bez zadnej dodatkowej akcji;
  kolumna z aktywnym harmonogramem jest tylko do odczytu w tabeli recznej,
- zapisanie karty ustawien (np. samej zmiany kursu) NIE nadpisuje juz recznej wartosci PGL
  wartoscia z harmonogramu (regres z `dc85eac` naprawiony),
- otworzenie do edycji (albo zduplikowanie) starej oferty wycenionej w minionym kwartale PGL
  pokazuje baner auto-migracji i przelicza PGL/marze/ceny/okres waznosci; nic nie zapisuje
  sie do bazy przed recznym zapisem oferty,
- w Ustawieniach da sie ustawic procent zlomu (pole "Zlom (%)"), a SSC/cena koncowa licza go
  poprawnie jako procent (pglBase + sumaHuta), zaokraglony do calej jednostki,
- w kalkulatorze da sie ustawic termin platnosci "od" i "do" (od auto-wypelnia do wg terminu
  klienta albo globalnego domyslnego, do zostaje edytowalne); PDF pokazuje ten zakres w
  stopce zamiast generycznego tekstu,
- w panelu "Klienci" (zakladka u seniora i admina) da sie ustawic wlasny termin platnosci
  per klient, dziedziczenie z globalnego dziala gdy pole puste,
- w panelu transportu zaznaczenie "wlasny odbior" zeruje koszt transportu, takze na juz
  dodanych pozycjach zestawienia,
- wpisanie w polu gatunku nazwy spoza katalogu pokazuje wiersz "gatunek jednorazowy" na
  gorze podpowiedzi; wybranie go odslania pole doplaty, ktora poprawnie wchodzi do wyceny,
  PDF i Excela,
- na pozycji z niezerowa doplata dodatkowa da sie dodac komentarz i zaznaczyc "dolacz do
  PDF" — komentarz pojawia sie w kolumnie "Uwagi" PDF tylko gdy checkbox zaznaczony,
- panel kalkulacji zwija sie i rozwija naglowkiem, Zestawienie zostaje widoczne,
- ostrzezenia PGL-ponizej-bazy i marza-ponizej-minimum sa wyrazne (czerwona ramka/tlo),
- PDF z wieksza liczba pozycji (>2, rozciagajacy sie na kilka stron) pokazuje totale
  DOKLADNIE RAZ, na koncu, nie po kazdej stronie; ceny/wartosci na 5 cyfrach (np. w PLN) nie
  nachodza na siebie ani nie sa obciete,
- w zestawieniu da sie przeciagnac wiersz uchwytem (mysza na desktopie i dotykiem na
  telefonie/tablecie) i kolejnosc zmienia numeracje Lp., splywa do zapisanej oferty,
- w podsumowaniu zestawienia suma ton jest widoczna obok sumy wartosci, wyrownana pod
  wlasciwymi kolumnami,
- pozostale funkcje v1.7 (zespoly seniora + zakres panelu Analiza, transport z realnej
  trasy + wlasny cennik + `route_cache`, panel Handlowcy z metrykami skutecznosci, ochrona
  przed utrata niezapisanych zmian, przycisk "Nowa oferta", wysoki kontrast, decyzja
  klienta won/lost, wymog danych firmy przy wysylce oferty) dzialaja jak przed deployem.

## 7. Nie-blokujace, swiadome decyzje (nie zglaszaj jako bledow)
- `MIN_PASSWORD_LENGTH = 4` (`lib/passwordPolicy.ts`) jest **celowa** decyzja biznesowa
  (dzial handlowy uzywa krotkich hasel) — NIE podnosic do 6 bez mojej wyraznej prosby.
- `GEOAPIFY_API_KEY` nadal opcjonalny/niedodany — swiadome; fallback na Nominatim + OSRM
  jest zamierzony, bez zmian w tej wersji.
- Import Excela (KTS/GPAO → kalkulator) nadal nie istnieje w kodzie — swiadomie odlozony,
  nie brakujacy plik.
- Wysylka oferty do klienta to nadal tylko zmiana statusu na "wyslana" — realna wysylka
  e-mailem/PDF do klienta swiadomie odlozona.
- Uspiony Prisma/NextAuth oraz zdublowane pliki danych kalkulatora (`calc-data.ts` /
  `calculatorData.ts`) — do uporzadkowania, swiadomie odlozone. Aktywny auth to JWT/`pg`.
- Panel Analiza, sekcja transportu i harmonogram PGL nie maja jeszcze wlasnych testow
  automatycznych — projekt nie ma harnessu, swiadomie odlozone.
- `middleware.ts` w zipie jest identyczny jak w v1.7 — brak zmian w tej wersji, to nie
  przeoczenie.
