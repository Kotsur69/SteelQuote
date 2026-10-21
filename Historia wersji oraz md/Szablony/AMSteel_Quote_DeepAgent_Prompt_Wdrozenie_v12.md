# Prompt dla DeepAgent (AbacusAI) - wdrozenie v12 (v2.0 -> v2.1)
# Skok SREDNI: 2 nowe migracje (033, 034), nowy wyglad aplikacji (branding ArcelorMittal),
# nowy szablon PDF, ZERO nowych zaleznosci, ZERO nowych zmiennych srodowiskowych.
# Migracja 033 MUSI isc PRZED nowym kodem. KOPIA BAZY PRZED MIGRACJAMI JEST OBOWIAZKOWA.

Skopiuj ponizszy tekst do DeepAgent i dolacz zalaczony zip **`AMSteel_Quote_v2.1_deploy.zip`**
(spakowany z galezi `main`, commit `65bc745`). Zip zawiera caly folder `nextjs_space` BEZ
`node_modules`, `.next`, `.next-verify`, `.env`, `.env.local` i `package-lock.json` (projekt
jedzie na yarnie, npm-owy lock miesza w instalacji).

**Stan wyjsciowy:** na produkcji (https://steelpricinghub.abacusai.app) jest **v2.0** (wdrozona
13.10.2026). Migracje `001`-`032` sa puszczone. **Ten deploy doklada migracje `033` i `034`** -
patrz punkt 4.

Lokalnie zweryfikowane przed spakowaniem: `next build` przechodzi czysto, 134/134 testow
(`vitest run`) zielonych, migracje 033 i 034 puszczone na lokalnej bazie.

---

Cel: chce wdrozyc do dzialajacej aplikacji (https://steelpricinghub.abacusai.app) nowa wersje
CALEGO projektu, ktora dostarczam w zalaczonym zipie. To NIE nowa aplikacja, tylko kolejna wersja
istniejacego projektu Next.js 14 (App Router, zwykly `pg`, JWT przez `jose`, `bcryptjs`). Zasada
nadrzedna: **honoruj dokladnie moje pliki**. Nie przepisuj logiki, nie zmieniaj stylu, nie
"poprawiaj" kodu, nie dopisuj niczego od siebie. Podmien tresc plikow jeden do jednego na te, ktore
dostarczam.

## 1. Jak podmienic pliki

Zalaczony zip to caly `nextjs_space`. Traktuj go jako **zrodlo plikow do nadpisania**
istniejacego projektu, NIGDY jako zamiennik calego katalogu na serwerze - nadpisz kazdy plik,
ktory jest w zrodle, jego zawartoscia, ale NIE kasuj z serwera plikow, ktorych tam nie ma
(np. `.env`, `.abacus.donotdelete`), bo ich tam celowo brakuje. **W tej wersji nic nie kasujemy.**

Jesli jakas sciezka po twojej stronie rozni sie od mojej, zachowaj MOJA wersje pliku i tylko
dopasuj lokalizacje do istniejacej struktury projektu.

### Nowe pliki w tej wersji (maja powstac)
- **Branding ArcelorMittal:** `app/brand-theme.css`, katalog `public/brand/` (`logo-color.svg`,
  `logo-white.svg`, `am-shapes.png`, `fonts/GilroyW05-Regular.woff2`,
  `fonts/GilroyW05-RegularItalic.woff2`, `fonts/GilroyW05-SemiBold.woff2`,
  `fonts/GilroyW05-SemiBoldItalic.woff2`). Pliki binarne (woff2, png) skopiuj bajt w bajt.
- **Oferty / historia wersji:** `components/OfferChangeBadge.tsx`,
  `components/OfferItemsPreview.tsx`, `lib/offerVersionDiff.ts`, `lib/offerVersionDiffFormat.ts`.
- **Waznosc oferty:** `components/QuoteValidityPicker.tsx`, `lib/quoteValidity.ts`.
- **Cennik:** `components/priceBook/BulkDeltaControl.tsx`.
- **Migracje:** `migrations/033_offer_version_author.sql`,
  `migrations/034_payment_term_default_30.sql`.
- **Testy:** `tests/offerVersionDiff.test.ts`, `tests/priceBookBulkDelta.test.ts`,
  `tests/quoteValidity.test.ts` (tylko deweloperskie, `next build` je typuje).

### Pliki zmienione (podmien 1:1)
`app/admin/oferty/page.tsx`, `app/api/admin/offers/route.ts`, `app/api/generate-pdf/route.ts`,
`app/api/offers/[id]/duplicate/route.ts`, `app/api/offers/[id]/route.ts`,
`app/api/offers/route.ts`, `app/api/senior/offers/route.ts`, `app/globals.css`,
`app/layout.tsx`, `app/offers/page.tsx`, `app/senior/page.tsx`, `components/Calculator.tsx`,
`components/PaymentTermPicker.tsx`, `components/ZestawienieRow.tsx`,
`components/access/SimulatorPanel.tsx`, `components/priceBook/MatrixGrid.tsx`,
`components/priceBook/PriceBookPanel.tsx`, `components/priceBook/draft.ts`,
`lib/access/ruleEngine.ts`, `lib/currency.ts`, `lib/i18n/access/cs.ts`,
`lib/i18n/access/de.ts`, `lib/i18n/access/en.ts`, `lib/i18n/access/pl.ts`,
`lib/i18n/access/types.ts`, `lib/offerVersions.ts`, `lib/pdfLabels.ts`, `lib/serverPdf.ts`,
`lib/theme-context.tsx`, `lib/themeVars.ts`, `lib/translations.ts`, `lib/useDarkMode.ts`,
`tests/access/specCases.test.ts`.

**Bez zmian:** `package.json`, `next.config.js`, `tsconfig.json`, `middleware.ts`,
`.env.example`, `.yarnrc.yml`, migracje `001`-`032`.

`scripts/seed.ts` to lokalny seed developerski - **NIE uruchamiaj seeda na produkcji**.

## 2. Co konkretnie zmienia ta wersja (kontekst, zebys nie "poprawial" tego inaczej)

**A) Autor kazdej wersji oferty (migracja 033):**
- Nowa kolumna `offers.created_by` - kto zapisal dana wersje (tworca albo edytujacy recenzent).
  `user_id` nadal oznacza wlasciciela oferty i sie nie zmienia.
