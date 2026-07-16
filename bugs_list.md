# Bugs List — AMSteel_Quote (finance_calculator_deployed/nextjs_space)

> Wygenerowane przez statyczny code review (tsc + next build + przegląd kodu), 2026-07-15.
> Zakres: analiza statyczna + review, bez uruchamiania appki, bez nowej infrastruktury testowej.
> Do potwierdzenia i ewentualnych poprawek — jutro.

## Static checks
- `tsc --noEmit` → czysto, brak błędów typów
- `next build` → sukces (linijka "Error fetching current user" podczas builda to Next.js
  wewnętrznie sprawdzający dynamikę route'a — złapane, nie jest to realny błąd)
- Lint pominięty — brak configu ESLint w projekcie (wymagałby interaktywnego setupu)

## Findings, wg severity

### HIGH
1. **JWT secret cicho spada na `'default-secret'`** — `lib/auth.ts:4` oraz
   `middleware.ts:15,32,50,61` — wszystkie robią
   `process.env.JWT_SECRET || 'default-secret'`. Nie wykorzystane dziś (`.env` ma prawdziwy
   sekret), ale jeśli ta zmienna kiedyś zniknie przy deployu, każdy może sfałszować ważny JWT
   (włącznie z `role: admin`) używając znanego stringa fallback, a appka się o tym nie
   poskarży. Powinno rzucać błąd przy starcie jeśli `JWT_SECRET` nie jest ustawiony, i być
   scentralizowane zamiast duplikowane w 2 plikach.
2. **Cicha, zmyślona dopłata dla grubości HRS poza tabelą** — `components/Calculator.tsx:342-348`.
   Dopłata bazowa SSC spada na zahardkodowane `29`, gdy grubość/długość wychodzi poza tabelę
   przeliczeniową, **bez żadnego ostrzeżenia na ekranie** — w przeciwieniu do sąsiedniego
   `dimSurcharge`, które ostrzega dla tej samej klasy wejścia. Konkretnie: wycena HRS przy
   grubości 30mm (poprawna w tabeli wymiarów, która sięga do 99mm) cicho używa zmyślonej
   dopłaty bez żadnej informacji, że liczba jest niepewna.

### MEDIUM
3. **`lib/calc-data.ts` to martwy kod** (~400 linii) — `Calculator.tsx` importuje wyłącznie z
   `lib/calculatorData.ts`. Wartości aktualnie zgadzają się 1:1, ale nic tego nie wymusza, a
   `calc-data.ts` ma czystsze, w pełni otypowane API, które wygląda jak to "prawdziwe" —
   przyszły kontrybutor mógłby przez pomyłkę je podpiąć i przywrócić rozjazd cen. To
   najpewniej to, o czym mówiła notatka "możliwa duplikacja" w STAN_PROJEKTU.md. Rekomendacja:
   usunąć albo zrobić, żeby jeden plik re-eksportował drugi.

### LOW
4. Nic strukturalnie nie blokuje samo-zatwierdzenia/samo-odrzucenia własnej recenzji przez
   senior/admin (`approve`/`reject` routes) — obecnie nieosiągalne przy aktualnym cyklu
   statusów, ale niezabezpieczone defensywnie.
5. `requireRoleFromToken` w `lib/rbac.ts` to martwy kod, nigdzie niewywoływany.
6. `lib/pdfGenerator.ts` (stary klientowy jsPDF) jest całkowicie martwy — tylko jego typ
   `ClientInfo` jest gdziekolwiek importowany. Potwierdza notatkę "klientowy jsPDF już
   nieużywany" z STAN_PROJEKTU.md.
7. Pola liczbowe w trybie PLN w kalkulatorze przeliczają się od nowa z EUR przy każdym
   renderze, co powoduje drobne przeformatowanie w trakcie wpisywania. Kosmetyczne — wartość
   EUR pod spodem nigdy nie jest uszkodzona.

## Potwierdzone jako czyste (zweryfikowane względem znanych regresji/niezmienników)
- Wzór budowy ceny (wsad → marża → cena końcowa +extra+transport+SSC → wartość) zgadza się
  dokładnie ze specyfikacją.
- Dawna regresja "editItem kasuje toggle'e" **nie** wróciła — potwierdzone pełne odtwarzanie
  snapshotu, z komentarzem-strażnikiem w kodzie.
- Niezmiennik "EUR jedynym źródłem prawdy" trzyma się wszędzie; PLN jest tylko warstwą
  prezentacji, konwersje tam-i-z-powrotem nie psują stanu.
- Udokumentowana poprawka PUT `/api/offers/[id]` (admin może edytować cudzą ofertę) nadal
  działa (zgodnie z logiką roli w GET).
- Wszystkie route'y CRUD/workflow ofert (submit/approve/reject/send/duplicate, senior, admin)
  mają spójne, poprawne sprawdzenia roli/właściciela; wszystkie zapytania parametryzowane
  (brak SQL injection).
- **Niezmiennik zamrożenia ceny działa end-to-end**: zmiana ustawień admina (baza PLN, kurs
  EUR, transport bazowy) nigdy nie dotyka już zapisanych ofert — potwierdzone przez snapshot
  w `collectOfferData` i wszystkie listy ofert czytające zamrożony snapshot, nie live settings.
- API ustawień poprawnie zablokowane do admina, z walidacją zakresów liczbowych po stronie
  serwera.

## Otwarte pytanie
Czy naprawiać dwa punkty HIGH (fallback JWT + cicha zmyślona dopłata) teraz, czy zostawić
jako listę do potwierdzenia?

---
*Testy automatyczne nie zostały dodane ani uruchomione w tym przebiegu — zgodnie z ustalonym
zakresem (tylko analiza statyczna + review).*
