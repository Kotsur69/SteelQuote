# Prompt dla DeepAgent (AbacusAI) — wdrozenie v10 (v1.8 → v1.9)
# Skok maly: ZERO migracji, ZERO nowych zaleznosci, ZERO nowych zmiennych srodowiskowych.
# Tylko podmiana plikow + kilka nowych. Glowne nowosci: poprawka XSS w ostrzezeniach
# kalkulatora, termin platnosci jako przyciski dni (0/2/15/30/45/60/90/Inny), okres waznosci
# jako przyciski Q1-Q4/"Ten miesiac"/"Niestandardowy" z blokada minionych kwartalow,
# plakietka "inna cena PGL w wybranym kwartale", poprawka zanizonej stawki transportu,
# plakietka kosztu transportu, firma + SAP ID na liscie ofert (wyszukiwanie i sortowanie),
# responsywnosc na telefonie w pionie, filtry/plakietki w Analizie i panelu Handlowcy,
# poprawki PDF (zawijanie waluty, ucinanie tonazu), instalacja PWA na Androidzie.

Skopiuj ponizszy tekst do DeepAgent i dolacz zalaczony zip **`AMSteel_Quote_v1.9_deploy.zip`**
(spakowany z galezi `main`, commit `0b50f30` — kolejne commity na `main` zmieniaja tylko
dokumentacje poza `nextjs_space`, wiec zawartosc zipa = to, co jest na GitHubie:
https://github.com/Kotsur69/SteelQuote/tree/main). Zip zawiera caly folder `nextjs_space`
BEZ `node_modules`, `.next`, `.env`, `.env.local` i `package-lock.json` (projekt jedzie na
yarnie, npm-owy lock miesza w instalacji).

**Stan wyjsciowy:** na produkcji (https://steelpricinghub.abacusai.app) jest **v1.8** —
harmonogram kwartalny PGL, zlom w %, termin platnosci i migracje `021`-`023` sa juz wdrozone,
migracje `001`-`023` puszczone. **Ten deploy NIE dokłada zadnej migracji** — tylko podmienia
pliki i dodaje kilka nowych. Kopia bazy nie jest wymagana (schemat sie nie zmienia), ale
jesli Abacus robi ja automatycznie — niech zrobi.

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

### Nowe pliki w tej wersji (nie istnialy w v1.8 — maja powstac)
- `components/PaymentTermPicker.tsx` — przyciski terminu platnosci (0/2/15/30/45/60/90/Inny)
- `components/OfferValidityPicker.tsx` — przyciski okresu waznosci (Q1-Q4, "Ten miesiac", "Niestandardowy")
- `components/PwaInstallBanner.tsx` — plakietka instalacji aplikacji na ekranie logowania (tylko Android)
- `public/manifest.json` — manifest PWA
- `public/sw.js` — minimalny service worker (pusty handler `fetch`, **zero cache'owania** — kazde zadanie idzie prosto do sieci; istnieje tylko po to, zeby Chrome na Androidzie uznal aplikacje za instalowalna)
- `public/icon-192.png`, `public/icon-512.png`, `public/icon-512-maskable.png` — ikony aplikacji
- `docs/mobile-portrait-fix-plan.md` — notatka developerska, nie wplywa na build

### Pliki zmienione (podmien 1:1)
`app/admin/handlowcy/page.tsx`, `app/admin/klienci/page.tsx`, `app/admin/oferty/page.tsx`,
`app/analytics/page.tsx`, `app/api/admin/offers/route.ts`, `app/api/generate-pdf/route.ts`,
`app/api/offers/route.ts`, `app/api/senior/offers/route.ts`, `app/layout.tsx`,
`app/offers/page.tsx`, `app/page.tsx`, `app/senior/page.tsx`, `components/AdminLayout.tsx`,
`components/Calculator.tsx`, `components/ClientPaymentTermsPanel.tsx`,
`components/Navigation.tsx`, `components/TransportPanel.tsx`, `components/ZestawienieRow.tsx`,
`lib/analytics.ts`, `lib/analyticsQuery.ts`, `lib/pdfLabels.ts`, `lib/quarterUtils.ts`,
`lib/serverPdf.ts`, `lib/translations.ts`, `scripts/seed.ts`.

**Bez zmian w tej wersji** (zostaja jak w v1.8 — to nie przeoczenie): `middleware.ts`,
`package.json`, `next.config.js`, `.env.example`, caly katalog `migrations/`.

`scripts/seed.ts` zmienil tylko nazwy kont testowych w lokalnym seedzie developerskim —
**NIE uruchamiaj seeda na produkcji** (nigdy nie byl czescia deployu).

## 2. Co konkretnie zmienia ta wersja (kontekst, zebys nie "poprawial" tego inaczej)

**A) Bezpieczenstwo — XSS w ostrzezeniach kalkulatora:**
- Komunikaty "grubosc/szerokosc poza zakresem tabeli" byly wstawiane przez
  `dangerouslySetInnerHTML` bez oczyszczenia, wiec spreparowana wartosc zapisana w danych oferty
  mogla wykonac sie jako kod u osoby otwierajacej oferte (np. senior/admin przy akceptacji).
  Wartosci sa teraz escapowane (`formatWarning` w `lib/translations.ts`). Nie zamieniaj tego na
  inny mechanizm.

**B) Termin platnosci jako przyciski dni (bez migracji — kolumny z `023` juz sa):**
- Para pol dat "od/do" zastapiona przyciskami liczby dni: 0 ("Przedplata"), 2, 15, 30, 45, 60,
  90 oraz "Inny" (dowolna wartosc 0-365, ten sam limit co `CHECK` z migracji `023`). Dotyczy
  kalkulatora oraz panelu "Klienci" u admina i seniora.
- Stopka PDF: "Termin platnosci: N dni." albo "Warunki platnosci: przedplata." (dla 0); brak
  wyboru = dotychczasowa formulka "wg ustalen indywidualnych". Linia "Waznosc oferty: Xh od
  daty wystawienia" liczona dynamicznie jako dni × 24.
- Nowa oferta bez wybranego klienta dostaje domyslnie 2-dniowy termin i okres "Ten miesiac".

**C) Okres waznosci jako przyciski + blokada minionych kwartalow:**
- "Wazna od/do" ma przyciski Q1-Q4 wybranego roku, "Ten miesiac" oraz "Niestandardowy"
  (surowe pola dat). Wybor kwartalu dobiera PGL dokladnie jak dotychczas robily to wpisane daty.