- Przy kazdej wersji oferty (Moje oferty, Oferty w panelu admina, Weryfikacja) jest krotka
  etykieta z najwazniejszymi zmianami; po kliknieciu pelna lista stara -> nowa wartosc z autorem.
- Wersje zapisane przed migracja nie maja autora (`NULL`) - to oczekiwane.

**B) Waznosc oferty w godzinach i termin platnosci z klienta (migracja 034):**
- W kalkulatorze zamiast wyboru terminu platnosci sa przyciski "Waznosc oferty": 24h (domyslnie),
  48h, Niestandardowy (liczba godzin). Zapisywane tylko w JSON oferty
  (`offer_data.quoteValidityHours`) - bez nowej kolumny.
- Termin platnosci pobierany z ustawien klienta (`clients.payment_term_days`), a gdy klient go
  nie ma - z `app_settings.payment_term_days`, ktory migracja 034 ustawia na 30 dni.
- Regula akceptacji "waznosc oferty > 48h" liczona z wybranych godzin.

**C) Admin: podglad pozycji oferty** w `/admin/oferty` (przycisk "N pozycji") oraz kolumny PGL
i marza (EUR/t i %) we wszystkich tabelach pozycji.

**D) Cennik doplat (`/admin/cennik`):** przy kazdej macierzy pole "Zmien kazda cene o X EUR/t"
i przycisk "Zastosuj do wszystkich macierzy". Zmienia tylko szkic, zapis jak dotad osobnym
przyciskiem. Bez zmian w bazie.

**E) Zestawienie kalkulatora:** marza ponizej minimum z Ustawien oznaczona ⚠️ i czerwonym tlem.

**F) Branding ArcelorMittal (tylko wyglad):**
- Tryb jasny = wariant V6 Aurora, tryb ciemny = V3 Midnight, logo ArcelorMittal, font Gilroy
  (`app/brand-theme.css` + `public/brand/`). Nakladka CSS uzywa celowo `!important` i selektorow
  po klasach - nie "porzadkuj" tego.
