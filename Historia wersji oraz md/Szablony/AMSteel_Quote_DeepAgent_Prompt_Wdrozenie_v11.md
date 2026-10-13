# Prompt dla DeepAgent (AbacusAI) — wdrozenie v11 (v1.8 / v1.9 → v2.0)
# Skok DUZY: 9 nowych migracji (024-032), nowy model uprawnien (flow / role / poziomy N),
# edytowalny cennik doplat, zarzadzalne powody przegranej, 1 nowa zaleznosc deweloperska
# (vitest), ZERO nowych zmiennych srodowiskowych. Jeden plik do USUNIECIA (lib/rbac.ts).
# KOPIA BAZY PRZED MIGRACJAMI JEST OBOWIAZKOWA.

Skopiuj ponizszy tekst do DeepAgent i dolacz zalaczony zip **`AMSteel_Quote_v2.0_deploy.zip`**
(spakowany z galezi `feat/flows-v2`, commit `2792824`). Zip zawiera caly folder `nextjs_space`
BEZ `node_modules`, `.next`, `.next-verify`, `.env`, `.env.local` i `package-lock.json` (projekt
jedzie na yarnie, npm-owy lock miesza w instalacji).

**Stan wyjsciowy:** na produkcji (https://steelpricinghub.abacusai.app) jest **v1.8** albo
**v1.9** (v1.9 nie dokladala zadnej migracji, wiec schemat bazy jest w obu przypadkach ten sam).
Migracje `001`-`023` sa puszczone. **Ten deploy dokłada migracje `024`-`032`** — w scislej
kolejnosci, patrz punkt 4.

Lokalnie zweryfikowane przed spakowaniem: `next build` przechodzi czysto, 97/97 testow
(`vitest run`) zielonych, migracje 024-032 puszczone na lokalnej bazie.

---

Cel: chce wdrozyc do dzialajacej aplikacji (https://steelpricinghub.abacusai.app) nowa wersje
CALEGO projektu, ktora dostarczam w zalaczonym zipie. To NIE nowa aplikacja, tylko kolejna wersja
istniejacego projektu Next.js 14 (App Router, zwykly `pg`, JWT przez `jose`, `bcryptjs`). Zasada
nadrzedna: **honoruj dokladnie moje pliki**. Nie przepisuj logiki, nie zmieniaj stylu, nie
"poprawiaj" kodu, nie dopisuj niczego od siebie. Podmien tresc plikow jeden do jednego na te, ktore
dostarczam.

## 1. Jak podmienic pliki

Zalaczony zip to caly `nextjs_space`. Traktuj go jako **zrodlo plikow do nadpisania**
istniejacego projektu, NIGDY jako zamiennik calego katalogu na serwerze — nadpisz kazdy plik,
ktory jest w zrodle, jego zawartoscia, ale NIE kasuj z serwera plikow, ktorych tam nie ma
(np. `.env`, `.abacus.donotdelete`), bo ich tam celowo brakuje.

**JEDYNY wyjatek — usun ten plik z serwera:** `lib/rbac.ts` (stary model rol junior/senior/admin,
zastapiony przez `lib/access/*`; nic go juz nie importuje). Nic innego nie kasuj.

Jesli jakas sciezka po twojej stronie rozni sie od mojej, zachowaj MOJA wersje pliku i tylko
dopasuj lokalizacje do istniejacej struktury projektu.

### Nowe pliki w tej wersji (maja powstac)
- **Model uprawnien:** caly katalog `lib/access/` (`adminConfig.ts`, `adminMutations.ts`,
  `config.ts`, `context.ts`, `errors.ts`, `fieldGuards.ts`, `offerAccess.ts`, `orgChart.ts`,
  `routing.ts`, `ruleEngine.ts`, `scope.ts`, `types.ts`, `workflow.ts`), katalog
  `lib/i18n/access/` (`cs.ts`, `de.ts`, `en.ts`, `index.ts`, `pl.ts`, `types.ts`),
  `lib/useAccess.ts`, `lib/reviewMessages.ts`, `app/admin/dostep/page.tsx`,
  `app/api/admin/access/route.ts`, `app/api/admin/access/[resource]/route.ts`,
  `app/api/auth/flow/route.ts`, katalog `components/access/` (`FlowsPanel.tsx`,
  `RolesPanel.tsx`, `RulesPanel.tsx`, `SimulatorPanel.tsx`, `VisibilityPanel.tsx`, `ui.tsx`,
  `useAdminAccess.ts`), `docs/flows-v2-plan.md` (notatka, nie wplywa na build).
- **Cennik doplat:** `app/admin/cennik/page.tsx`, `app/api/price-book/route.ts`,
  `lib/priceBook.ts`, `lib/priceBookValidation.ts`, `lib/optionSelection.ts`,
  `lib/usePriceBook.ts`, katalog `components/priceBook/` (`ChangeLog.tsx`,
  `FallbacksSection.tsx`, `GradesSection.tsx`, `MatrixGrid.tsx`, `OptionsSection.tsx`,
  `PriceBookPanel.tsx`, `PriceCellInput.tsx`, `draft.ts`).
- **Powody przegranej:** `app/admin/powody-przegranej/page.tsx`,
  `app/api/admin/lost-reasons/route.ts`, `app/api/admin/lost-reasons/[code]/route.ts`,
  `app/api/lost-reasons/route.ts`, `lib/lostReasons.ts`, `lib/lostReasonValidation.ts`,
  `lib/lostReasonsAdminApi.ts`, `lib/lostReasonsDb.ts`, `lib/useLostReasons.ts`, katalog
  `components/lostReasons/` (`LabelFields.tsx`, `LostReasonsAdmin.tsx`, `ReasonRow.tsx`,
  `adminStrings.ts`), `components/analytics/LostReasonsPanel.tsx`.
- **Recenzja / UI:** `components/AdminSettingsShortcut.tsx`, `components/ApprovalBadges.tsx`,
  `components/Modal.tsx`, `components/OfferReviewBar.tsx`, `components/ReviewIssuesNotice.tsx`,
  `components/SalesPyramid.tsx`, `components/SeniorStatusTiles.tsx`,
  `components/ValidationNotice.tsx`, `lib/numberFormat.ts`, `lib/offerItemValidation.ts`.
- **Migracje:** `migrations/024_client_decision_reason.sql` ... `migrations/032_lost_reasons.sql`
  (9 plikow).
- **Testy:** `vitest.config.ts`, katalog `tests/` (8 plikow, w tym `tests/access/*` i
  `tests/fixtures/legacyPricingEngine.ts`). Nie uruchamiaja sie przy starcie aplikacji, ale
  `tsconfig.json` obejmuje `**/*.ts`, wiec `next build` je typuje — dlatego `vitest` jest
  w `devDependencies` (punkt 3).

### Pliki zmienione (podmien 1:1)
`app/admin/handlowcy/page.tsx`, `app/admin/oferty/page.tsx`, `app/admin/page.tsx`,
`app/admin/ustawienia/page.tsx`, `app/analytics/page.tsx`, `app/api/admin/clients/route.ts`,
`app/api/admin/contacts/route.ts`, `app/api/admin/offers/route.ts`,
`app/api/admin/users/[id]/offers/route.ts`, `app/api/admin/users/route.ts`,
`app/api/analytics/route.ts`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`,
`app/api/auth/me/route.ts`, `app/api/clients/contacts/route.ts`,
`app/api/clients/search/route.ts`, `app/api/generate-pdf/route.ts`,
`app/api/offers/[id]/approve/route.ts`, `app/api/offers/[id]/decision/route.ts`,
`app/api/offers/[id]/duplicate/route.ts`, `app/api/offers/[id]/reject/route.ts`,
`app/api/offers/[id]/route.ts`, `app/api/offers/[id]/send/route.ts`,
`app/api/offers/[id]/submit/route.ts`, `app/api/offers/route.ts`,
`app/api/senior/offers/route.ts`, `app/api/settings/pgl-history/route.ts`,
`app/api/settings/pgl-quarterly/route.ts`, `app/api/settings/route.ts`,
`app/api/settings/tariff/route.ts`, `app/api/signup/route.ts`, `app/api/teams/route.ts`,
`app/api/transport/route.ts`, `app/offers/page.tsx`, `app/senior/page.tsx`,
`components/AdminLayout.tsx`, `components/Calculator.tsx`, `components/Navigation.tsx`,
`components/NumericField.tsx`, `components/TransportPanel.tsx`, `components/ZestawienieRow.tsx`,
`lib/analytics.ts`, `lib/analyticsAggregate.ts`, `lib/analyticsFormat.ts`,
`lib/analyticsQuery.ts`, `lib/auth.ts`, `lib/calculatorData.ts`, `lib/currency.ts`,
`lib/itemNotes.ts`, `lib/offerReview.ts`, `lib/pricingEngine.ts`, `lib/serverPdf.ts`,
`lib/teams.ts`, `lib/translations.ts`, `middleware.ts`, `package.json`, `scripts/seed.ts`.

**Bez zmian:** `next.config.js`, `tsconfig.json`, `.env.example`, `.yarnrc.yml`, migracje
`001`-`023`.

`scripts/seed.ts` to lokalny seed developerski — **NIE uruchamiaj seeda na produkcji**.

## 2. Co konkretnie zmienia ta wersja (kontekst, zebys nie "poprawial" tego inaczej)

**A) Nowy model uprawnien: flow / role / poziomy (migracje 025-030) — NAJWAZNIEJSZE:**
- Sztywne role junior/senior/admin zastapione konfiguracja edytowana przez superusera w
  `/admin/dostep`: flow (`FLOW1` = DYSTR, `FLOW2` = PROJEKTY), poziomy hierarchii (N0 = tworca
  oferty, N+1..N+3, NPR = akceptant rownolegly), role per flow, reguly walidacji (marza, zmiana
  ceny bazowej, waznosc, wartosc oferty...) i macierz widocznosci ofert. Jest tez symulator.
- Wymagany poziom akceptacji oferty = MAKSIMUM po wszystkich regulach, ktore "odpalily".
  Akceptacja jest wazna 48 h, potem oferta jest walidowana ponownie. Wysyla tylko tworca.
- Migracja `029` przepina istniejace konta jednorazowo: `junior` → FLOW1 / Internal Front
  Office (IFO), `senior` → FLOW1 / Area Sales Manager (ASM; zespoly z `team_members` zostaja),
  `admin` → `users.is_superuser = true`. Wszystkie istniejace oferty → FLOW1; oferta czekajaca
  na akceptacje dostaje jeden krok N+1. Hasla, oferty i historia nietkniete. Kolumna
  `users.role` zostaje w bazie, ale logika jej juz nie czyta.
- Uzytkownik nalezacy do kilku flow przelacza sie miedzy nimi w naglowku (`/api/auth/flow`).
- `/senior` jest teraz panelem recenzji dla kazdego zalogowanego — pokazuje tylko oferty
  czekajace na JEGO poziom. `/admin` tylko dla superusera.

**B) Bezpieczenstwo (`middleware.ts`):**
- Kazde zmieniajace zadanie do `/api/*` (POST/PUT/PATCH/DELETE) z obcego `Origin` dostaje 403
  (obrona CSRF). Nie dodawaj wyjatkow.
- Dostep do `/admin` sprawdzany z flagi `su` w tokenie; kazda trasa `/api/admin` sprawdza
  `users.is_superuser` na swiezo w bazie.
- **Stare tokeny sesji nie maja flagi `su`** — po wdrozeniu kazdy (zwlaszcza admin) musi sie
  wylogowac i zalogowac ponownie. To oczekiwane, nie blad.
- Pozycje oferty sa walidowane po stronie serwera przy tworzeniu i edycji.

**C) Edytowalny cennik doplat (`/admin/cennik`, migracja 031):**
- Superuser edytuje kazda doplate per typ stali. W bazie trzymane sa TYLKO nadpisania
  (`price_book_entries`); efektywny cennik = wartosci domyslne z kodu + nadpisania. Lista
  gatunkow w `steel_grades` (gatunki sa wycofywane, nigdy kasowane), log zmian w
  `price_book_log`.
- Stare oferty sa zamrozone — trzymaja swoje wartosci, nowe ceny dzialaja tylko na nowe pozycje.

**D) Powody przegranej (`/admin/powody-przegranej`, migracje 024 + 032):**
- Oznaczenie oferty jako przegranej WYMAGA wyboru powodu. Lista edytowana przez superusera
  (4 jezyki, archiwizacja zamiast kasowania, wbudowany "Inne" zawsze ostatni i wymaga notatki).
- Analiza ma panel statystyk powodow przegranej.

**E) Recenzja i oferty:**
- Akceptacja/odrzucenie bezposrednio z kalkulatora, wyrazny pasek decyzji, powrot do listy,
  z ktorej przyszedles; plakietki stanu akceptacji; komunikat "ponizej wytycznych".
- Wyslane oferty otwieraja sie tylko do odczytu; przegrana oferte mozna renegocjowac jako nowa
  wersje.
- Gdy aktualne reguly wymagaja wyzszego poziomu niz ten, do ktorego oferta trafila, akceptacja
  jest przekierowana wyzej.
- Kafelki statusu dla weryfikatora, kolumny PGL i marza % w zestawieniu, piramida handlowcow
  (kto komu podlega), skrot do ustawien admina, zakladka "Dashboard" pierwsza dla recenzentow.

**F) Formatowanie liczb:**
- Separator tysiecy (spacja, np. `1 000 000`) w kazdej wyswietlanej kwocie i tonazu — w UI
  i w PDF. Nie zmieniaj na przecinki ani kropki.

## 3. NIE ruszaj sekretow, konfiguracji ani lockfile'a
- Nie zmieniaj `DATABASE_URL`, `JWT_SECRET`, `ABACUSAI_API_KEY`, `NEXTAUTH_SECRET`,
  `GEOAPIFY_API_KEY` ani zadnych innych zmiennych srodowiskowych. Sprawdz tylko, ze
  `JWT_SECRET` w ogole istnieje — brak tej zmiennej celowo wywala start aplikacji.
- **Brak nowych zmiennych srodowiskowych w tej wersji.**
- Nie nadpisuj i nie kasuj `.env` po stronie Abacusa. Nie ruszaj `.abacus.donotdelete`.
- Projekt jedzie na **yarnie** (`.yarnrc.yml`) — uzyj `yarn install`, nie `npm install`.
- **Jedna nowa zaleznosc, tylko deweloperska:** `vitest@^2.1.9` w `devDependencies` oraz skrypt
  `"test": "vitest run"`. `yarn install` dociagnie ja (zmiana w lockfile'u dotyczaca vitest i
  jego zaleznosci jest oczekiwana). Jesli `yarn install` chce zmienic cokolwiek INNEGO niz
  vitest i jego drzewo zaleznosci — pokaz mi to i zatrzymaj sie.
- `package.json` ma sekcje `"resolutions": { "@types/react": "18.2.22" }` (dopisana po
  pierwszym podejsciu do tego deployu, commit `d28d9ab`): `@types/react-dom@18.2.7` zalezy od
  `@types/react: "*"`, wiec swiezy `yarn install` zagniezdzal pod nim typy React 19 i
  `createPortal` w `components/Modal.tsx` nie przechodzil sprawdzania typow. Nie usuwaj jej.

## 4. Migracje bazy danych — 024 do 032, w tej kolejnosci

**Krok 0 — KOPIA BAZY (obowiazkowa).** Zrob pelny backup produkcyjnej bazy (`pg_dump`) i potwierdz
mi, ze sie udal. Migracja 029 przepina konta i oferty — bez kopii nie ma odwrotu.

**Krok 1 — weryfikacja stanu v1.8** (tylko odczyt, musi przejsc bez bledu):
```sql
SELECT payment_term_days, scrap_pct FROM app_settings WHERE id = 1;
SELECT COUNT(*) FROM pgl_quarterly_prices;
SELECT role, COUNT(*) FROM users GROUP BY role;
```
Jesli ktorekolwiek zwroci blad — **zatrzymaj sie i pokaz mi blad**. Wynik trzeciego zapytania
pokaz mi (to stan kont przed przepieciem).

**Krok 2 — migracje, po kolei, kazda osobno, `psql $DATABASE_URL -f migrations/<plik>`:**

| # | Plik | Co robi | Jesli sie nie wykona |
|---|------|---------|----------------------|
| 1 | `024_client_decision_reason.sql` | kolumna `offers.client_decision_reason` (kod powodu przegranej); dotychczas przegrane → `other` | oznaczanie przegranej i Analiza padaja (500) |
| 2 | `025_flows_roles_levels.sql` | tabele `flows`, `roles`, `hierarchy_levels`, `flow_roles`, `user_flow_roles`, `schema_backfills`; `users.is_superuser`, `users.last_flow_id` + seed | **aplikacja nie dziala** — logowanie i kazda trasa z uprawnieniami |
| 3 | `026_approval_rules.sql` | reguly walidacji `approval_rules` + seed | wysylka do akceptacji pada |
| 4 | `027_visibility_rules.sql` | macierz widocznosci `visibility_rules` + seed | listy ofert / Analiza padaja |
| 5 | `028_offer_flow_workflow.sql` | `offers.flow_id`, `offers.sent_by`, `offers.validation_snapshot`, tabela `offer_approval_steps` | akceptacje padaja |
| 6 | `029_backfill_legacy_roles.sql` | **jednorazowe** przepiecie kont i ofert (opis w 2A), potem `offers.flow_id NOT NULL` | nikt nie ma roli w zadnym flow — handlowcy nic nie zobacza, admin nie wejdzie do `/admin` |
| 7 | `030_flows_round2.sql` | ustalenia biznesu z 12.10: NPR zastepuje N+1/N+2, `roles.multi_flow`, waznosc akceptacji 48 h, CEO = N+3 we FLOW2 | model dziala wg starych zalozen (bledne poziomy akceptacji) |
| 8 | `031_price_book.sql` | `price_book_entries`, `steel_grades` (+ seed z kodu), `price_book_log` | kalkulator dziala na cenach domyslnych z kodu (bez bledu), zapis w `/admin/cennik` odrzucony (503) |
| 9 | `032_lost_reasons.sql` | tabela `lost_reasons` (seed: 7 starych powodow + `competitor_faster`), CHECK z 024 zamieniony na klucz obcy | aplikacja uzywa listy z kodu (bez bledu), zapis w `/admin/powody-przegranej` odrzucony |

Zasady:
- **Scisle w tej kolejnosci** — 026-030 zaleza od tabel z 025, 029 od 028, 032 od 024.
- Kazda migracja jest w transakcji i jest idempotentna (seedy i backfill chronione markerem w
  `schema_backfills`), wiec ponowne puszczenie niczego nie zdubluje. Mimo to puszczaj kazda raz.
- Jesli KTORAKOLWIEK zwroci blad — **zatrzymaj sie natychmiast**, nie puszczaj kolejnych, nie
  poprawiaj SQL-a, pokaz mi pelna tresc bledu.
- Migracje 026, 027, 030, 031, 032 zawieraja teksty z polskimi/czeskimi/niemieckimi znakami i
  same ustawiaja `client_encoding = 'UTF8'` — nie zmieniaj tego.

**Krok 3 — weryfikacja po migracjach** (tylko odczyt):
```sql
SELECT code FROM flows ORDER BY sort_order;                       -- FLOW1, FLOW2
SELECT key FROM schema_backfills ORDER BY key;                    -- m.in. legacy_roles_v2
SELECT COUNT(*) FROM users WHERE is_superuser;                    -- = liczba dawnych adminow
SELECT COUNT(*) FROM user_flow_roles;                             -- = liczba dawnych junior+senior
SELECT COUNT(*) FROM offers WHERE flow_id IS NULL;                -- 0
SELECT COUNT(*) FROM steel_grades;                                -- > 0
SELECT code FROM lost_reasons ORDER BY sort_order;                -- 8 kodow, 'other' ostatni
```
Pokaz mi wyniki.

## 5. Zbuduj — ale NIE wdrazaj automatycznie na produkcje
- Sprawdz najpierw, ze `JWT_SECRET` istnieje w srodowisku.
- Kolejnosc: podmiana plikow (+ usuniecie `lib/rbac.ts`) → `yarn install` → punkt 4 (backup,
  weryfikacja, migracje, weryfikacja) → `next build`.
- Jesli build zglosi blad typow lub lintu, pokaz mi tresc bledu i **zatrzymaj sie** — nie
  obchodz bledu przez wylaczanie sprawdzania, nie "naprawiaj" po swojemu.
- Jesli build przejdzie czysto: **zastosuj zmiany w projekcie i zatrzymaj sie.** NIE klikaj
  "Redeploy" ani niczego rownowaznego. Sam przetestuje podglad i dopiero wtedy recznie kliknie
  Redeploy.
- Potwierdz mi krotko: backup OK, wyniki zapytan z kroku 1 i 3, ktore migracje przeszly, czy
  `yarn install` zmienil lockfile tylko o vitest, ze `lib/rbac.ts` usuniety, wynik builda, oraz
  ze **nie** kliknales Redeploy.

## 6. Checklist do mojego recznego testu w Abacusie (PRZED kliknieciem Redeploy)
- logowanie dziala dla dawnego juniora, seniora i admina (po wylogowaniu starej sesji),
- plakietka wersji pokazuje **v2.0**,
- dawny admin wchodzi do `/admin`; `/admin/dostep` pokazuje flow, role, poziomy, reguly,
  widocznosc i symulator; **kontrola kompletnosci konfiguracji** — reguly bez progu nie
  odpalaja, trzeba je uzupelnic,
- dawny junior tworzy oferte i wysyla do akceptacji; dawny senior widzi ja w `/senior`,
  akceptuje z kalkulatora (pasek decyzji), tworca wysyla; wyslana oferta otwiera sie tylko do
  odczytu,
- oferta czekajaca na akceptacje przed deployem nadal da sie zaakceptowac (krok N+1 z 029),
- `/admin/cennik`: zmiana jednej doplaty zapisuje sie, pojawia w logu zmian i dziala w nowej
  pozycji kalkulatora; stara oferta ma niezmienione ceny,
- oznaczenie oferty jako przegranej bez powodu jest zablokowane; "Inne" wymaga notatki;
  `/admin/powody-przegranej` — dodanie i archiwizacja powodu; Analiza pokazuje statystyke powodow,
- przegrana oferta → renegocjacja tworzy nowa wersje,
- kwoty i tonaz wszedzie z separatorem tysiecy (`1 000 000`), takze w PDF,
- pozostale funkcje v1.8/v1.9 (harmonogram PGL, zlom %, transport z trasy, termin platnosci,
  okres waznosci, PWA, lista ofert z firma/SAP) dzialaja jak przed deployem.

## 7. Nie-blokujace, swiadome decyzje (nie zglaszaj jako bledow)
- `users.role` zostaje w bazie, ale logika jej nie czyta — usuniemy po potwierdzeniu modelu.
- Czesc progow regul moze byc pusta (`threshold IS NULL`) — swiadomie, uzupelnia superuser w
  `/admin/dostep`.
- `MIN_PASSWORD_LENGTH = 4` — celowa decyzja biznesowa, nie podnosic.
- `GEOAPIFY_API_KEY` nadal opcjonalny — fallback na Nominatim + OSRM zamierzony.
- Testy (`tests/`, `vitest`) sa tylko deweloperskie — nie dodawaj ich do builda ani startu.
- Wysylka oferty do klienta nadal tylko zmienia status — realny e-mail swiadomie odlozony.
- Uspiony Prisma/NextAuth i zdublowane pliki danych kalkulatora — swiadomie odlozone.
