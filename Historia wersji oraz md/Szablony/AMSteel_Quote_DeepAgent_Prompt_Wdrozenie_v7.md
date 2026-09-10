# Prompt dla DeepAgent (AbacusAI) — wdrozenie v7 (v1.5 → v1.6 + panel Analiza)
# Skok maly: JEDNA migracja (018), reszta to podmiana plikow. Glowna nowosc: panel "Analiza"
# (app/analytics) dla wszystkich rol + os "decyzja klienta" (won/lost) na ofercie wyslanej.
# Obok tego domkniete drobne zmiany v1.6: pelna tabela gatunkow PICKLED, PDF w jezyku handlowca,
# tryb wysokiego kontrastu takze w ciemnym motywie, baner "edytujesz oferte X", PGL bazowe
# zawsze w EUR, auto-scroll kalkulatora przy edycji pozycji, kilka poprawek UI list ofert.

Skopiuj ponizszy tekst do DeepAgent i dolacz zalaczony zip **`AMSteel_Quote_v1.6_deploy.zip`**
(spakowany z `HEAD` na `main`, commit `c124ba2`, dokladnie to, co jest na GitHubie:
https://github.com/Kotsur69/SteelQuote). Zip zawiera caly folder `nextjs_space` BEZ `node_modules`,
`.next`, `.env`, `.env.local` i `package-lock.json` (projekt jedzie na yarnie, npm-owy lock miesza
w instalacji).

**Stan wyjsciowy:** ostatni potwierdzony deploy na produkcje to **v1.5 z 2026-08-17**
(https://steelpricinghub.abacusai.app), migracje `001`-`017` puszczone. Ten deploy dokłada
**jedna** migracje (`018`) i podmienia pliki. To duzo mniejszy skok niz poprzedni.
**Zrob kopie bazy przed migracja** (`pg_dump $DATABASE_URL > backup_przed_v1.6_<data>.sql` albo
rownowazna opcja Abacusa) — mimo ze migracja jest jedna i wylacznie dodajaca kolumny.

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

### Nowe pliki w tej wersji (nie istnialy w v1.5 — maja powstac)
- `migrations/018_offer_client_decision.sql`
- `app/analytics/page.tsx` — strona panelu Analiza
- `app/api/analytics/route.ts` — jedyny endpoint danych panelu
- `app/api/offers/[id]/decision/route.ts` — zapis decyzji klienta (won/lost/pending) na ofercie wyslanej
- `components/analytics/` — `KpiTiles.tsx`, `FilterBar.tsx`, `TimeSeriesPanel.tsx`,
  `WinLossPanel.tsx`, `BreakdownPanel.tsx`, `DataTablePanel.tsx`, `ChartFrame.tsx`,
  `ChartTooltip.tsx`, `controls.tsx`
- `lib/analytics.ts`, `lib/analyticsQuery.ts`, `lib/analyticsAggregate.ts`, `lib/analyticsSeries.ts`,
  `lib/analyticsPeriods.ts`, `lib/analyticsFormat.ts`, `lib/analyticsExport.ts`
- `lib/chartColors.ts`, `lib/themeVars.ts` — wspoldzielone kolory wykresow i zmienne motywu
  (wczesniej te same wartosci byly zduplikowane inline w `app/senior/page.tsx` itd.; teraz jeden plik)
- `lib/pdfLabels.ts` — slownik etykiet PDF per jezyk (patrz punkt 2, pkt E)

### Pliki zmienione (podmien 1:1)
`middleware.ts`, `components/Navigation.tsx`, `components/AdminLayout.tsx`, `components/Calculator.tsx`,
`components/ClientCombobox.tsx`, `components/ContactCombobox.tsx`, `app/offers/page.tsx`,
`app/senior/page.tsx`, `app/admin/oferty/page.tsx`, `app/admin/ustawienia/page.tsx`,
`app/api/offers/route.ts`, `app/api/generate-pdf/route.ts`, `lib/serverPdf.ts`,
`lib/calculatorData.ts`, `lib/translations.ts`.

## 2. Co konkretnie zmienia ta wersja (kontekst, zebys nie "poprawial" tego inaczej)

**A) Panel "Analiza" (`/analytics`) — glowna nowosc, migracja 018:**
- Nowa pozycja w nawigacji ("Analiza", 📊) widoczna dla KAZDEJ roli. Zakres danych ustala
  **serwer** (`lib/analyticsQuery.ts`), nie URL: junior i senior widza WYLACZNIE swoje wlasne
  oferty (`o.user_id = <zalogowany>`), admin widzi cala firme. `/analytics` jest w `middleware.ts`
  w grupie "zalogowany dowolna rola" (obok `/calculator`, `/offers`), a nie w grupie ról
  panelowych — to zamierzone, nie "przeocz".
- Panel liczy: tonaz zaoferowany, tonaz wygrany/przegrany, win rate, rozbicie per typ stali /
  per klient / w czasie, tabela ofert z eksportem. Wersjonowanie ofert (migracja 015) jest
  uwzglednione: liczy sie **najnowsza wersja per rodzina** (`offer_30`, `offer_30.1`, ... = jedna
  wycena, nie trzy) — CTE wybiera ja PRZED filtrami analitycznymi.
- Osie czasu mozna kubelkowac po dacie utworzenia, wyslania albo decyzji klienta. Daty kubelkow
  liczy Postgres (`to_char`), wiec strefa czasowa bazy decyduje o przypisaniu do dnia — Node tego
  nie przelicza. Nie "naprawiaj" tego przez przeliczanie dat w Node.

**B) Os "decyzja klienta" — `offers.client_decision` (migracja 018):**
- Nowe kolumny: `client_decision` (`pending`/`won`/`lost`, NOT NULL DEFAULT `'pending'`, CHECK),
  `client_decision_at` (timestamptz, NULL dopoki `pending`), `client_decision_by`
  (`INTEGER REFERENCES users(id) ON DELETE SET NULL`), `client_decision_note` (TEXT). Dwa indeksy.
