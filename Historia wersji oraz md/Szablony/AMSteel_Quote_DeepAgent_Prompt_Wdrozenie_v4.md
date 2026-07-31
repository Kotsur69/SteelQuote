# Prompt dla DeepAgent (AbacusAI) — wdrozenie v4 (pelny v1.3: waluta, ustawienia, numery
# ofert, CS/DE, przyciski admina + bugfixy: JWT hardening, pola liczbowe, toggle krag/arkusz)

Skopiuj ponizszy tekst do DeepAgent i dolacz zip `AMSteel_Quote_v1.3_deploy.zip` (folder
`nextjs_space`, caly projekt) LUB folder z repo (https://github.com/Kotsur69/SteelQuote,
commit `e2c7c91` + niezacommitowane jeszcze poprawki pol liczbowych i toggle'a z tego zipa).

---

Cel: chce wdrozyc do dzialajacej aplikacji (https://steelpricinghub.abacusai.app) nowa wersje
CALEGO projektu, ktora dostarczam w zalaczonym zipie. To NIE nowa aplikacja, tylko kolejna wersja
istniejacego projektu Next.js 14 (App Router, zwykly pg, JWT przez jose, bcryptjs). Zasada
nadrzedna: honoruj dokladnie moje pliki. Nie przepisuj logiki, nie zmieniaj stylu, nie "poprawiaj"
kodu, nie dopisuj niczego od siebie. Podmien tresc plikow jeden do jednego na te, ktore dostarczam.

## 1. Jak podmienic pliki

Zalaczony zip to caly folder `nextjs_space` (bez `node_modules`, `.next`, `.env`, `.env.local`,
`package-lock.json` — te celowo wyciete, patrz punkt 3). Traktuj go jako **zrodlo plikow do
nadpisania** istniejacego projektu, NIGDY jako zamiennik calego katalogu na serwerze — tzn.
nadpisz kazdy plik, ktory jest w zipie, jego zawartoscia z zipa, ale NIE kasuj z serwera plikow,
ktorych w zipie nie ma (np. `.env`, `.abacus.donotdelete`), bo ich tam celowo brakuje.

Jesli jakas sciezka po twojej stronie rozni sie od mojej, zachowaj MOJA wersje pliku i tylko
dopasuj lokalizacje do istniejacej struktury projektu.

## 2. Co konkretnie zmienia ta wersja (kontekst, zebys nie "poprawial" tego inaczej)

Ta wersja laczy dwie partie zmian, ktore nigdy jeszcze nie poszly na produkcje:

**A) Funkcje v1.3 (najwieksza czesc diffu):**
- Waluta EUR/PLN — `lib/currency.ts`, `contexts/CurrencyContext.tsx`. EUR jest jedynym zrodlem
  prawdy, PLN to wylacznie warstwa prezentacji (przelicznik z kursu w ustawieniach). Juz zapisane
  oferty maja zamrozony snapshot ceny — zmiana kursu/ustawien PozNIEJ nigdy nie dotyka starych ofert.
- Panel ustawien admina (`app/admin/ustawienia/page.tsx`, `app/api/settings/route.ts`) — kurs
  EUR/PLN, baza PLN, transport bazowy. Tylko admin moze zapisywac, inne role tylko odczytuja.
- Numery ofert + nazwa zastepcza + szukanie (`lib/search.ts`, `lib/useOfferSearch.ts`,
  `components/OfferSearchInput.tsx`) — kazda oferta ma trwaly numer (`offer_<ID>`), nazwa jest
  opcjonalna, szukanie dziala po ID/nazwie/fragmencie na wszystkich trzech listach ofert.
- Jezyki CS/DE dolozone obok PL/EN.
- Rozszerzone uprawnienia admina (edycja/wysylka/duplikat wlasnych i cudzych ofert, zrownane
  z senior), przyciski zatwierdz/odrzuc/edytuj w panelu admina.

**B) Bugfixy nalozone na powyzsze (swiezsze, jeszcze nietestowane na zywo):**
- `lib/jwtSecret.ts` + `lib/auth.ts` + `middleware.ts`: JWT_SECRET juz nie ma cichego fallbacku
  na `'default-secret'` — jesli zmienna srodowiskowa zniknie, aplikacja ma **rzucic blad przy
  starcie**, a nie dzialac dalej z podatnym na sfalszowanie sekretem. To zamierzone i krytyczne —
  NIE dodawaj z powrotem zadnego fallbacku "dla bezpieczenstwa startu".
- Widoczny warning w kalkulatorze, gdy grubosc blachy wypada poza tabela doplat bazowych SSC i
  uzywana jest wartosc szacunkowa. Czysto UI, brak zmian w logice cen.
- Usuniety martwy kod: `lib/calc-data.ts`, `requireRoleFromToken` w `lib/rbac.ts`, klientowy
  `lib/pdfGenerator.ts` (PDF generuje sie po stronie serwera, `lib/serverPdf.ts` — nietkniete),
  3 nieuzywane zaleznosci w `package.json` (`jspdf`, `jspdf-autotable`, `@types/jspdf`).
