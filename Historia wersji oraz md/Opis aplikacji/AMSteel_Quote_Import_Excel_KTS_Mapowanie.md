# Import z Excela (KTS/GPAO) — analiza formatu i mapowanie

> **STATUS: PRZEANALIZOWANE I ODŁOŻONE (2026-07-08).** Logika mapowania rozpisana
> na podstawie DWÓCH prawdziwych plików eksportu z obecnego systemu. Budowa wstrzymana
> — wracamy do tematu później. Ten dokument jest punktem startowym przy wznowieniu:
> zaczynamy od realnych danych, nie od zera.

## Po co ten dokument
Import to druga (niezrobiona) połowa funkcji eksport/import. Cel: wczytać plik `.xlsx`
w formacie eksportu z obecnego systemu → zmapować kolumny na wejścia kalkulatora →
**przeliczyć cenę** → wstawić pozycje do zestawienia. Główny docelowy use-case: wysyłka
ofert do klientów e-mailem.

Kluczowe odkrycie: **prawdziwy eksport jest DUŻO bardziej zaśmiecony niż model kalkulatora.**
To nie jest czysta odwrotność naszego eksportu — to mapowanie bogatszego, chaotycznego
słownika zewnętrznego na nasze wąskie przełączniki. Wierne odwzorowanie każdej kolumny
jest nierealne; odzyskujemy pewnie tylko rdzeń cenotwórczy, resztę robimy best-effort + flaga.

## Przeanalizowane pliki (prawdziwe eksporty)
1. `exportfile1.xlsx` — arkusz **`KTS`**, 106 wierszy, 43 kolumny (37 „naszych" + 6 pustych
   końcowych). Wyłącznie HRS.
2. `EXPORT_20260522_134555 (1).xlsx` — arkusz **`Data`**, **15 307 wierszy**, 37 kolumn.
   Wszystkie rodziny materiału. To jest reprezentatywny, produkcyjny eksport.

**Wniosek dot. formatu:** nazwa arkusza NIE jest stała (`KTS` vs `Data`) — import musi
znaleźć arkusz po dopasowaniu nagłówków, nie po nazwie. Liczba kolumn też się waha
(43 vs 37) — bierzemy pierwsze 37 wg `KTS_HEADERS` z `lib/excelExport.ts`, resztę ignorujemy.

## Mapowania — co odzyskujemy PEWNIE (rdzeń cenotwórczy)

### Grupa materiałowa → typ stali
| Kod w pliku | Rodzina | → nasz typ |
|---|---|---|
| HRBL, HRB, HRPI | gorącowalcowana (czarna / — / trawiona) | **HRS** |
| CRAS | zimnowalcowana | **CR** |
| HDZ, HDZM | ocynk ogniowy | **HDG** |
| EGZE | ocynk elektrolityczny (1 wiersz w 15k — pomijalne) | (edge-case, do decyzji) |
| *(puste)* | brak grupy (356 wierszy) | flaga w podglądzie |

> Uwaga o asymetrii round-tripa: nasz **eksport** zapisuje surowe `HRS`/`CR`/`HDG`, które
> NIE pasują do żadnego realnego kodu (`HRBL` itd.). Przy okazji importu trzeba poprawić
> też eksport, żeby emitował prawdziwe kody — inaczej nasz-eksport→nasz-import i
> prawdziwy-eksport→nasz-import to dwa różne słowniki.