- To **osobna os** od `offers.status`. Workflow `status` (draft → pending_review →
  approved/rejected → sent) to NASZA wewnetrzna weryfikacja; `approved` znaczy "senior podbil",
  NIGDY "klient kupil". Nie łacz tych dwoch. Nie wyprowadzaj won/lost ze `status`.
- Dane historyczne backfilluja sie do `pending` przez DEFAULT — nie zgadujemy wynikow ofert
  sprzed tej kolumny.
- Zapis decyzji: `POST /api/offers/[id]/decision`. Tylko oferta `sent` moze dostac decyzje.
  Wlasciciel zapisuje na swojej; senior i admin na dowolnej (tak jak juz teraz weryfikuja/wysylaja
  cudze). `decision = 'pending'` czysci decyzje w calosci (cofniecie pomylki).
- `app/api/offers/route.ts` — `OFFER_COLUMNS` SELECT-uje teraz dodatkowo
  `o.client_decision, o.client_decision_at, o.client_decision_note`. Ta stala zasila liste ofert
  na `/offers`, `/senior` i `/admin/oferty`. **Bez migracji 018 cala lista ofert zwroci 500**
  (`42703`, undefined_column) — nie tylko panel Analiza. Dlatego 018 jest OBOWIAZKOWA przed buildem.

**C) v1.6 — pelna tabela gatunkow PICKLED (`lib/calculatorData.ts`):**
- Tabela gatunkow HRS Trawionej (PICKLED) uzupelniona do kompletu (bylo 35 pozycji "reszta dojdzie
  pozniej" w v1.5 — teraz komplet, m.in. SAPH440→DD12). Czysto dane, brak zmiany logiki cen.

**D) v1.6 — tryb "Wysoki kontrast" takze w ciemnym motywie:**
- Wczesniej wysoki kontrast byl jednym stalym motywem czarno-bialym. Teraz `getThemeVars(isDark,
  highContrast)` (`lib/themeVars.ts`) daje wariant wysokiego kontrastu rowniez dla ciemnego tla
  (jasny tekst/obramowania na czarnym) + odpowiadajace `hover:` (bialy alfa zamiast czarnego).
  `app/senior/page.tsx`, `components/Navigation.tsx`, `components/AdminLayout.tsx` przechodza z
  inline'owych obiektow `cssVars` na `getThemeVars(...)` — te same wartosci, jedno zrodlo.

