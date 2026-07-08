# Plan rozbudowy — role handlowców + panel admina (SteelQuote / AMSteel Quote)

> Towarzyszy plikom: `AMSteel_Quote_Architektura_role_i_panel_admina.drawio` (diagram) i artifactowi z podglądem wizualnym.

## Kluczowe decyzje architektoniczne

1. **Role użytkownika** — nowa kolumna `users.role` (`junior` / `senior` / `admin`). Domyślnie `junior` dla istniejących kont (do ustalenia ręcznie kto jest senior/admin migracją danych).
2. **Status oferty** — nowa kolumna `offers.status` (`draft` / `pending_review` / `approved` / `rejected` / `sent`) + `reviewed_by`, `reviewed_at`, `rejection_reason`, `sent_at`.
3. **Miękkie usuwanie handlowców** — `users.is_active`, NIE hard delete. Obecny FK `offers.user_id ... ON DELETE CASCADE` jest niebezpieczny w nowym świecie: admin "usuwający" handlowca skasowałby całą jego historię ofert, której panel admina ma właśnie szukać. Trzeba zmienić na `ON DELETE SET NULL` albo (lepiej) w ogóle nie usuwać rekordu z bazy — tylko `is_active = false`, co blokuje logowanie, ale zachowuje historię i przypisanie ofert.
4. **Nowa tabela `clients`** — dziś dane klienta są wpisywane ręcznie do każdej oferty (kolumny `client_*` w `offers`). Żeby admin miał realną "bazę klientów", trzeba to wydzielić do osobnej tabeli + zmigrować istniejące dane + dodać `offers.client_id`. Stare kolumny zostają na przejście, potem można je wyczyścić.
5. **JWT** — payload musi nieść `role`, żeby middleware i API mogły sprawdzać uprawnienia bez dodatkowego zapytania do bazy przy każdym requeście (choć krytyczne operacje typu approve/reject i tak dociążone weryfikacją z bazy, żeby unieważniona/dezaktywowana rola nie żyła przez 24h tokena).

## Etapy i orientacyjny czas



| # | Etap | Szacowany czas |
|---|------|-----------------|
| 1 | Migracje DB: `role`, `status` + pola recenzji, tabela `clients`, migracja danych klientów, zmiana `ON DELETE` | 1–1.5 h |
| 2 | RBAC: JWT z rolą, `middleware.ts` (guard `/admin`), helper `requireRole()` używany w route handlerach | 1.5–2 h |
| 3 | Obieg oferty: endpointy `submit` / `approve` / `reject` / `send`, przyciski zależne od roli na `/offers`, badge statusu | 3–4 h |
| 4 | Panel admina — zarządzanie handlowcami (lista, dodawanie, dezaktywacja, zmiana roli) | 2–3 h |
| 5 | Panel admina — zarządzanie klientami (CRUD + migracja istniejących danych) | 2–3 h |
| 6 | Panel admina — przegląd wszystkich ofert (filtry: handlowiec / status / data, historia zaakceptowane/niezaakceptowane) | 2 h |
| 7 | *(opcjonalnie)* Wybór klienta z bazy w kalkulatorze zamiast ręcznego wpisywania | 1.5–2 h |
| 8 | Tłumaczenia PL/EN dla nowych ekranów, statusów, komunikatów | 1 h |
| 9 | Testy ręczne end-to-end (3 role, cały obieg oferty), aktualizacja `STAN_PROJEKTU.md` i raportu wersji 1.1 | 1–1.5 h |

**Razem (bez pkt. 7):** ok. 14–18 h. Z opcjonalnym wyborem klienta w kalkulatorze: ok. 16–20 h.

Rekomendowana kolejność: 1 → 2 → 3 (to jest szkielet, bez tego nic innego ma sensu) → 4 i 5 równolegle/dowolna kolejność → 6 → 8 → 9. Punkt 7 na końcu, jako usprawnienie.

## Otwarte pytania do rozstrzygnięcia przed startem

- Czy senior widzi *wszystkie* oferty `pending_review` w systemie, czy tylko konkretnych, przypisanych mu juniorów (brak dziś koncepcji "zespołu")? Plan zakłada wariant prostszy: senior widzi wszystkie oferty ze statusem `pending_review` od kogokolwiek.
- Czy po `reject` oferta wraca do `draft` automatycznie, czy zostaje w `rejected` do czasu aż junior ręcznie zacznie edycję (co przełącza na `draft`)? Plan zakłada drugie — `rejected` to stan trwały, edycja resetuje na `draft`.
- Czy `sent` blokuje dalszą edycję oferty (żeby nie zmienić czegoś po fakcie u klienta)? Rekomendacja: tak, `sent` = read-only, edycja robi duplikat.