### Gatunek → wartość dopłaty (NAJWAŻNIEJSZE — steruje ceną)
Normalizacja: `UPPER`, usuń `®`, zwiń spacje, `.`→`_` (albo oba na nic), usuń `(NN)`.
Na pliku 1 (17 gatunków): **13/17 trafia jednoznacznie**, 2 wieloznaczne, 2 bez trafienia.
- **Wieloznaczne** (ta sama nazwa = dwie różne dopłaty w naszej tabeli):
  `S355MC` → 48 albo 68; `S355J2C+N-CAT.A` → 57 albo 72.
  Obsługa: auto-wybór (domyślnie niższa) + **podświetlenie wiersza w podglądzie** do ręcznej
  korekty. (Decyzja do potwierdzenia — patrz „Otwarte pytania".)
- **Bez trafienia** (za bardzo inna pisownia): `AMStrongUlt700MC`, `AMStrongUlt700MCT`
  → u nas `Amstrong® Ultra 700MC_B` / `Amstrong® Ultra 700MCT` (obie =165).
  Obsługa: **mała ręczna mapa aliasów** na górze parsera.
- Reszta bez trafienia → flaga „nierozpoznany gatunek" + ręczny wybór w podglądzie.

### Wymiary
`Grubość` / `Szerokość` / `Długość` — czyste liczby. `dimSurcharge` liczymy z grubości+szer.
przez istniejącą `getDimensionSurcharge`. Bez problemu.

### Pokrycie (tylko HDG) → `selectedCoating`
Odzyskiwalne, wymaga normalizacji: `275`≡`Z275`, `+Z275`≡`Z275`; są też `Z100/Z180/Z225`,
`ZM120/ZM175/ZM250/ZM310`, `+ZM430`, `+DBL 25/25`. Zbudować mapę „surowe → kod powłoki".

## Mapowania best-effort (zaśmiecone kolumny — mapuj częste, resztę domyślnie + flaga)
Realny plik ma znacznie więcej wariancji niż nasze przełączniki:
- **Pakowanie: 72 różne wartości** (my mamy 6: S01/S03/S12/S13/SB2/SB3). Wolny tekst, literówki,
  zepsute kodowanie (`kant�wkach`), francuski, opisy typu „2 X BELKI POPRZ. DLG. 1000".
  Mapuj tylko czyste kody S01/S03/… → indeks przełącznika; reszta → domyślny S01 + flaga.
- **Atest: 21 wariantów** (my: 3 → 2.2/3.1/3.2). `+CE`, `+AD2000W1`, `Without`, `BEZ ATESTU`,
  francuski. Mapuj po prefiksie `2.2`/`3.1`/`3.2`; reszta → domyślny 3.1 + flaga.
- **Zabezpieczenie: 12 wariantów** z literówkami (`NIEOLIWINY`, `NIEOLIWIONY/A/E`, `E-PASYWACJA…`).
  Uwaga: dla HRS kalkulator może w ogóle nie mieć przełącznika oliwienia (jest tylko
  `crZabezp`/`hdgZabezp` dla CR/HDG) — dla HRS ta kolumna jest nie-mapowalna, pomijamy.
- **Zgrzew: 6 wariantów** → `crZgrzew`/`hdgZgrzew`: „…DOZWOLONY Z OZNACZENIEM"→(−3),
  „…DOZWOLONY BEZ OZNACZEN"→(inny/0), „NIEDOZWOLONY"/„Niedozwolony"→(niedozwolony).
  Porównanie case-insensitive, po słowach kluczowych.
- **Płaskość: A/B/C/X/N/FG** + osobna liczbowa tolerancja (nasz model: mały przełącznik,
  tolerancji liczbowej NIE przechowujemy). Mapuj kod→wartość `sscFlatness`, tolerancję pomiń.
- **Powierzchnia: 15 wartości** (HB3/T1/T1I/MSE/…) → `sscSurface`. Mapuj częste, resztę domyślnie.
- **Kształt:** SH/SHT = arkusz. SS/SW/DIV — rzadkie (≈150/15k), **który = krąg? — NIEUSTALONE**,
  do potwierdzenia przez użytkownika. Domyślnie traktuj wszystko poza jawnym kodem kręgu jako arkusz.

## Pola, których plik NIE niesie → wartości domyślne (edytowalne w podglądzie)
Marża % (dom. **7%**), extra (**0**), transport (**0**), `pglBase` (bieżąca baza, dom. 645),
oraz **tonaż = 1 t** (plik nie ma ilości). Dużo pod-przełączników dopłat (crZabezp/crOpak/
crPowierz/crWykon, sscLenTol/sscMarking/sscLabels) też nie są w pliku → domyślne.

## Przeliczanie ceny (recepta z `components/Calculator.tsx`)
```
cenaWsadu   = pglBase + sumaHuta
sumaHuta    = dimSurcharge(grubość,szer) + gradeValue + tolThick + cert + coating + crExtra
sumaSSC     = base + lenTol + flatness + surface + maxWeight + marking + edging + yield + packing + labels + scrap
cenaKoncowa = cenaWsadu + marża% + extra + transport + sumaSSC
```
**Refactor konieczny przed budową:** logika ceny siedzi w `Calculator.tsx` w `useMemo`
(domknięcia po stanie). Wyciągnąć czystą funkcję `computePrice(inputs)` do `lib/`, żeby
import mógł wycenić każdy wiersz niezależnie (i żeby podgląd pokazywał przeliczoną cenę).
Kalkulator potem woła to samo `computePrice`.

## Decyzje UX (już ustalone)
- **Krok podglądu + potwierdzenia**: parsuj → tabela podglądu z przeliczoną ceną i flagami
  dla pól domyślnych/niezmapowanych/wieloznacznych → użytkownik przegląda i edytuje →
  dopiero wtedy pozycje wchodzą do zestawienia. Kluczowe przy tak zaśmieconym pliku.
- **Miejsce importu**: kalkulator (obok przycisku eksportu Excel) **oraz** listy ofert
  (Moje Oferty / Panel Seniora / Admin → Oferty).

## Otwarte pytania przed wznowieniem
1. **Który kod `Kształt` = krąg?** (SS / SW / DIV — czy któryś?) Bez tego import kręgu zgaduje.
2. **Wieloznaczne gatunki** — potwierdzić strategię „auto niższa + flaga" vs blokada wiersza.
3. **Prawdziwe kody do EKSPORTU** — poprawić `lib/excelExport.ts`, żeby emitował realne kody
   grupy (HRBL/CRAS/HDZ…) zamiast surowych HRS/CR/HDG (asymetria round-tripa).
4. **EGZE** (ocynk elektrolityczny) — jak traktować (1 wiersz w 15k, ale istnieje).
5. Zakres słowników best-effort dla Pakowania/Atestu/Zabezpieczenia — ile wariantów mapować
   ręcznie, gdzie próg „→ domyślne + flaga".

## Pliki, których dotknie budowa
- **NOWY** `lib/excelImport.ts` — parser + słowniki odwrotne + mapowanie wiersz→wejścia.
- **NOWY** `lib/computePrice.ts` (refactor) — czysta funkcja ceny wyciągnięta z kalkulatora.
- `components/Calculator.tsx` — przycisk importu + modal podglądu; przejście na `computePrice`.
- Listy ofert (`app/offers`, `app/senior`, `app/admin/oferty`) — przycisk importu.
- `lib/excelExport.ts` — poprawka realnych kodów grupy (punkt 3 wyżej).