- Dla biezacego roku przyciski minionych kwartalow sa ukryte (trwajacy kwartal zostaje).
- Gdy wybrany kwartal NIE jest biezacym i ma inna zaplanowana cene PGL, pojawia sie
  informacyjna plakietka (niczego nie blokuje).

**D) Transport:**
- **Poprawka ceny:** stawka €/t pozycji juz dodanych do zestawienia byla zanizana, bo tonaz do
  podzialu ryczaltu za ciezarowke obejmowal takze ilosc wpisana w formularzu kolejnej,
  jeszcze niedodanej pozycji (np. trasa do 100 km: ok. 157 €/t zamiast ok. 320 €/t). Teraz
  pozycje juz dodane licza sie tylko z tonazu zatwierdzonego.
- Plakietka "Koszt transportu" w naglowku Zestawienia (suma dla pozycji w zestawieniu).
- Naglowek "Trasa i transport" jest wyraznie klikalnym przyciskiem (pogrubienie, ramka, akcent).

**E) Lista ofert:**
- Pod numerem oferty linia z firma klienta i numerem SAP (placeholder, gdy brak danych).
- Wyszukiwanie i sortowanie po firmie klienta i SAP ID na "Moje oferty" oraz w panelach
  seniora i admina (w dwoch ostatnich sortowanie pojawia sie po raz pierwszy; u seniora kolejka
  do recenzji zostaje zawsze na gorze).
- Powod odrzucenia/przegranej skrocony do plakietki statusu obok numeru oferty (pelna tresc w
  tooltipie).

**F) Analiza i panel Handlowcy:**
- Zamykalne plakietki aktywnych filtrow w Analizie (pasek zbiorczy + przy panelu + przy
  eksporcie Excela).
- Przelacznik roli nad rankingiem "Handlowcy" w Analizie (filtruje juz pobrane dane, bez
  dodatkowego zapytania).
- Zakladki roli z licznikami w panelu "Handlowcy" admina; plakietka z nazwiskiem handlowca na
  liscie "Oferty" admina, gdy lista jest do niego zawezona.

