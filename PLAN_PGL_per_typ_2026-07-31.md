# PGL bazowe — bugfix propagacji + rozbicie na HRS / CR / HDG

**Data:** 2026-07-31
**Projekt:** AMSteel_Quote (`finance_calculator_deployed/nextjs_space`)
**Status:** PLAN — nic nie zaimplementowane
**Zgłoszenie testerów:** (1) po zmianie PGL bazowego w panelu admina handlowcy nadal widzą starą cenę, (2) prośba o osobne PGL bazowe dla HRS, CR i HDG zamiast jednego wspólnego

---

## 1. Stan faktyczny — jak to działa dzisiaj

| Warstwa | Plik | Co robi |
|---|---|---|
| Baza | `migrations/007_create_settings_table.sql` | tabela `app_settings`, JEDEN wiersz (`CHECK id = 1`), kolumna `pgl_base NUMERIC(10,2) DEFAULT 645` |
| API | `app/api/settings/route.ts` | `GET` (każda zalogowana rola) + `PATCH` (tylko admin), fallback na `DEFAULT_SETTINGS` przy braku migracji (`42P01`) |
| Typy | `lib/currency.ts:15-25` | `AppSettings { eurPlnRate, pglBase: number, transportBase }`, `DEFAULT_SETTINGS.pglBase = 645` |
| Kontekst | `contexts/CurrencyContext.tsx:51-68` | `useEffect` → `fetch('/api/settings')`, **jeden raz**, wynik do `settings` |
| Kalkulator | `components/Calculator.tsx:184` | `const [pglBase, setPglBase] = useState(645)` — hardkod startowy |
| | `Calculator.tsx:857-865` | efekt wpisujący `settings.pglBase` do stanu — **strzeżony `defaultsAppliedRef`, wchodzi max raz** |
| | `Calculator.tsx:437` | `cenaWsadu = pglBase + sumaHuta` |
| | `Calculator.tsx:590`, `:628` | pozycja zestawienia niesie własne `pgl`; wczytanie pozycji do edycji przywraca jej PGL |
| | `Calculator.tsx:700`, `:748` | `pglBase` jest zapisywany w `offer_data` i przywracany przy `?edit=<id>` |
| Admin UI | `app/admin/ustawienia/page.tsx` | jedno pole „PGL bazowe" |
| i18n | `lib/translations.ts` | klucze `admin.settings.pglBase` / `pglBaseHint` w **4 językach**: pl, en, cs, de |

Konwencja architektoniczna, której **nie wolno złamać**: ustawienia globalne są wartością **startową dla nowej kalkulacji**. Zapisana oferta trzyma własną kopię PGL/transportu i zamrożony kurs w `offer_data`. Zmiana ustawień nie przelicza wstecz ofert wysłanych ani czekających na akceptację seniora.

---

## 2. Bug — analiza przyczyn

Nie ma jednej przyczyny. Są trzy nakładające się, wszystkie trzeba naprawić:

### P1. GET `/api/settings` nie jest oznaczony jako dynamiczny (najbardziej prawdopodobny sprawca)

`app/api/settings/route.ts` nie ma `export const dynamic = 'force-dynamic'`, mimo że inne route'y w projekcie go mają (`app/api/senior/offers/route.ts:6`, `app/api/signup/route.ts:1`, `app/api/generate-pdf/route.ts:21`). Klient też woła `fetch('/api/settings')` bez `cache: 'no-store'` — w `CurrencyContext.tsx:55` **i** w `app/admin/ustawienia/page.tsx:31`.

Efekt: odpowiedź może zostać podana z cache (przeglądarka / warstwa hostingu na AbacusAI) i handlowiec dostaje starą wartość **nawet po odświeżeniu strony**. To tłumaczy zgłoszenie najlepiej.

Uwaga diagnostyczna: to samo dotyczy kursu EUR/PLN — jeśli PGL się nie propaguje, kurs najprawdopodobniej też nie. Warto to sprawdzić przy okazji, bo tester mógł tego nie zauważyć.

### P2. Ustawienia pobierane są raz na pełne załadowanie strony

