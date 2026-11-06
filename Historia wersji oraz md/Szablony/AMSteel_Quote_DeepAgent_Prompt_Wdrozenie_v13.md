# Prompt dla DeepAgent (AbacusAI) - wdrozenie v13 (v2.1 -> v2.2)
# Skok SREDNI: 2 nowe migracje (035, 036), JEDNA nowa zaleznosc (`puppeteer-core`),
# ZERO nowych wymaganych zmiennych srodowiskowych. Obie migracje sa bezpieczne przed i po nowym
# kodzie, ale puszczamy je PRZED buildem. KOPIA BAZY PRZED MIGRACJAMI JEST OBOWIAZKOWA.

Skopiuj ponizszy tekst do DeepAgent i dolacz zalaczony zip **`AMSteel_Quote_v2.2_deploy.zip`**
(spakowany z galezi `main`, commit `a03ae30`). Zip zawiera caly folder `nextjs_space` BEZ
`node_modules`, `.next`, `.next-verify`, `.env`, `.env.local` i `package-lock.json` (projekt
jedzie na yarnie, npm-owy lock miesza w instalacji).

**Stan wyjsciowy:** na produkcji (https://steelpricinghub.abacusai.app) jest **v2.1** (wdrozona
21.10.2026). Migracje `001`-`034` sa puszczone. **Ten deploy doklada migracje `035` i `036`** -
patrz punkt 4.

Lokalnie zweryfikowane przed spakowaniem: `next build` przechodzi czysto, 281/281 testow
(`vitest run`, 3 pominiete celowo) zielonych.

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
- **Silnik PDF (nowy katalog `lib/pdf/`):** `lib/pdf/abacusRenderer.ts`, `lib/pdf/errors.ts`,
  `lib/pdf/localRenderer.ts`, `lib/pdf/offerHtml.ts`, `lib/pdf/pageOptions.ts`,
  `lib/pdf/renderPdf.ts`.
- **Kalkulator / oferty:** `components/ItemSortButton.tsx`, `lib/gradeValidation.ts`,
  `lib/itemSort.ts`, `lib/offerTerms.ts`.
- **Migracje:** `migrations/035_kam_hop_change_pgl.sql`, `migrations/036_value_rule_ceo.sql`.
- **Tylko deweloperskie (nie uruchamiaj):** `scripts/compare-pdf-renderers.ts`,
  `docs/ai-assistant-plan.md`.
- **Testy:** `tests/gradeValidation.test.ts`, `tests/itemNotes.test.ts`, `tests/itemSort.test.ts`,
  `tests/offerTerms.test.ts`, `tests/pdfRenderer.test.ts`, `tests/sheetQuantity.test.ts`,
  `tests/smallQuantitySurcharge.test.ts` (tylko deweloperskie, `next build` je typuje).

### Pliki zmienione (podmien 1:1)
`.env.example`, `next.config.js`, `package.json`, `app/admin/handlowcy/page.tsx`,
`app/admin/oferty/page.tsx`, `app/api/generate-pdf/route.ts`, `app/api/teams/route.ts`,
`app/brand-theme.css`, `app/offers/page.tsx`, `app/senior/page.tsx`, `components/Calculator.tsx`,
`components/NumericField.tsx`, `components/OfferItemsPreview.tsx`,
`components/PaymentTermPicker.tsx`, `components/QuoteValidityPicker.tsx`,
`components/TransportPanel.tsx`, `components/ZestawienieRow.tsx`,
`components/priceBook/ChangeLog.tsx`, `components/priceBook/FallbacksSection.tsx`,
`components/priceBook/PriceBookPanel.tsx`, `lib/access/routing.ts`, `lib/access/workflow.ts`,
`lib/calculatorData.ts`, `lib/chartColors.ts`, `lib/currency.ts`, `lib/excelExport.ts`,
`lib/itemNotes.ts`, `lib/numberFormat.ts`, `lib/offerItemValidation.ts`,
`lib/offerVersionDiff.ts`, `lib/offerVersionDiffFormat.ts`, `lib/pdfLabels.ts`,
`lib/priceBook.ts`, `lib/priceBookValidation.ts`, `lib/pricingEngine.ts`, `lib/quoteValidity.ts`,
`lib/serverPdf.ts`, `lib/translations.ts`, `tests/access/approvalState.test.ts`,
`tests/access/specCases.test.ts`, `tests/offerItemValidation.test.ts`.