**G) Poprawki PDF:**
- Symbol waluty nie zawija sie juz na osobna linie przy bardzo duzych kwotach (kolumna
  "Wartosc" 98px → 130px + `white-space: nowrap`).
- Kolumna tonazu 50px → 70px (kosztem "Uwag" 188px → 168px), bez ucinania cyfr.

**H) Responsywnosc na telefonie w pionie (~375 px):**
- Naglowek/nawigacja, pasek parametrow kalkulatora, panel doplat, tabela Zestawienia, lista
  ofert, panel Handlowcy i panel seniora — przejscie na jedna kolumne / przewijanie poziome
  zamiast zgniecionych siatek. Desktop bez zmian.

**I) PWA (instalacja na Androidzie):**
- `app/layout.tsx` dostaje `manifest: '/manifest.json'` w metadanych; `/manifest.json`,
  `/sw.js` i ikony leza w `public/` i musza byc serwowane publicznie (middleware ich nie
  blokuje — nie dodawaj tam zadnych wyjatkow ani zmian).
- Plakietka "Zainstaluj aplikacje" tylko na ekranie logowania, tylko na Androidzie, znika po
  zalogowaniu i nie wraca przez 7 dni po "Nie teraz".
- Service worker **celowo nic nie cache'uje** — nie dodawaj workboxa, `next-pwa` ani strategii
  offline.

## 3. NIE ruszaj sekretow, konfiguracji ani lockfile'a
- Nie zmieniaj `DATABASE_URL`, `JWT_SECRET`, `ABACUSAI_API_KEY`, `NEXTAUTH_SECRET`,
  `GEOAPIFY_API_KEY` ani zadnych innych zmiennych srodowiskowych. Sprawdz tylko, ze
  `JWT_SECRET` w ogole istnieje — brak tej zmiennej celowo wywala start aplikacji.
- **Brak nowych zmiennych srodowiskowych w tej wersji.**
- Nie nadpisuj i nie kasuj `.env` po stronie Abacusa (moje zrodlo go nie zawiera — celowo).
- Nie ruszaj `.abacus.donotdelete` — marker platformy, nie plik aplikacji.
- Projekt jedzie na **yarnie** (`.yarnrc.yml`) — w zrodle **nie ma** `package-lock.json`
  (celowo wyciety). Uzyj `yarn install`, nie `npm install`.
- **Brak nowych zaleznosci.** `package.json` w zipie jest identyczny z produkcyjnym (v1.8).
  Jesli `yarn install` chce cokolwiek dociagnac/zmienic w lockfile — pokaz mi to i zatrzymaj
  sie.

## 4. Migracje bazy danych — BRAK w tej wersji
- Migracje `001`-`023` sa juz na produkcji. **Nie puszczaj zadnej migracji** — ani nowych
  (nie ma), ani ponownie starych.
- Szybka weryfikacja, ze baza jest w stanie v1.8 (musi przejsc bez bledu, to tylko odczyt):
  ```sql
  SELECT payment_term_days, scrap_pct FROM app_settings WHERE id = 1;
  SELECT payment_term_days FROM clients LIMIT 1;
  SELECT COUNT(*) FROM pgl_quarterly_prices;
  ```
  Jesli ktorekolwiek zapytanie zwroci blad (brak kolumny/tabeli) — **zatrzymaj sie i pokaz mi
  blad**, nie puszczaj migracji na wlasna reke.

## 5. Zbuduj — ale NIE wdrazaj automatycznie na produkcje
- Sprawdz najpierw, ze `JWT_SECRET` istnieje w srodowisku — bez niego build/start celowo
  padnie.
- Uruchom `yarn install`, potem zapytania weryfikacyjne z punktu 4, potem `next build`.
- Jesli build zglosi blad typow lub lintu, pokaz mi tresc bledu i **zatrzymaj sie** — nie
  obchodz bledu przez wylaczanie sprawdzania, nie "napraw" tego po swojemu. Czekaj na moja
  decyzje.
- Jesli build przejdzie czysto: **zastosuj zmiany w projekcie i zatrzymaj sie na tym etapie.**
  NIE klikaj/nie wywoluj samodzielnie "Redeploy" ani niczego rownowaznego, co wypycha to na
  zywy produkcyjny ruch. Ja sam przetestuje wersje w podgladzie/preview Abacusa i dopiero
  wtedy recznie kliknij Redeploy, gdy uznam, ze wszystko dziala.
