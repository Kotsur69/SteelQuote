# Prompt dla DeepAgent (AbacusAI) - wdrozenie v2 (role + panel admina)

Skopiuj ponizszy tekst do DeepAgent i dolacz folder z plikami aplikacji (repo finance_calculator).

---

Cel: chce wdrozyc do dzialajacej aplikacji (https://steelpricinghub.abacusai.app) nowa wersje
plikow, ktora dostarczam. To rozbudowa istniejacego projektu Next.js 14 (App Router, zwykly pg,
JWT przez jose, bcryptjs), a NIE nowa aplikacja. Zasada nadrzedna: honoruj dokladnie moje pliki.
Nie przepisuj logiki, nie zmieniaj stylu, nie "poprawiaj" kodu. Podmien tresc plikow jeden do
jednego na te, ktore dostarczam.

## 1. Podmien / dodaj pliki (nadpisz istniejace ta sama sciezka)

Pliki nowe (dodaj):
- migrations/004_add_user_roles.sql
- migrations/005_add_offer_workflow.sql
- migrations/006_create_clients_table.sql
- src/lib/rbac.ts
- src/app/api/auth/me/route.ts
- src/app/api/offers/[id]/submit/route.ts
- src/app/api/offers/[id]/approve/route.ts
- src/app/api/offers/[id]/reject/route.ts
- src/app/api/offers/[id]/send/route.ts
- src/app/api/admin/users/route.ts
- src/app/api/admin/users/[id]/offers/route.ts
- src/app/api/admin/clients/route.ts
- src/app/api/admin/offers/route.ts
- src/components/AdminLayout.tsx
- src/app/admin/page.tsx
- src/app/admin/handlowcy/page.tsx
- src/app/admin/klienci/page.tsx
- src/app/admin/oferty/page.tsx

Pliki zmienione (nadpisz w calosci moja wersja):
- src/lib/auth.ts
- src/lib/translations.ts
- src/middleware.ts
- src/app/api/auth/login/route.ts
- src/app/api/offers/route.ts
- src/app/api/offers/[id]/route.ts
- src/app/api/offers/[id]/duplicate/route.ts
- src/components/Navigation.tsx
- src/components/Calculator.tsx
- src/app/offers/page.tsx

Jesli jakas sciezka po twojej stronie rozni sie od mojej, zachowaj MOJA wersje pliku i tylko
dopasuj lokalizacje do struktury projektu. Nie usuwaj innych, nieobjetych listą plikow.

## 2. NIE ruszaj sekretow ani konfiguracji srodowiska
- Nie zmieniaj DATABASE_URL, JWT_SECRET ani zadnych zmiennych srodowiskowych.
- Nie zmieniaj plikow konfiguracji hostingu/deploymentu.
- Zaleznosci sa juz w package.json (pg, jose, bcryptjs, jspdf). Nie dodaje nowych bibliotek.

## 3. Uruchom migracje bazy danych (po podmianie plikow, przed buildem)
Wykonaj na produkcyjnej bazie, dokladnie w tej kolejnosci, uzywajac istniejacego polaczenia:

  psql "$DATABASE_URL" -f migrations/004_add_user_roles.sql
  psql "$DATABASE_URL" -f migrations/005_add_offer_workflow.sql
  psql "$DATABASE_URL" -f migrations/006_create_clients_table.sql

Uwagi wazne:
- Migracja 005 zmienia klucz obcy offers.user_id z ON DELETE CASCADE na ON DELETE SET NULL
  i czyni user_id NULLable. To celowa, nieodwracalna zmiana (ochrona historii ofert). Zastosuj ja.
- Migracja 006 dziala w transakcji i wypisuje liczby kontrolne (ile ofert dostalo klienta,
  ilu klientow utworzono) a nastepnie sama robi COMMIT. Pokaz mi ten wynik. Stare kolumny
  client_* w offers zostaja - nie usuwaj ich.
- Wszystkie istniejace oferty dostaja status 'draft', a istniejacy uzytkownicy role 'junior'.

## 4. Wskaz konto administratora
Po migracji 004 nadaj role admin jednemu kontu (podam e-mail; domyslnie moje):

  UPDATE users SET role = 'admin' WHERE email = 'PODAJ_EMAIL_ADMINA';

Bez tego nikt nie wejdzie do panelu /admin (aplikacja nie ma rejestracji).

## 5. Zbuduj i wdroz
- Uruchom npm install (jesli trzeba) oraz next build.
- Jesli build zglosi blad typow lub lintu, pokaz mi tresc bledu i nie deployuj - nie obchodz
  bledu przez wylaczanie sprawdzania. Poczekaj na moja decyzje.
- Po udanym buildzie wdroz na https://steelpricinghub.abacusai.app.

## 6. Po wdrozeniu - szybki test
Potwierdz, ze:
- logowanie dziala, a dezaktywowane konto (is_active=false) nie moze sie zalogowac,
- junior widzi przycisk "Wyslij do weryfikacji", senior widzi "Wyslij do klienta" oraz
  moze zatwierdzac/odrzucac oferty do weryfikacji,
- rola admin widzi link "Panel Admina" i strony /admin (pulpit, handlowcy, klienci, oferty),
- w kalkulatorze po najechaniu na kod pakowania (S01, S03, S12, S13, SB2, SB3) pojawia sie opis.