**Bez zmian:** `tsconfig.json`, `middleware.ts`, `.yarnrc.yml`, migracje `001`-`034`.

`scripts/seed.ts` to lokalny seed developerski - **NIE uruchamiaj seeda na produkcji**.

## 2. Co konkretnie zmienia ta wersja (kontekst, zebys nie "poprawial" tego inaczej)

**A) Warunki dostawy przy kazdej pozycji oferty:**
- Do wyboru CPT (z dostawa, transport w cenie), FCA i FCA Krakow (odbior wlasny, transport
  0 EUR/t, tony pozycji nie wchodza do tonazu, z ktorego liczy sie stawka ciezarowki).
  Wybor warunku jest obowiazkowy. Zapisywane w JSON oferty - bez nowej kolumny.
- Usuniete pole "Odbior wlasny" calej oferty. Stare oferty z tym polem po otwarciu dostaja FCA
  na kazdej pozycji; stare pozycje DAP przy edycji przechodza na CPT. To zamierzone.
- Serwer odrzuca zapis oferty, w ktorej pozycja FCA / CPT ma transport wiekszy od 0, oraz pozycje
  bez gatunku.
- Kwota transportu (EUR/t) przeniesiona do panelu "Trasa i transport", rozbicie kosztu w walucie
  oferty.

**B) Kalkulator:** pole "Ilosc (arkusze)" polaczone z tonazem, doplata za mala ilosc (do 4,9 t
+10 EUR/t, od 5 do 9,9 t +5 EUR/t; stawki w `/admin/cennik`, zapisywane w istniejacym cenniku -
bez migracji), sortowanie listy pozycji (tylko widok), waga lezki z gestoscia 8,25, waznosc oferty
w dniach (zapis nadal w godzinach), poprawione pole Gatunek.

**C) Uprawnienia (migracje 035 i 036):**
- 035: KAM i Head of Projects moga zmieniac baze PGL (`flow_roles.can_change_pgl_base = true`).
- 036: nowe reguly `F1_VALUE_N3` i `F2_VALUE_N3` - oferta o wartosci powyzej 1 000 000 EUR
  wymaga zatwierdzenia przez CEO (N+3) w obu flow. **Oferta juz zatwierdzona powyzej tego progu
  wraca po wdrozeniu do walidacji** - to zamierzone, nie "naprawiaj" tego.
- Obie migracje dzialaja tylko raz (znacznik w `schema_backfills`), wiec pozniejsza edycja
  admina w panelu Uprawnienia nie zostanie cofnieta.

**D) PDF oferty:** nowe warunki sprzedazy w stopce, numer oferty w naglowku zamiast nazwy,
warunki dostawy / atest / opakowanie podane raz w warunkach oferty, termin platnosci "od dnia
wystawienia faktury". Generowanie **nadal przez zewnetrzne API Abacus (`ABACUSAI_API_KEY`)**.

**E) Nowy, opcjonalny silnik PDF (`lib/pdf/`, zaleznosc `puppeteer-core`):** przygotowanie na
czas po odejsciu z AbacusAI. Wlacza go dopiero zmienna `PDF_RENDERER=local`. **Na Abacusie NIE
ustawiaj `PDF_RENDERER` ani `PDF_CHROME_PATH`** - bez nich aplikacja uzywa Abacusa jak dotad.
`puppeteer-core` NIE pobiera przegladarki przy instalacji i na Abacusie nie jest uzywany.
Wpis `serverComponentsExternalPackages: ['puppeteer-core']` w `next.config.js` jest celowy.

**F) Interfejs:** "Panel Menedzera" zamiast panelu seniora, teksty pod nowe role, czerwony kolor
odrzucenia przez klienta, poprawione logo ArcelorMittal w naglowku, plakietka wersji v2.2.

## 3. NIE ruszaj sekretow, konfiguracji ani lockfile'a
- Nie zmieniaj `DATABASE_URL`, `JWT_SECRET`, `ABACUSAI_API_KEY`, `NEXTAUTH_SECRET`,
  `GEOAPIFY_API_KEY` ani zadnych innych zmiennych srodowiskowych. Sprawdz tylko, ze
  `JWT_SECRET` w ogole istnieje - brak tej zmiennej celowo wywala start aplikacji.