- Potwierdz mi krotko: wynik builda (sukces/blad), wynik zapytan weryfikacyjnych z punktu 4,
  czy `yarn install` nie ruszyl lockfile'a, ze `public/manifest.json`, `public/sw.js` i trzy
  ikony sa na miejscu, oraz ze **nie** kliknales Redeploy.

## 6. Checklist do mojego recznego testu w Abacusie (PRZED kliknieciem Redeploy)
Nie musisz tego robic Ty — to ja sprawdzam w przegladarce na podgladzie, zanim wdroze na zywo:
- logowanie nadal dziala (junior/senior/admin), token sesji nie jest odrzucany,
- plakietka wersji w aplikacji pokazuje **v1.9**,
- termin platnosci: przyciski 0/2/15/30/45/60/90/Inny w kalkulatorze i w panelu "Klienci";
  nowa oferta startuje z "2" zaznaczonym i okresem "Ten miesiac"; PDF pokazuje "Termin
  platnosci: N dni." / "przedplata" oraz linie "Waznosc oferty: (N×24)h",
- okres waznosci: przyciski Q1-Q4 (miniony kwartal biezacego roku ukryty), "Ten miesiac",
  "Niestandardowy"; wybor kwartalu z inna zaplanowana cena PGL pokazuje plakietke informacyjna,
- transport: przy 1 pozycji w zestawieniu i wpisanej ilosci w formularzu nowej pozycji cena
  pozycji juz dodanej NIE zmienia sie; plakietka "Koszt transportu" w naglowku Zestawienia;
  naglowek "Trasa i transport" wyglada jak przycisk,
- lista ofert: firma + SAP pod numerem oferty, wyszukiwanie po firmie/SAP, sortowanie
  Firma/SAP ID (takze u seniora i admina), powod odrzucenia/przegranej w plakietce statusu,
- Analiza: plakietki filtrow da sie zamknac; przelacznik roli nad rankingiem Handlowcy;
  panel Handlowcy admina ma zakladki roli z licznikami,
- PDF z kwota > 1 000 000 € i duzym tonazem: waluta nie zawija sie, cyfry tonazu nie sa ucinane,
- telefon w pionie: kalkulator, zestawienie, lista ofert i panel seniora sa czytelne, nic nie
  wychodzi poza ekran,
- Android (Chrome): na ekranie logowania pojawia sie plakietka instalacji; po instalacji
  aplikacja startuje z wlasna ikona; `/manifest.json` i `/sw.js` otwieraja sie bez logowania,
- pozostale funkcje v1.8 (harmonogram PGL, auto-migracja nieaktualnego PGL, zlom %, gatunek
  jednorazowy, wlasny odbior, drag-and-drop zestawienia, zespoly seniora, transport z trasy)
  dzialaja jak przed deployem.

## 7. Nie-blokujace, swiadome decyzje (nie zglaszaj jako bledow)
- `MIN_PASSWORD_LENGTH = 4` (`lib/passwordPolicy.ts`) jest **celowa** decyzja biznesowa
  (dzial handlowy uzywa krotkich hasel) — NIE podnosic do 6 bez mojej wyraznej prosby.
- `GEOAPIFY_API_KEY` nadal opcjonalny/niedodany — swiadome; fallback na Nominatim + OSRM
  jest zamierzony.
- Service worker bez cache'owania i bez trybu offline — swiadome (patrz 2I).
- Import Excela (KTS/GPAO → kalkulator) nadal nie istnieje w kodzie — swiadomie odlozony.
- Wysylka oferty do klienta to nadal tylko zmiana statusu na "wyslana" — realna wysylka
  e-mailem/PDF do klienta swiadomie odlozona.
- Uspiony Prisma/NextAuth oraz zdublowane pliki danych kalkulatora (`calc-data.ts` /
  `calculatorData.ts`) — do uporzadkowania, swiadomie odlozone. Aktywny auth to JWT/`pg`.
- Brak testow automatycznych — projekt nie ma harnessu, swiadomie odlozone.
- `middleware.ts`, `package.json` i `migrations/` identyczne jak w v1.8 — to nie przeoczenie.