`CurrencyProvider` siedzi w `app/providers.tsx`, czyli w root layoucie. Nie odmontowuje się przy nawigacji klienckiej. `useEffect` z fetchem ma pustą tablicę zależności → **jeden fetch na cały cykl życia karty**. Handlowiec z otwartą kartą przez cały dzień nigdy nie zobaczy zmiany admina.

### P3. `defaultsAppliedRef` blokuje ponowne zastosowanie wartości

`Calculator.tsx:857-865` — nawet gdyby `settings` się odświeżyły, ref pilnuje, żeby wartości bazowe weszły do stanu **najwyżej raz**. Ref był dodany świadomie (żeby nie kasować ręcznych zmian handlowca) i sam w sobie jest sensowny — ale bez rozróżnienia „pole nietknięte" vs „pole zmienione ręcznie" blokuje też legalną aktualizację.

### P4. Zachowania, które wyglądają jak bug, a są zamierzone — POTWIERDZIĆ z testerami przed pracą

Zanim cokolwiek zmienimy, trzeba ustalić, którego scenariusza dotyczyło zgłoszenie:

1. Handlowiec **wczytał zapisaną ofertę** (`?edit=<id>`) → `Calculator.tsx:861` celowo pomija ustawienia, bo oferta jest źródłem prawdy. **To nie jest bug — tego nie ruszamy.**
2. Handlowiec ma **pozycje już dodane do zestawienia** → każda pozycja trzyma własne `pgl` (`:590`) i stara cena zostaje. **To nie jest bug.**
3. Handlowiec zaczyna **nową kalkulację** i widzi starą wartość → **to jest bug**, przyczyny P1–P3.

Ryzyko: „naprawienie" punktów 1–2 rozwaliłoby zamrażanie ofert, czyli najważniejszą zasadę systemu.

---

## 3. Bug — plan naprawy

**B1.** `app/api/settings/route.ts`: dodać `export const dynamic = 'force-dynamic'` i nagłówek `Cache-Control: no-store` na odpowiedzi GET.

**B2.** Oba fetche (`CurrencyContext.tsx`, `app/admin/ustawienia/page.tsx`) → `fetch('/api/settings', { cache: 'no-store' })`.

**B3.** `CurrencyContext`: wyciągnąć fetch do `refreshSettings()` (`useCallback`), wystawić ją w wartości kontekstu i wywoływać dodatkowo przy powrocie do karty:

```ts
useEffect(() => {
  const onVisible = () => { if (document.visibilityState === 'visible') refreshSettings(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  return () => { /* cleanup obu */ };
}, [refreshSettings]);
```

Bez pollingu na interwał — handlowiec i tak przełącza się między kartami, a interwał to niepotrzebny ruch do bazy.

**B4.** `Calculator.tsx`: zamienić `defaultsAppliedRef` (jednorazowy) na `pglDirtyRef` / `transportDirtyRef` (śledzenie ręcznej edycji):

- pole **nietknięte** przez handlowca → nowe wartości z ustawień wchodzą automatycznie przy każdym odświeżeniu `settings`,
- pole **zmienione ręcznie** → nie nadpisujemy po cichu; pokazujemy przy polu dyskretną informację `PGL bazowe zmienione przez admina: 645 → 660` z przyciskiem „zastosuj",
- flaga „dirty" kasuje się przy zmianie typu stali i przy resecie kalkulatora,
- warunek `if (searchParams.get('edit')) return;` **zostaje bez zmian** — oferta wczytana z bazy dalej nie jest ruszana.

**B5.** Panel admina po udanym `PATCH`: `new BroadcastChannel('amsteel-settings').postMessage('changed')`, a `CurrencyContext` nasłuchuje i robi `refreshSettings()`. Kosztuje ~10 linii, a daje natychmiastową propagację między kartami tej samej przeglądarki. Opcjonalne — nie blokuje wydania.

**B6.** GET zwraca dodatkowo `updatedAt` — przyda się do treści komunikatu z B4 i do diagnostyki „czy admin faktycznie zapisał".

---

## 4. Feature — PGL bazowe osobno dla HRS / CR / HDG

### 4.1 Baza — `migrations/011_pgl_base_per_steel_type.sql`

(numer 011: w repo są już migracje do `010_create_client_contacts.sql`)