**E) v1.6 — PDF w jezyku wybranym przez handlowca (`app/api/generate-pdf/route.ts`,
`lib/serverPdf.ts`, `lib/pdfLabels.ts`):**
- Wywolania generowania PDF (`app/senior/page.tsx`, `app/admin/oferty/page.tsx`, `/offers`)
  przekazuja teraz `language` do endpointu. `lib/pdfLabels.ts` trzyma slownik etykiet PDF per
  jezyk (PL/EN/CS/DE) — dokument wychodzi w jezyku UI handlowca, nie na sztywno po polsku.
  Snapshot waluty/kursu z samej oferty bez zmian.

**F) v1.6 — drobne UI list ofert i kalkulatora:**
- Baner "edytujesz oferte X" widoczny na `/offers` gdy otwarta jest istniejaca oferta do edycji.
- Klik w karte oferty nie "połyka" juz klikniec w wiersze poprzednich wersji (`a269ad8`).
- Czytelniejsza etykieta numeru/wersji oferty na liscie (`63330bb`).
- Przycisk "aktualizuj pozycje" w kalkulatorze robi sie niebieski w trybie edycji pozycji
  (`5120371`); kalkulator sam scrolluje na gore przy wejsciu w edycje pozycji zestawienia (`d80d9bc`).
- PGL bazowe pokazywane/wpisywane zawsze w EUR (decyzja handlowcow — `5362bad`);
  `app/admin/ustawienia/page.tsx` odpowiednio zmienione.

## 3. NIE ruszaj sekretow, konfiguracji ani lockfile'a
- Nie zmieniaj `DATABASE_URL`, `JWT_SECRET`, `ABACUSAI_API_KEY`, `NEXTAUTH_SECRET` ani zadnych
  innych zmiennych srodowiskowych. Sprawdz tylko, ze `JWT_SECRET` w ogole istnieje — brak tej
  zmiennej celowo wywala start aplikacji (bez cichego fallbacku), to zachowanie z v1.3, nie regres.
- Nie nadpisuj i nie kasuj `.env` po stronie Abacusa (moje zrodlo go nie zawiera — celowo).
- Nie ruszaj `.abacus.donotdelete` — marker platformy, nie plik aplikacji.
- Projekt jedzie na **yarnie** (`.yarnrc.yml`) — w zrodle **nie ma** `package-lock.json` (celowo
  wyciety). Uzyj `yarn install`, nie `npm install`.
- Zignoruj `.env.example` jesli je nadpiszesz (placeholdery, nie prawdziwa konfiguracja).
- **Brak nowych zaleznosci.** `package.json` w zipie jest identyczny z produkcyjnym (wykresy w
  panelu Analiza korzystaja z bibliotek juz zainstalowanych w v1.5). Jesli `yarn install` chce
  cokolwiek dociagnac/zmienic w lockfile — pokaz mi to i zatrzymaj sie.

## 4. Migracja bazy danych — OBOWIAZKOWA, PRZED buildem

```
psql $DATABASE_URL -f migrations/018_offer_client_decision.sql
```

- Migracje `001`-`017` sa juz na produkcji (z deployu v1.5). Nie puszczaj ich ponownie (sa
  idempotentne, ale niepotrzebne).
- `018` jest **wylacznie dodajaca**: 4 kolumny `ADD COLUMN IF NOT EXISTS` na `offers` + 2
  `CREATE INDEX IF NOT EXISTS`. Idempotentna, bez `BEGIN/COMMIT` (same DDL). Bezpieczna do
  ponownego puszczenia. Nie modyfikuje ani nie kasuje zadnych istniejacych danych — historyczne
  oferty dostaja `client_decision = 'pending'` z DEFAULT.
- Konsekwencje pominiecia `018`:
  - **Cala lista ofert PADNIE** (`/offers`, `/senior`, `/admin/oferty` — `GET /api/offers` robi
    `SELECT o.client_decision, o.client_decision_at, o.client_decision_note`, blad `42703`).
  - Panel Analiza (`/analytics`, `GET /api/analytics`) i zapis decyzji
    (`POST /api/offers/[id]/decision`) — 500.
- Weryfikacja po migracji (musi przejsc bez bledu):
  ```sql
  SELECT client_decision, client_decision_at, client_decision_by, client_decision_note
  FROM offers LIMIT 1;
  \d offers
  -- oczekiwane indeksy: idx_offers_client_decision, idx_offers_client_decision_at
  ```