- **Brak nowych wymaganych zmiennych srodowiskowych.** `PDF_RENDERER` i `PDF_CHROME_PATH`
  z `.env.example` zostaja NIEUSTAWIONE (patrz 2E).
- Nie nadpisuj i nie kasuj `.env` po stronie Abacusa. Nie ruszaj `.abacus.donotdelete`.
- Projekt jedzie na **yarnie** (`.yarnrc.yml`) - uzyj `yarn install`, nie `npm install`.
- **Jedna nowa zaleznosc:** `package.json` rozni sie od v2.1 TYLKO wpisem
  `"puppeteer-core": "24.43.1"` w `dependencies`. Sprawdz to diffem `package.json`. Jesli roznica
  jest wieksza - pokaz mi ja i zatrzymaj sie.
- Duzy diff `yarn.lock` po `yarn install` jest oczekiwany (lockfile na Abacusie wraca do bazowego
  stanu platformy co sesje) - zatrzymaj sie tylko, jesli `package.json` rozni sie inaczej niz wyzej.
- Sekcja `"resolutions": { "@types/react": "18.2.22" }` w `package.json` zostaje - nie usuwaj.

## 4. Migracje bazy danych - 035 i 036, PRZED buildem nowego kodu

**Krok 0 - KOPIA BAZY (obowiazkowa).** Zrob pelny backup produkcyjnej bazy (`pg_dump`) i potwierdz
mi, ze sie udal (nazwa pliku, rozmiar).

**Krok 1 - weryfikacja stanu v2.1** (tylko odczyt, musi przejsc bez bledu):
```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'offers' AND column_name = 'created_by';          -- created_by (migracja 033)
SELECT key FROM schema_backfills ORDER BY key;
SELECT f.code AS flow, r.code AS role, fr.can_change_pgl_base
  FROM flow_roles fr JOIN roles r ON r.id = fr.role_id JOIN flows f ON f.id = fr.flow_id
 WHERE r.code IN ('KAM', 'HOP') ORDER BY 1, 2;
SELECT seed_key, threshold FROM approval_rules WHERE criterion = 'offer_value_eur' ORDER BY seed_key;
SELECT code FROM hierarchy_levels WHERE code = 'N+3';                -- musi zwrocic 1 wiersz
```
Jesli ktorekolwiek zwroci blad albo ostatnie nie zwroci wiersza - **zatrzymaj sie i pokaz mi to**.
Wyniki trzeciego i czwartego zapytania pokaz mi (chce wiedziec, co bylo przed migracjami).

**Krok 2 - migracje, po kolei, kazda osobno, `psql $DATABASE_URL -v ON_ERROR_STOP=1 -f migrations/<plik>`:**

| # | Plik | Co robi | Jesli sie nie wykona |
|---|------|---------|----------------------|
| 1 | `035_kam_hop_change_pgl.sql` | KAM i HOP dostaja `can_change_pgl_base = true` we wszystkich swoich flow | bez bledu - KAM / HOP bez tego uprawnienia nie zmienia PGL bazy w kalkulatorze |
| 2 | `036_value_rule_ceo.sql` | reguly `F1_VALUE_N3` i `F2_VALUE_N3`: wartosc oferty > 1 000 000 EUR -> CEO (N+3) | bez bledu - zadna oferta nie trafia do CEO z powodu wartosci |

Zasady:
- Obie sa w transakcji, z blokada (`pg_advisory_xact_lock`) i znacznikiem w `schema_backfills`
  (`seed_035_kam_hop_change_pgl`, `seed_036_value_rule_ceo`) - ponowne uruchomienie nic nie zmienia.
- Pliki ustawiaja `client_encoding = 'UTF8'` (polskie teksty w 036) - nie usuwaj tego.
- Jesli KTORAKOLWIEK zwroci blad - **zatrzymaj sie natychmiast**, nie poprawiaj SQL-a, pokaz mi
  pelna tresc bledu.