```sql
BEGIN;

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS pgl_base_hrs NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pgl_base_cr  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pgl_base_hdg NUMERIC(10,2);

-- Backfill z dotychczasowej wspólnej wartości — start bez zmiany cen.
UPDATE app_settings
   SET pgl_base_hrs = COALESCE(pgl_base_hrs, pgl_base),
       pgl_base_cr  = COALESCE(pgl_base_cr,  pgl_base),
       pgl_base_hdg = COALESCE(pgl_base_hdg, pgl_base)
 WHERE id = 1;

ALTER TABLE app_settings
  ALTER COLUMN pgl_base_hrs SET NOT NULL, ALTER COLUMN pgl_base_hrs SET DEFAULT 645,
  ALTER COLUMN pgl_base_cr  SET NOT NULL, ALTER COLUMN pgl_base_cr  SET DEFAULT 645,
  ALTER COLUMN pgl_base_hdg SET NOT NULL, ALTER COLUMN pgl_base_hdg SET DEFAULT 645;

ALTER TABLE app_settings
  ADD CONSTRAINT app_settings_pgl_hrs_sane CHECK (pgl_base_hrs >= 0),
  ADD CONSTRAINT app_settings_pgl_cr_sane  CHECK (pgl_base_cr  >= 0),
  ADD CONSTRAINT app_settings_pgl_hdg_sane CHECK (pgl_base_hdg >= 0);

COMMIT;
```

**`pgl_base` zostaje w tabeli jako deprecated.** Nie kasujemy w tej wersji — gdyby deploy trzeba było cofnąć, stary kod nadal musi mieć z czego czytać. Usunięcie w osobnej migracji za 1–2 wersje. Migracja jest idempotentna (`IF NOT EXISTS` + `COALESCE`), więc ponowne puszczenie nie nadpisze zmian admina.

### 4.2 Typy — `lib/currency.ts`

```ts
export type SteelTypeKey = 'HRS' | 'CR' | 'HDG';
export type PglBaseByType = Record<SteelTypeKey, number>;

export interface AppSettings {
  eurPlnRate: number;
  pglBase: PglBaseByType;   // BYŁO: number
  transportBase: number;
  updatedAt?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  eurPlnRate: DEFAULT_EUR_PLN_RATE,
  pglBase: { HRS: 645, CR: 645, HDG: 645 },
  transportBase: 20,
};
```

Decyzja: **zmieniamy typ `pglBase` z `number` na obiekt**, zamiast dokładać drugie pole obok. Dwa źródła prawdy dla tej samej wartości to gwarantowany dryf. TypeScript wskaże wszystkie miejsca do poprawy przy `npm run build`.

Uwaga na import: `SteelType` mieszka w `lib/calculatorData.ts:648` (duży moduł z tabelami dopłat). `lib/currency.ts` **nie powinien** go importować. Definiujemy `SteelTypeKey` lokalnie w `currency.ts`, a `SteelType` w `calculatorData.ts` zostaje bez zmian (są strukturalnie identyczne, TS je pogodzi).

Dodać helper odporny na stary kształt odpowiedzi (podczas rolloutu / gdy migracja jeszcze nie poszła):

```ts
export function normalizePglBase(value: unknown): PglBaseByType
// number  -> { HRS: n, CR: n, HDG: n }
// obiekt  -> per klucz z sanityzacją (>= 0, skończona liczba), brak/śmieć -> DEFAULT
```

### 4.3 API — `app/api/settings/route.ts`

- `GET`: `SELECT eur_pln_rate, pgl_base_hrs, pgl_base_cr, pgl_base_hdg, transport_base, updated_at`. Do istniejącego fallbacku na `42P01` (brak tabeli) **dołożyć `42703`** (undefined_column) → oznacza „migracja 011 nie poszła"; wtedy fallback na `SELECT ... pgl_base` i rozdmuchanie do trzech typów. Bez tego wdrożenie kodu przed migracją wywala kalkulator dla wszystkich.
- `PATCH`: przyjmuje `{ eurPlnRate?, transportBase?, pglBase?: { HRS?, CR?, HDG? } }`. Walidacja per klucz przez istniejący `parseNumber` (min 0, max 100000). Nazwa kolumny **wyłącznie z whitelisty** `{ HRS: 'pgl_base_hrs', CR: 'pgl_base_cr', HDG: 'pgl_base_hdg' }` — klucz z body nigdy nie trafia do stringa SQL. Wartości dalej przez parametry `$n`, tak jak teraz.
- `PATCH` aktualizuje też `pgl_base` (deprecated) wartością HRS — żeby ewentualny rollback kodu nie zobaczył martwej wartości sprzed miesięcy. Do usunięcia razem z kolumną.
- `rowToSettings` zwraca nowy kształt. **Nie odsyłamy do bazy kolumn, które baza liczy sama** (w tym projekcie taką kolumną jest `display_name` w `offers` — tu nie występuje, ale zasada zostaje).