---

## Prompt do wklejenia w sesji z Opus 4.8

```
Pracujemy nad aplikacją SteelQuote (Next.js 14 App Router + PostgreSQL + zwykły `pg`,
JWT w cookie httpOnly przez `jose`, bcrypt, PDF generowany po stronie klienta przez jsPDF).
Projekt: C:\Users\mmazur\source\repos\AMSteel_Quote\finance_calculator

Przeczytaj najpierw:
- STAN_PROJEKTU.md (folder nadrzędny AMSteel_Quote) — kontekst projektu
- src/lib/auth.ts, src/middleware.ts — obecny model JWT/sesji
- migrations/001, 002, 003 — obecny schemat bazy
- src/app/api/offers/**, src/app/offers/page.tsx — obecny CRUD ofert
- src/app/api/auth/**, src/app/page.tsx — logowanie

Cel: rozbudować aplikację o role handlowców i panel administracyjny, zgodnie z poniższą
specyfikacją. To NIE jest przepisanie aplikacji — rozbudowujemy istniejący kod, zachowując
konwencje, które już tam są (styl komponentów, Tailwind inline vars, dwujęzyczność PL/EN
przez `src/lib/translations.ts` i `LanguageContext`).

## 1. Role użytkowników
Trzy role: `junior` (młodszy handlowiec), `senior` (starszy handlowiec), `admin`.
- `junior`: tworzy/edytuje/duplikuje/usuwa WŁASNE oferty (jak dziś), ale zamiast przycisku
  "Wyślij do klienta" ma przycisk "Wyślij do weryfikacji".
- `senior`: wszystko co junior + własny przycisk "Wyślij do klienta" (bez weryfikacji) +
  może zatwierdzić lub odrzucić (z podaniem powodu) oferty juniorów będące w statusie
  pending_review.
- `admin`: NIE tworzy ofert. Zarządza kontami handlowców (dodawanie, dezaktywacja — NIE hard
  delete, patrz niżej) i bazą klientów (CRUD), oraz przegląda WSZYSTKIE oferty wszystkich
  handlowców z filtrami po statusie/handlowcu/dacie.

## 2. Migracje bazy danych (kolejne pliki w migrations/, numeracja od 004)
- `users`: dodaj `role VARCHAR(20) NOT NULL DEFAULT 'junior' CHECK (role IN ('junior','senior','admin'))`,
  `full_name VARCHAR(255)`, `is_active BOOLEAN NOT NULL DEFAULT true`.
- WAŻNE: zmień FK `offers.user_id` z `ON DELETE CASCADE` na `ON DELETE SET NULL` (albo w ogóle
  nie kasuj userów — "usuwanie" handlowca w panelu admina ma być `is_active = false`, żeby nie
  stracić historii ofert, którą panel admina ma pokazywać). Zaproponuj, którędy pójść, i wyjaśnij
  konsekwencje w komentarzu migracji.
- Nowa tabela `clients` (id, first_name, last_name, company, nip, address, phone, email,
  created_by FK→users, created_at, updated_at) + migracja danych z istniejących kolumn
  `client_*` w `offers` (INSERT ... SELECT DISTINCT, deduplikacja po e-mailu/NIP jeśli możliwe)
  + nowa kolumna `offers.client_id FK→clients`. Stare kolumny `client_*` zostają na razie
  (nie usuwaj), tylko przestają być źródłem prawdy.
- `offers`: dodaj `status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN
  ('draft','pending_review','approved','rejected','sent'))`, `reviewed_by INTEGER
  REFERENCES users(id)`, `reviewed_at TIMESTAMP WITH TIME ZONE`, `rejection_reason TEXT`,
  `sent_at TIMESTAMP WITH TIME ZONE`. Ustaw wszystkie istniejące oferty na `status='draft'`
  domyślnie (dane historyczne nie mają statusu, nie próbuj zgadywać).

## 3. Auth / RBAC
- `createToken` w `src/lib/auth.ts` musi nosić `role` w payloadzie JWT.
- Dodaj `src/lib/rbac.ts` z helperem typu `requireRole(session, allowedRoles: Role[])` używanym
  na początku każdego route handlera, który tego wymaga. Dla operacji approve/reject/admin —
  dociągnij aktualną rolę i `is_active` z bazy zamiast ufać wyłącznie tokenowi (token żyje 24h,
  dezaktywacja konta musi działać natychmiast).
- `src/middleware.ts`: dodaj ochronę `/admin/*` — tylko `role === 'admin'`, redirect do `/` (lub
  do `/calculator` z komunikatem) dla innych ról.

## 4. API — nowe/zmienione endpointy
- `POST /api/offers/[id]/submit` — junior i senior, `draft`/`rejected` → `pending_review`.
  Tylko właściciel oferty.
- `POST /api/offers/[id]/approve` — tylko `senior`, `pending_review` → `approved`. Ustaw
  `reviewed_by`, `reviewed_at`.
- `POST /api/offers/[id]/reject` — tylko `senior`, body `{ reason: string }`,
  `pending_review` → `rejected`. Ustaw `reviewed_by`, `reviewed_at`, `rejection_reason`.
- `POST /api/offers/[id]/send` — `senior` na dowolnej własnej ofercie w `draft`/`approved`,
  LUB junior/senior na ofercie `approved` której są właścicielem → `sent`. Ustaw `sent_at`.
  Oferta w statusie `sent` staje się read-only (blokada edycji w API, nie tylko UI).
- `GET /api/offers` — filtruj: junior widzi tylko swoje; senior widzi swoje + wszystkie
  `pending_review` cudze (do recenzji).
- `GET/POST/PATCH/DELETE /api/admin/users` — tylko `admin`. DELETE = ustawienie `is_active=false`,
  nie fizyczne usunięcie wiersza. Zwracaj też listę ofert per handlowiec (albo osobny endpoint
  `GET /api/admin/users/[id]/offers`).
- `GET/POST/PATCH/DELETE /api/admin/clients` — tylko `admin`, pełny CRUD.
- `GET /api/admin/offers` — tylko `admin`, wszystkie oferty + filtry query params
  (`status`, `user_id`, `date_from`, `date_to`).

## 5. Frontend
- `src/app/offers/page.tsx`: przyciski akcji zależne od `session.role` i `offer.status`
  (pobierz rolę np. przez nowy endpoint `/api/auth/me` albo dołącz do odpowiedzi `/api/offers`).
  Dodaj wizualny badge statusu (kolor per status, spójny z resztą stylu tej strony — CSS
  variables `--accent-*` już zdefiniowane w pliku).
- Nowe strony pod `/admin`:
  - `/admin` — dashboard z podsumowaniem (liczba ofert per status, liczba aktywnych handlowców)
  - `/admin/handlowcy` — lista + formularz dodawania + przełącznik aktywny/nieaktywny + zmiana roli
  - `/admin/klienci` — lista + CRUD klientów
  - `/admin/oferty` — tabela wszystkich ofert z filtrami, link do podglądu/PDF
- `src/components/Navigation.tsx`: dodaj link "Panel Admina" widoczny tylko dla `role === 'admin'`.
- Zachowaj istniejący wzorzec ciemny/jasny motyw (CSS custom properties na kontenerze, `isDark`
  state) — nie wprowadzaj nowego systemu stylowania.

## 6. Tłumaczenia
Dodaj brakujące klucze do `src/lib/translations.ts` (PL i EN) dla: statusów ofert, przycisków
workflow, wszystkich nowych ekranów admina, komunikatów walidacji.

## 7. Nie rób (zakres na teraz)
- Nie buduj koncepcji "zespołów"/przypisania juniora do konkretnego seniora — senior widzi
  wszystkie oferty do recenzji.
- Nie usuwaj starych kolumn `client_*` z `offers` w tej turze.
- Nie zmieniaj logiki samego kalkulatora cen (HRS/CR/HDG) — to osobny, stabilny obszar.
- Nie wprowadzaj nowych zależności (bibliotek UI, ORM) bez wyraźnej potrzeby — trzymaj się
  `pg` + zwykłego SQL, tak jak reszta projektu.

Zacznij od zaproponowania planu migracji (punkt 2) do akceptacji, zanim zaczniesz pisać kod —
zwłaszcza decyzję o `ON DELETE` dla `offers.user_id`, bo to nieodwracalna zmiana schematu.
```