## 5. Zbuduj — ale NIE wdrazaj automatycznie na produkcje
- Sprawdz najpierw, ze `JWT_SECRET` istnieje w srodowisku — bez niego build/start celowo padnie.
- Uruchom `yarn install`, potem migracje `018` (punkt 4), potem `next build`.
- Jesli build zglosi blad typow lub lintu, pokaz mi tresc bledu i **zatrzymaj sie** — nie obchodz
  bledu przez wylaczanie sprawdzania, nie "napraw" tego po swojemu. Czekaj na moja decyzje.
- Jesli build przejdzie czysto: **zastosuj zmiany w projekcie i zatrzymaj sie na tym etapie.**
  NIE klikaj/nie wywoluj samodzielnie "Redeploy" ani niczego rownowaznego, co wypycha to na zywy
  produkcyjny ruch. Ja sam przetestuje wersje w podgladzie/preview Abacusa i dopiero wtedy recznie
  kliknij Redeploy, gdy uznam, ze wszystko dziala.
- Potwierdz mi krotko: wynik builda (sukces/blad), czy migracja `018` przeszla bez bledu (wraz z
  wynikiem zapytan weryfikacyjnych z punktu 4), czy `yarn install` nie ruszyl lockfile'a, oraz ze
  **nie** kliknales Redeploy.

## 6. Checklist do mojego recznego testu w Abacusie (PRZED klikinieciem Redeploy)
Nie musisz tego robic Ty — to ja sprawdzam w przegladarce na podgladzie, zanim wdroze na zywo:
- logowanie nadal dziala (junior/senior/admin), token sesji nie jest odrzucany,
- **lista ofert** (`/offers`, `/senior`, `/admin/oferty`) laduje sie bez 500 — potwierdza, ze
  migracja `018` weszla,
- w nawigacji jest zakladka "Analiza" (📊) dla kazdej roli,
- panel Analiza: junior i senior widza TYLKO swoje oferty, admin widzi cala firme,
- KPI (tonaz zaoferowany / wygrany / przegrany / win rate), wykresy per typ stali / per klient /
  w czasie renderuja sie, zmiana zakresu dat i podstawy daty (utworzono/wyslano/decyzja) dziala,
- eksport tabeli ofert z panelu Analiza dziala,
- na ofercie **wyslanej** da sie zapisac decyzje klienta (won/lost) i cofnac ja do "pending";
  na ofercie nie-`sent` ta akcja jest niedostepna / zwraca 409,
- oferta z wieloma wersjami (`offer_N`, `offer_N.1`...) liczy sie w panelu **raz** (najnowsza
  wersja), nie wielokrotnie,
- kalkulator: zakladka PICKLED pokazuje pelna liste gatunkow (m.in. SAPH440, DD12),
- tryb "Wysoki kontrast" (🔲) dziala i w jasnym, i w **ciemnym** motywie, na wszystkich stronach,
- "Eksportuj do PDF" dziala z `/offers`, `/senior`, `/admin/oferty`, a dokument wychodzi w jezyku
  UI ustawionym przez handlowca (PL/EN/CS/DE), ceny koncowe zaokraglone w gore jak w v1.5,
- baner "edytujesz oferte X" pokazuje sie przy edycji istniejacej oferty; klik w karte oferty nie
  blokuje klikniec w wiersze poprzednich wersji,
- PGL bazowe w panelu ustawien admina jest w EUR; zmiana widoczna w kalkulatorze od razu,
- pozostale funkcje v1.5 (waluta EUR/PLN, numery ofert + szukanie, katalog klientow + kontakty,
  minimalna marza + bezposrednia wysylka juniora, wersjonowanie ofert, 3 typy stali
  PICKLED/TEARDROP/ZM) dzialaja jak przed deployem.

## 7. Nie-blokujace, swiadome decyzje (nie zglaszaj jako bledow)
- `MIN_PASSWORD_LENGTH = 4` (`lib/passwordPolicy.ts`) jest **celowa** decyzja biznesowa (dzial
  handlowy uzywa krotkich hasel) — NIE podnosic do 6 bez mojej wyraznej prosby.
- Import Excela (KTS/GPAO → kalkulator) nadal nie istnieje w kodzie — swiadomie odlozony,
  nie brakujacy plik.
- Uspiony Prisma/NextAuth w scaffoldzie — aktywny auth to JWT/`pg`, tak ma byc.
- Panel Analiza nie ma jeszcze wlasnych testow automatycznych — projekt nie ma harnessu,
  swiadomie odlozone (jak reszta).