### 4.4 Kalkulator — `components/Calculator.tsx`

- `useState(645)` w linii 184 → `useState(DEFAULT_SETTINGS.pglBase.HRS)` (`HRS` jest typem startowym, `currentType` w linii 135).
- Efekt wartości domyślnych (`:858-865`): `setPglBase(settings.pglBase[currentType])`.
- **`selectType(type)` (`:456`) ustawia `setPglBase(settings.pglBase[type])` i kasuje flagę dirty.** Uzasadnienie: ta funkcja i tak resetuje gatunek, wymiary, tolerancje, certyfikat, opcje SSC i pola CR/HDG — PGL wpasowuje się w tę samą regułę „inny typ = inny produkt = inne wartości startowe". Przy `?edit` (wczytana oferta) `selectType` woła sam użytkownik, więc to jego świadoma zmiana — zachowanie jest poprawne.
- `cenaWsadu = pglBase + sumaHuta` (`:437`) — **bez zmian**. Stan kalkulatora dalej trzyma jedną, aktualną wartość PGL; rozbicie na typy dotyczy wyłącznie wartości *startowych*.
- `collectOfferData` (`:700`) i `restoreOfferData` (`:748`) — **bez zmian**. W ofercie `pglBase` zostaje pojedynczą liczbą (tą faktycznie użytą). Pełna kompatybilność wsteczna ze wszystkimi zapisanymi ofertami.
- `zestawienie[].pgl` (`:590`, `:628`) — **bez zmian**.
- Etykieta pola PGL w UI (`:1799`) może dostać sufiks z aktywnym typem, np. `PGL bazowe (HRS)` — drobiazg, ale testerzy od razu widzą, że wartość jest per typ.

### 4.5 Panel admina — `app/admin/ustawienia/page.tsx`

`FormState` jest dziś `Record<keyof AppSettings, string>` — po zmianie typu `pglBase` trzeba go rozpłaszczyć na jawny kształt:

```ts
type FormState = {
  eurPlnRate: string;
  transportBase: string;
  pglBaseHRS: string; pglBaseCR: string; pglBaseHDG: string;
};
```

UI: sekcja „PGL bazowe wg typu" z trzema polami, każde z kropką w kolorze akcentu typu — te same zmienne CSS, których używa kalkulator (`--accent-hrs`, `--accent-cr`, `--accent-hdg`, patrz `Calculator.tsx:1303-1320`). Istniejący niebieski box z informacją o zamrożonych ofertach zostaje bez zmian.

### 4.6 Tłumaczenia — `lib/translations.ts`

Klucze `admin.settings.pglBaseHrs / pglBaseCr / pglBaseHdg` + wspólny `pglByTypeHint`, plus (jeśli robimy 4.4 z sufiksem) `summary.pglBaseFor`. Interfejs `Translations` (~linia 397) i **wszystkie 4 języki: pl, en, cs, de** (bloki ok. 816, 1236, 1655, 2074). Stary klucz `pglBase` zostawić — jest używany także w podsumowaniu kalkulatora (`:643`, `:1063`, `:1482`, `:1901`).

---

## 5. Kolejność prac