**Krok 3 - weryfikacja po migracjach** (tylko odczyt):
```sql
SELECT key FROM schema_backfills
 WHERE key IN ('seed_035_kam_hop_change_pgl', 'seed_036_value_rule_ceo');   -- 2 wiersze
SELECT f.code AS flow, r.code AS role, fr.can_change_pgl_base
  FROM flow_roles fr JOIN roles r ON r.id = fr.role_id JOIN flows f ON f.id = fr.flow_id
 WHERE r.code IN ('KAM', 'HOP') ORDER BY 1, 2;                              -- wszedzie true
SELECT seed_key, operator, threshold, unit FROM approval_rules
 WHERE seed_key IN ('F1_VALUE_N3', 'F2_VALUE_N3');                          -- 2 wiersze, >, 1000000, EUR
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
- Potwierdz mi krotko: backup OK (nazwa, rozmiar), wyniki zapytan z kroku 1 i 3, ktore migracje
  przeszly, diff `package.json` (tylko `puppeteer-core`), ze `PDF_RENDERER` NIE jest ustawiony,
  ze katalog `lib/pdf/` ma 6 plikow, wynik builda, oraz ze **nie** kliknales Redeploy.

## 6. Checklist do mojego recznego testu w Abacusie (PRZED kliknieciem Redeploy)
- plakietka wersji pokazuje **v2.2**,
- kalkulator: przy pozycji do wyboru CPT / FCA / FCA Krakow; bez wyboru "Dodaj do zestawienia"
  pokazuje czerwony komunikat; CPT pokazuje wiersz Transport i panel "Trasa i transport",
  FCA / FCA Krakow daja transport 0; kwota transportu jest w panelu, w walucie oferty,
- pole "Ilosc (arkusze)": 100 arkuszy 2 x 1500 x 3000 mm HRS = 7,065 t,
- doplata za mala ilosc: 3 t daje +10 EUR/t w cenie koncowej; stawki widoczne w `/admin/cennik`,
- pozycji bez gatunku nie da sie dodac; wpisanie pelnej nazwy gatunku (np. P355GH) + Tab wybiera go,
- waznosc oferty: przyciski 1 / 2 / 5 / 7 dni i Niestandardowy,
- konto KAM moze zmienic PGL baze; obnizenie idzie do Head of Projects,
- oferta powyzej 1 000 000 EUR wymaga CEO (N+3); sprawdz w `/admin/oferty`, czy zatwierdzone
  wczesniej oferty powyzej progu wrocily do walidacji (oczekiwane),
- `/admin/handlowcy`: "Dodaj handlowca" ma wybor flow i roli, pola nie wypelniaja sie danymi admina,
- PDF oferty (nadal przez Abacus): numer oferty w naglowku, nowe warunki sprzedazy w stopce z
  linkami, "Warunki dostawy: CPT, <miasto>" albo "FCA Krakow (odbior wlasny)", termin platnosci
  "od dnia wystawienia faktury"; PDF z listy ofert ma te same linijki co z kalkulatora,
- stara oferta zapisana z "Odbiorem wlasnym" otwiera sie z FCA na kazdej pozycji i transportem 0,
- pozostale funkcje v2.1 (flow/role/akceptacje, branding, historia wersji, Analiza, transport,
  PGL kwartalny) dzialaja jak przed deployem.

## 7. Nie-blokujace, swiadome decyzje (nie zglaszaj jako bledow)
- `puppeteer-core` i `lib/pdf/localRenderer.ts` sa na Abacusie nieuzywane - to przygotowanie na
  przeprowadzke na wlasny serwer. Nie usuwaj ich i nie wlaczaj.
- Zatwierdzone oferty powyzej 1 000 000 EUR wracaja do walidacji - zamierzone (036).
- Pozycje DAP sprzed tej wersji otwieraja sie i przy edycji przechodza na CPT - zamierzone.
- Doplata za mala ilosc nie zmienia zapisanych ofert, dopoki pozycja nie zostanie edytowana.
- Tlumaczenia warunkow sprzedazy EN / CZ / DE czekaja na weryfikacje biznesu.
- `users.role` zostaje w bazie, ale logika jej nie czyta.
- `MIN_PASSWORD_LENGTH = 4` - celowa decyzja biznesowa, nie podnosic.
- `GEOAPIFY_API_KEY` nadal opcjonalny - fallback na Nominatim + OSRM zamierzony.
- Testy (`tests/`, `vitest`) sa tylko deweloperskie - nie dodawaj ich do builda ani startu.
- Wysylka oferty do klienta nadal tylko zmienia status - realny e-mail swiadomie odlozony.