- Przelacznik Jasny/Ciemny steruje klasa `dark` na `<html>` - naprawiony blad, w ktorym zmieniala
  sie tylko czesc ekranu.

**G) PDF oferty - szablon nr 8:** A4 **pionowo** (wczesniej poziomo), logo AM w prawym gornym
rogu, font Gilroy osadzony z `public/brand/fonts` jako base64. Tresc, kolumny, waluty i 4 jezyki
bez zmian. Generowanie nadal przez zewnetrzne API Abacus (`ABACUSAI_API_KEY`) - nie zmieniaj tego.

## 3. NIE ruszaj sekretow, konfiguracji ani lockfile'a
- Nie zmieniaj `DATABASE_URL`, `JWT_SECRET`, `ABACUSAI_API_KEY`, `NEXTAUTH_SECRET`,
  `GEOAPIFY_API_KEY` ani zadnych innych zmiennych srodowiskowych. Sprawdz tylko, ze
  `JWT_SECRET` w ogole istnieje - brak tej zmiennej celowo wywala start aplikacji.
- **Brak nowych zmiennych srodowiskowych w tej wersji.**
- Nie nadpisuj i nie kasuj `.env` po stronie Abacusa. Nie ruszaj `.abacus.donotdelete`.
- Projekt jedzie na **yarnie** (`.yarnrc.yml`) - uzyj `yarn install`, nie `npm install`.
- **Brak nowych zaleznosci** - `package.json` bez zmian wzgledem v2.0. Jesli `yarn install`
  chce zmienic lockfile - pokaz mi to i zatrzymaj sie.
- Sekcja `"resolutions": { "@types/react": "18.2.22" }` w `package.json` zostaje - nie usuwaj.

## 4. Migracje bazy danych - 033 i 034, PRZED buildem nowego kodu

**Krok 0 - KOPIA BAZY (obowiazkowa).** Zrob pelny backup produkcyjnej bazy (`pg_dump`) i potwierdz
mi, ze sie udal (nazwa pliku, rozmiar).

**Krok 1 - weryfikacja stanu v2.0** (tylko odczyt, musi przejsc bez bledu):
```sql
SELECT COUNT(*) FROM lost_reasons;
SELECT COUNT(*) FROM price_book_entries;
SELECT payment_term_days FROM app_settings WHERE id = 1;
SELECT COUNT(*) FROM clients WHERE payment_term_days IS NOT NULL;
```
Jesli ktorekolwiek zwroci blad - **zatrzymaj sie i pokaz mi blad**. Wyniki trzeciego i
czwartego zapytania pokaz mi (034 nadpisze globalny termin na 30 dni - chce wiedziec, co bylo).

**Krok 2 - migracje, po kolei, kazda osobno, `psql $DATABASE_URL -f migrations/<plik>`:**

| # | Plik | Co robi | Jesli sie nie wykona |
|---|------|---------|----------------------|
| 1 | `033_offer_version_author.sql` | kolumna `offers.created_by` (nullable, FK do `users`, `ON DELETE SET NULL`) | **brak fallbacku** - kazda lista ofert (`/offers`, `/admin/oferty`, `/senior`) i kazdy zapis oferty zwraca 500 |
| 2 | `034_payment_term_default_30.sql` | domyslny i globalny termin platnosci = 30 dni (`app_settings`) | bez bledu - aplikacja uzywa starej wartosci globalnej (np. 7 dni) dla klientow bez wlasnego terminu |

Zasady:
- **033 PRZED nowym kodem** - stary kod v2.0 tej kolumny nie czyta, wiec puszczenie jej
  wczesniej jest bezpieczne; odwrotna kolejnosc wywala listy ofert.
- 033 jest w transakcji i idempotentna (`ADD COLUMN IF NOT EXISTS`). 034 mozna puscic
  ponownie bez skutkow ubocznych. Klientow z wlasnym terminem 034 nie rusza.
- Jesli KTORAKOLWIEK zwroci blad - **zatrzymaj sie natychmiast**, nie poprawiaj SQL-a, pokaz mi
  pelna tresc bledu.