| Etap | Zakres | Uwagi |
|---|---|---|
| 0 | Potwierdzenie z testerami scenariusza z §2/P4 | 5 minut rozmowy, oszczędza dzień pracy |
| 1 | Migracja 011 + puszczenie na bazie testowej | najpierw baza, kod ma się o co oprzeć |
| 2 | `lib/currency.ts` + `app/api/settings/route.ts` (typy, GET/PATCH, fallback 42703) | tu też B1 z §3 |
| 3 | `contexts/CurrencyContext.tsx` — `refreshSettings`, `no-store`, visibility/focus | B2, B3 |
| 4 | `components/Calculator.tsx` — dirty-tracking, `selectType`, defaults | B4 |
| 5 | `app/admin/ustawienia/page.tsx` + `lib/translations.ts` ×4 języki | B5 opcjonalnie |
| 6 | `npm run build` + `npm run lint` + QA wg §6 | brak frameworka testowego w projekcie — QA manualne |
| 7 | Aktualizacja `STAN_PROJEKTU.md`, `bugs_list.md`, prompt wdrożeniowy v5 | wg `Historia wersji oraz md/Szablony/…v4.md` |

Etapy 1–5 to jeden spójny commit-set; rozbijanie na osobne wydania nie ma sensu, bo bug i feature dotykają tych samych pięciu plików.

---

## 6. Scenariusze QA (manualne — w projekcie nie ma test runnera)