- **NOWY `components/NumericField.tsx` + wszystkie 8 pol liczbowych w kalkulatorze** (grubosc,
  szerokosc, dlugosc, PGL bazowe, marza %, doplata, transport, tonaz): naprawiony bug, przez ktory
  pole po wyczyszczeniu do pustego stringa natychmiast wracalo do "0" i nie dalo sie go wpisac na
  nowo (klasyczny `parseInt(e.target.value) || 0` na kontrolowanym inpucie Reacta), oraz przypadki
  zostawiania niepoprawnego tekstu w polu (np. "06799") mimo poprawnego stanu wewnetrznego. Logika
  liczenia ceny sie NIE zmienila — to wylacznie poprawka warstwy input/UI.
- Etykieta trybu KRAG/ARKUSZ w kalkulatorze pokazuje teraz zawsze aktywny tryb (kolor + tekst +
  podpis), zamiast domyslnie wygladac jak "wylaczone" — handlowcy maja od razu widziec, w ktorym
  trybie sa.

## 3. NIE ruszaj sekretow, konfiguracji ani lockfile'a
- Nie zmieniaj `DATABASE_URL`, `JWT_SECRET`, `ABACUSAI_API_KEY`, `NEXTAUTH_SECRET` ani zadnych
  innych zmiennych srodowiskowych.
- Nie nadpisuj i nie kasuj `.env` w projekcie po stronie Abacusa (moj zip go nie zawiera — to
  celowe, sekrety zyja tylko u Ciebie).
- Nie ruszaj `.abacus.donotdelete` — to marker platformy, nie plik aplikacji.
- Projekt jedzie na **yarnie** (`.yarnrc.yml`) — w zipie **nie ma** `package-lock.json` (celowo
  wyciety). Uzyj `yarn install`, nie `npm install`.
- Zignoruj `.env.example` jesli je nadpiszesz (to tylko placeholdery, nie prawdziwa konfiguracja).

## 4. Migracje bazy danych — OBOWIAZKOWE, W TEJ KOLEJNOSCI, PRZED buildem

```
psql $DATABASE_URL -f migrations/007_create_settings_table.sql
psql $DATABASE_URL -f migrations/008_offer_display_name.sql
```

- Migracje 001-006 juz sa uruchomione na produkcji (idempotentne, ponowne puszczenie bezpieczne,
  ale niepotrzebne).
- Bez **007** API ustawien zwroci wartosci domyslne (nie wywali sie), ale panel ustawien admina
  nie zapisze zmian kursu/cen bazowych.
- Bez **008** aplikacja **PADNIE** — kod SELECT-uje kolumne `display_name`, ktorej nie bedzie:
  lista ofert, panel seniora i panel admina zwroca 500. To migracja obowiazkowa, nie opcjonalna.
- Obie migracje sa idempotentne (`IF NOT EXISTS`) — bezpieczne do ponownego puszczenia, jesli
  z jakiegos powodu czesciowo juz przeszly.
- Weryfikacja po migracjach: `SELECT display_name FROM offers LIMIT 1;` oraz
  `SELECT * FROM settings LIMIT 1;` musza przejsc bez bledu.

## 5. Zbuduj — ale NIE wdrazaj automatycznie na produkcje
- Uruchom `yarn install`, potem obie migracje z punktu 4, potem `next build`.
- Jesli build zglosi blad typow lub lintu, pokaz mi tresc bledu i **zatrzymaj sie** — nie obchodz
  bledu przez wylaczanie sprawdzania, nie "napraw" tego po swojemu. Czekaj na moja decyzje.
- Jesli build przejdzie czysto: **zastosuj zmiany w projekcie i zatrzymaj sie na tym etapie.**
  NIE klikaj/nie wywoluj samodzielnie przycisku "Redeploy" ani niczego rownowaznego, co wypycha to
  na zywy produkcyjny ruch. Ja sam przetestuje wersje w podgladzie/preview Abacusa i dopiero wtedy
  recznie kliknij Redeploy, gdy uznam, ze wszystko dziala.
- Potwierdz mi krotko: wynik builda (sukces/blad), czy obie migracje przeszly bez bledu, oraz ze
  **nie** kliknales Redeploy.

## 6. Checklist do mojego recznego testu w Abacusie (PRZED kliknieciem Redeploy)
Nie musisz tego robic Ty — to ja sprawdzam w przegladarce na podgladzie, zanim wdrozze na zywo:
- logowanie nadal dziala (junior/senior/admin), token sesji nie jest odrzucany,
- kalkulator: da sie wyczyscic pole SZEROKOSC/DLUGOSC (i pozostale 6 pol liczbowych) do pusta i
  wpisac nowa wartosc bez odbijania do "0",
- toggle KRAG/ARKUSZ w kalkulatorze pokazuje jasno, ktory tryb jest aktywny,
- przelacznik EUR/PLN w kalkulatorze przelicza poprawnie, stare oferty zachowuja zamrozona cene,
- panel ustawien admina (kurs, baza PLN, transport) zapisuje sie i widac zmiane w kalkulatorze,
- szukanie ofert po ID / nazwie / fragmencie dziala na `/offers`, `/senior`, `/admin/oferty`,
- kalkulator: grubosc poza zakresem tabeli SSC (np. 30mm) pokazuje widoczny warning o szacunkowej
  doplacie, cena nadal liczy sie poprawnie,
- "Eksportuj do PDF" i eksport do Excela nadal dzialaja,
- panel admina: zatwierdzanie/odrzucanie/edycja ofert (senior i admin) dziala jak wczesniej.