**Krok 3 - weryfikacja po migracjach** (tylko odczyt):
```sql
SELECT column_name, is_nullable FROM information_schema.columns
 WHERE table_name = 'offers' AND column_name = 'created_by';     -- created_by | YES
SELECT payment_term_days FROM app_settings WHERE id = 1;          -- 30
```
Pokaz mi wyniki.

## 5. Zbuduj - ale NIE wdrazaj automatycznie na produkcje
- Sprawdz najpierw, ze `JWT_SECRET` istnieje w srodowisku.
- Kolejnosc: punkt 4 (backup, weryfikacja, migracje, weryfikacja) -> podmiana plikow ->
  `yarn install` -> `next build`.
- Jesli build zglosi blad typow lub lintu, pokaz mi tresc bledu i **zatrzymaj sie** - nie
  obchodz bledu przez wylaczanie sprawdzania, nie "naprawiaj" po swojemu.
- Jesli build przejdzie czysto: **zastosuj zmiany w projekcie i zatrzymaj sie.** NIE klikaj
  "Redeploy" ani niczego rownowaznego. Sam przetestuje podglad i dopiero wtedy recznie kliknie
  Redeploy.
- Potwierdz mi krotko: backup OK, wyniki zapytan z kroku 1 i 3, ktore migracje przeszly, ze
  `yarn install` nie zmienil lockfile'a, ze pliki z `public/brand/` sa na miejscu (podaj ich
  rozmiary), wynik builda, oraz ze **nie** kliknales Redeploy.

## 6. Checklist do mojego recznego testu w Abacusie (PRZED kliknieciem Redeploy)
- plakietka wersji pokazuje **v2.1**,
- nowy wyglad: logo ArcelorMittal, font Gilroy; przelacznik Jasny/Ciemny zmienia CALY ekran
  (jasny = pastelowy gradient, ciemny = grafit), wybor zostaje po odswiezeniu, ekran logowania
  w nowym stylu,
- listy ofert (`/offers`, `/admin/oferty`, `/senior`) laduja sie bez bledu; zapis i edycja
  oferty dziala; przy wersjach widac etykiete zmian i autora (nowe wersje),
- `/admin/oferty`: przycisk "N pozycji" rozwija pozycje z PGL i marza,
- kalkulator: przyciski Waznosc oferty 24h / 48h / Niestandardowy; termin platnosci pokazany
  z klienta (domyslnie 30 dni); oferta > 48h wymaga akceptacji N+2 (Flow 1),
- Zestawienie: marza ponizej minimum ma ⚠️ i czerwone tlo,
- `/admin/cennik`: "Zmien kazda cene o" +5 przesuwa wszystkie ceny macierzy o 5 EUR/t w szkicu,
  zapis zapisuje, log zmian sie pojawia,
- PDF oferty: A4 pionowo, szablon 8, logo AM, font Gilroy, kwoty z separatorem tysiecy,
  stopka "Waznosc oferty: 24h ..." i "Termin platnosci: N dni od otrzymania faktury",
- pozostale funkcje v2.0 (flow/role/akceptacje, powody przegranej, renegocjacja, Analiza,
  transport, PGL kwartalny) dzialaja jak przed deployem.

## 7. Nie-blokujace, swiadome decyzje (nie zglaszaj jako bledow)
- Wersje ofert sprzed migracji 033 nie maja autora - oczekiwane.
- Stare oferty zachowuja swoj zapisany termin platnosci / wyliczenie waznosci.
- `brand-theme.css` uzywa `!important` i selektorow atrybutowych - celowa nakladka na istniejace
  klasy, nie refaktoruj.
- `users.role` zostaje w bazie, ale logika jej nie czyta.
- `MIN_PASSWORD_LENGTH = 4` - celowa decyzja biznesowa, nie podnosic.
- `GEOAPIFY_API_KEY` nadal opcjonalny - fallback na Nominatim + OSRM zamierzony.
- Testy (`tests/`, `vitest`) sa tylko deweloperskie - nie dodawaj ich do builda ani startu.
- Wysylka oferty do klienta nadal tylko zmienia status - realny e-mail swiadomie odlozony.