**Bugfix:**
1. Admin zmienia PGL HRS 645 → 700 i zapisuje. Handlowiec **z otwartą kartą** przełącza się na inną kartę i wraca → nowa kalkulacja pokazuje 700.
2. Handlowiec robi twardy refresh po zmianie admina → 700 (weryfikacja cache'a; sprawdzić też w DevTools, czy `/api/settings` nie leci `from disk cache`).
3. Handlowiec **ręcznie** wpisał 680, admin zmienia na 700 → wartość 680 **zostaje**, pojawia się informacja o zmianie z opcją zastosowania.
4. Handlowiec ma otwartą ofertę przez `?edit=<id>` z PGL 620, admin zmienia na 700 → oferta dalej pokazuje **620**. To jest test regresji zamrażania — jeśli padnie, wstrzymujemy wydanie.
5. Pozycje już dodane do zestawienia zachowują swoje `pgl` po zmianie ustawień.
6. To samo co 1–2 dla kursu EUR/PLN (ta sama ścieżka, ta sama poprawka).

**Feature:**
7. Admin ustawia HRS 700 / CR 800 / HDG 900. Nowa kalkulacja: przełączanie HRS ↔ CR ↔ HDG podmienia PGL bazowe na 700/800/900, a `cena wsadu` przelicza się zgodnie.
8. Wycena z każdego typu zapisana jako oferta → wczytanie ponowne pokazuje PGL użyte w chwili zapisu.
9. Oferta zapisana **przed** wdrożeniem (jedno wspólne PGL) → wczytuje się bez błędu, kwoty bez zmian.
10. Panel admina: wartość ujemna i tekst w polu → czytelny błąd walidacji, brak zapisu.
11. Uruchomienie aplikacji **przed** migracją 011 → kalkulator działa na starym `pgl_base` (fallback `42703`), nie sypie 500.
12. Wszystkie 4 języki: pl, en, cs, de — brak surowych kluczy w UI panelu ustawień.

---

## 7. Ryzyka

| Ryzyko | Waga | Mitygacja |
|---|---|---|
| Regresja zamrażania ofert (zmiana ustawień rusza wysłane oferty) | **KRYTYCZNE** | scenariusz QA 4 jako gate; nie dotykać warunku `?edit` |
| Kod wdrożony przed migracją 011 | wysoka | fallback `42703` w GET (§4.3) + migracja puszczona jako pierwsza |
| Cache po stronie hostingu AbacusAI, której nie widać lokalnie | średnia | weryfikacja na żywo po deployu (QA 2), `no-store` i po stronie serwera, i po stronie klienta |
| Zmiana typu `AppSettings.pglBase` psuje miejsca, o których nie wiemy | niska | `npm run build` wskaże wszystkie; `normalizePglBase` łapie stare kształty w runtime |
| Handlowiec traci ręcznie wpisaną wartość przy odświeżeniu ustawień | średnia | dirty-tracking (B4), nigdy ciche nadpisanie |

---

## 8. GOTOWY PROMPT — do wklejenia w nowej sesji Claude Code

````text
Projekt: C:\Users\mmazur\source\repos\AMSteel_Quote (kod w finance_calculator_deployed\nextjs_space)
Plan referencyjny: PLAN_PGL_per_typ_2026-07-31.md w katalogu głównym repo — przeczytaj go w całości PRZED pisaniem kodu.

Zadanie: (A) naprawić bug propagacji PGL bazowego z panelu admina do kalkulatora handlowca,
(B) rozbić jedno wspólne PGL bazowe na trzy osobne: HRS, CR, HDG.

ZASADA NADRZĘDNA, KTÓREJ NIE WOLNO ZŁAMAĆ:
Ustawienia globalne (app_settings) są wartością STARTOWĄ wyłącznie dla NOWEJ kalkulacji.
Zapisana oferta trzyma własną kopię PGL/transportu i zamrożony kurs w offer_data. Zmiana ustawień
NIGDY nie przelicza wstecz ofert zapisanych, wysłanych ani czekających na akceptację seniora.
W Calculator.tsx warunek `if (searchParams.get('edit')) return;` w efekcie wartości domyślnych
zostaje nietknięty. Pozycje w `zestawienie` trzymają własne `pgl` i to też zostaje.

--- CZĘŚĆ A: BUGFIX ---
A1. app/api/settings/route.ts: dodaj `export const dynamic = 'force-dynamic'` oraz nagłówek
    `Cache-Control: no-store` na odpowiedziach GET.
A2. Oba miejsca wołające endpoint (contexts/CurrencyContext.tsx, app/admin/ustawienia/page.tsx):
    fetch('/api/settings', { cache: 'no-store' }).
A3. CurrencyContext: wyodrębnij `refreshSettings()` jako useCallback, wystaw ją w wartości kontekstu
    i wołaj dodatkowo na `visibilitychange` (gdy karta staje się widoczna) oraz na `window.focus`.
    Pamiętaj o cleanupie listenerów. Bez pollingu na setInterval.
A4. Calculator.tsx: zamień jednorazowy `defaultsAppliedRef` na śledzenie ręcznej edycji
    (pglDirtyRef / transportDirtyRef):
      - pole nietknięte przez handlowca -> nowe wartości z ustawień wchodzą przy każdym odświeżeniu
        settings,
      - pole zmienione ręcznie -> NIE nadpisuj po cichu; pokaż przy polu dyskretną informację
        "PGL bazowe zmienione przez admina: <stare> -> <nowe>" z przyciskiem zastosowania,
      - flaga dirty kasuje się przy zmianie typu stali i przy resecie kalkulatora.
A5. GET zwraca dodatkowo `updatedAt` (z kolumny updated_at).
A6. Opcjonalnie (jeśli wyjdzie czysto): po udanym PATCH w panelu admina wyślij
    BroadcastChannel('amsteel-settings'), a CurrencyContext niech na to odświeża ustawienia.

--- CZĘŚĆ B: PGL PER TYP ---
B1. Nowa migracja migrations/011_pgl_base_per_steel_type.sql — treść i uzasadnienie w §4.1 planu.
    Kolumny pgl_base_hrs / pgl_base_cr / pgl_base_hdg, backfill z pgl_base, NOT NULL + DEFAULT 645
    + CHECK >= 0. Migracja idempotentna. Kolumny pgl_base NIE KASUJEMY (deprecated, do usunięcia
    w osobnej migracji za 1-2 wersje). Zachowaj styl komentarzy z migracji 007 — po polsku,
    z uzasadnieniem decyzji.
B2. lib/currency.ts: `PglBaseByType = Record<'HRS'|'CR'|'HDG', number>`, `AppSettings.pglBase`
    zmienia typ number -> PglBaseByType, DEFAULT_SETTINGS.pglBase = { HRS: 645, CR: 645, HDG: 645 }.
    Dodaj `normalizePglBase(value: unknown): PglBaseByType` — przyjmuje liczbę (stary kształt),
    obiekt lub śmieć, zawsze zwraca poprawny komplet trzech wartości.
    NIE importuj SteelType z lib/calculatorData.ts (duży moduł) — zdefiniuj typ lokalnie.
B3. app/api/settings/route.ts:
    - GET czyta trzy nowe kolumny; do istniejącego fallbacku na 42P01 (brak tabeli) DOŁÓŻ 42703
      (undefined_column) -> wtedy czytaj stare pgl_base i rozdmuchaj na trzy typy. Bez tego
      wdrożenie kodu przed migracją wywala kalkulator wszystkim.
    - PATCH przyjmuje { eurPlnRate?, transportBase?, pglBase?: { HRS?, CR?, HDG? } }. Walidacja
      per klucz istniejącym parseNumber (min 0, max 100000). Nazwa kolumny WYŁĄCZNIE z whitelisty
      w kodzie — klucz z body użytkownika nigdy nie trafia do stringa SQL. Wartości dalej przez $n.
    - PATCH aktualizuje też deprecated pgl_base wartością HRS (bezpieczeństwo przy rollbacku).
B4. components/Calculator.tsx:
    - useState startowy PGL z DEFAULT_SETTINGS.pglBase.HRS (HRS to typ startowy),
    - efekt wartości domyślnych: settings.pglBase[currentType],
    - selectType(type): ustaw setPglBase(settings.pglBase[type]) i skasuj flagę dirty — spójnie
      z tym, że ta funkcja już teraz resetuje gatunek, wymiary, tolerancje, certyfikat i opcje SSC,
    - cenaWsadu, collectOfferData, restoreOfferData i zestawienie[].pgl BEZ ZMIAN — w ofercie
      pglBase zostaje pojedynczą liczbą (tą faktycznie użytą), pełna zgodność wstecz,
    - etykieta pola PGL w podsumowaniu może dostać sufiks z aktywnym typem, np. "PGL bazowe (HRS)".
B5. app/admin/ustawienia/page.tsx: FormState rozpłaszczony (eurPlnRate, transportBase, pglBaseHRS,
    pglBaseCR, pglBaseHDG). Sekcja "PGL bazowe wg typu" z trzema polami, każde z kropką w kolorze
    akcentu typu (--accent-hrs / --accent-cr / --accent-hdg — te same zmienne, których używa
    kalkulator). Istniejący niebieski box o zamrożonych ofertach zostaje.
B6. lib/translations.ts: nowe klucze (pglBaseHrs / pglBaseCr / pglBaseHdg + wspólny hint)
    w interfejsie Translations ORAZ we wszystkich 4 językach: pl, en, cs, de. Starego klucza
    pglBase nie usuwaj — używa go też podsumowanie kalkulatora.

--- WYKONANIE ---
- Kolejność: migracja -> currency.ts + API -> CurrencyContext -> Calculator -> panel admina + i18n.
- Styl: dopasuj się do istniejącego kodu. Komentarze po polsku, wyjaśniające DLACZEGO (a nie co) —
  tak jak w migracji 007, app/api/settings/route.ts i CurrencyContext.tsx.
- Po każdym etapie: npm run build oraz npm run lint w finance_calculator_deployed/nextjs_space.
  W projekcie NIE MA frameworka testowego — nie dodawaj go przy okazji tego zadania.
- Na końcu wypisz mi checklistę QA do ręcznego przeklikania (scenariusze z §6 planu) oraz
  dokładną komendę psql do puszczenia migracji 011.
- Nie commituj i nie pushuj bez mojej wyraźnej zgody.
````

---

## 9. Po implementacji — wdrożenie

Deploy idzie przez DeepAgent (AbacusAI), promptem podmieniającym pliki. Szablon do skopiowania i przerobienia: `Historia wersji oraz md/Szablony/AMSteel_Quote_DeepAgent_Prompt_Wdrozenie_v4.md` → nowa wersja `…_v5.md`.

Sekcje, które trzeba w nim koniecznie napisać:

1. **Migracja 011 idzie ręcznie i PRZED (albo równocześnie z) podmianą plików** — inaczej kalkulator jedzie na fallbacku i admin nie ma czym zapisać wartości per typ.
2. `export const dynamic = 'force-dynamic'` w `app/api/settings/route.ts` i `cache: 'no-store'` na fetchach są **zamierzone** — DeepAgent ma ich nie „optymalizować" z powrotem.
3. Kolumna `pgl_base` zostaje w tabeli celowo (deprecated) — nie kasować.
4. Standardowe ostrzeżenia z v4: honorować dostarczone pliki jeden do jednego, nie kasować z serwera plików spoza zipa (`.env`, `.abacus.donotdelete`), nie przywracać fallbacku dla `JWT_SECRET`.

Do aktualizacji po wdrożeniu: `STAN_PROJEKTU.md` i `bugs_list.md`.
