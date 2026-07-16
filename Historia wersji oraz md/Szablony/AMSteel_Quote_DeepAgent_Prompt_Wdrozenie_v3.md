# Prompt dla DeepAgent (AbacusAI) — wdrozenie v3 (bugfixy: JWT fallback, surcharge warning, dead code)

Skopiuj ponizszy tekst do DeepAgent i dolacz folder `finance_calculator_deployed/nextjs_space`
z repo (https://github.com/Kotsur69/SteelQuote, commit `b3dc833`).

---

Cel: chce wdrozyc do dzialajacej aplikacji (https://steelpricinghub.abacusai.app) nowa wersje
plikow, ktora dostarczam. To NIE nowa aplikacja, tylko poprawki na istniejacym projekcie Next.js 14
(App Router, zwykly pg, JWT przez jose, bcryptjs). Zasada nadrzedna: honoruj dokladnie moje pliki.
Nie przepisuj logiki, nie zmieniaj stylu, nie "poprawiaj" kodu, nie dopisuj niczego od siebie.
Podmien tresc plikow jeden do jednego na te, ktore dostarczam.

## 1. Podmien / dodaj pliki (sciezki wzgledem korzenia projektu Next.js, NIE pod `src/`)

Plik nowy (dodaj):
- lib/jwtSecret.ts

Pliki zmienione (nadpisz w calosci moja wersja):
- lib/auth.ts
- middleware.ts
- lib/translations.ts
- components/Calculator.tsx
- lib/rbac.ts
- lib/pdfGenerator.ts
- package.json

Plik do usuniecia (juz nie istnieje w moim repo, martwy kod, zero importerow):
- lib/calc-data.ts

Jesli jakas sciezka po twojej stronie rozni sie od mojej, zachowaj MOJA wersje pliku i tylko
dopasuj lokalizacje do istniejacej struktury projektu. Nie usuwaj ani nie modyfikuj zadnych innych,
nieobjetych ta lista plikow.

## 2. Co konkretnie zmienia ta wersja (kontekst, zebys nie "poprawial" tego inaczej)
- `lib/jwtSecret.ts` + `lib/auth.ts` + `middleware.ts`: JWT_SECRET juz nie ma cichego fallbacku
  na `'default-secret'` — jesli zmienna srodowiskowa zniknie, aplikacja ma **rzucic blad przy
  starcie**, a nie dzialac dalej z podatnym na sfalszowanie sekretem. To zamierzone i krytyczne —
  NIE dodawaj z powrotem zadnego fallbacku "dla bezpieczenstwa startu".
- `lib/translations.ts` + `components/Calculator.tsx`: nowy widoczny warning w kalkulatorze, gdy
  grubosc blachy wypada poza tabela doplat bazowych SSC i uzywana jest wartosc szacunkowa (29 €/t).
  Czysto UI, brak zmian w logice cen.
- `lib/rbac.ts`: usunieta martwa, nieuzywana funkcja `requireRoleFromToken`. Funkcja `requireRole`
  (uzywana przez wszystkie route'y offer workflow) jest bez zmian.
- `lib/pdfGenerator.ts`: usuniety martwy generator PDF po stronie klienta (nieuzywany, zastapiony
  generacja PDF po stronie serwera w `app/api/generate-pdf/route.ts` + `lib/serverPdf.ts`, ktore NIE
  sa objete ta zmiana). Zostaje tylko interfejs `ClientInfo`, bo jest importowany w 4 miejscach.
- `package.json`: usuniete 3 nieuzywane zaleznosci — `jspdf`, `jspdf-autotable`, `@types/jspdf`.
  Realny generator PDF (server-side) ich nigdy nie uzywal.

## 3. NIE ruszaj sekretow, konfiguracji ani lockfile'a
- Nie zmieniaj `DATABASE_URL`, `JWT_SECRET`, `ABACUSAI_API_KEY`, `NEXTAUTH_SECRET` ani zadnych
  innych zmiennych srodowiskowych.
- Nie nadpisuj i nie kasuj `.env` w projekcie po stronie Abacusa (moj eksport z GitHuba go nie
  zawiera — to celowe, sekrety zyja tylko u Ciebie).
- Nie ruszaj `.abacus.donotdelete` — to marker platformy, nie plik aplikacji.
- Projekt jedzie na **yarnie** (`.yarnrc.yml`) — **zignoruj** `package-lock.json` z mojego eksportu,
  nie instaluj przez npm. Uzyj `yarn install` zeby zassac zmiany z `package.json` (usuniecie 3
  zaleznosci jspdf).
- Zignoruj tez `.env.example` (to tylko placeholdery, nie prawdziwa konfiguracja).

## 4. Migracje bazy danych — TA WERSJA ICH NIE MA
Diff tej wersji NIE rusza folderu `migrations/` ani `prisma/schema.prisma`. **Nie uruchamiaj zadnych
migracji ani seedow.** W bazie sa dane produkcyjne — jakakolwiek migracja bez mojej wyraznej,
osobnej prosby jest zabroniona.

## 5. Zbuduj — ale NIE wdrazaj automatycznie na produkcje
- Uruchom `yarn install` (jesli trzeba) oraz `next build`.
- Jesli build zglosi blad typow lub lintu, pokaz mi tresc bledu i **zatrzymaj sie** — nie obchodz
  bledu przez wylaczanie sprawdzania, nie "napraw" tego po swojemu. Czekaj na moja decyzje.
- Jesli build przejdzie czysto: **zastosuj zmiany w projekcie i zatrzymaj sie na tym etapie.**
  NIE klikaj/nie wywoluj samodzielnie przycisku "Redeploy" ani niczego rownowaznego, co wypycha to
  na zywy produkcyjny ruch. Ja sam przetestuje wersje w podgladzie/preview Abacusa i dopiero wtedy
  recznie kliknij Redeploy, gdy uznam, ze wszystko dziala.
- Potwierdz mi krotko: wynik builda (sukces/blad), liste plikow ktore faktycznie podmieniles, oraz
  ze **nie** kliknales Redeploy.

## 6. Checklist do mojego recznego testu w Abacusie (PRZED kliknieciem Redeploy)
Nie musisz tego robic Ty — to ja sprawdzam w przegladarce na podgladzie, zanim wdrozze na zywo:
- logowanie nadal dziala (junior/senior/admin), token sesji nie jest odrzucany,
- kalkulator: grubosc w normalnym zakresie (np. 4mm) — bez warninga, cena bez zmian,
- kalkulator: grubosc poza zakresem tabeli SSC (np. 30mm) — pojawia sie widoczny warning o
  szacunkowej doplacie 29 €/t, cena nadal liczy sie poprawnie,
- "Eksportuj do PDF" w kalkulatorze nadal generuje poprawny PDF (droga server-side, niezalezna od
  usunietego kodu),
- panel admina, zatwierdzanie/odrzucanie ofert (senior) dzialaja jak wczesniej — bez zmian logiki.
