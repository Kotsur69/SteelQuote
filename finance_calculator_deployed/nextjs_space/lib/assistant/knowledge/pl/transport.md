# Transport

## Warunki dostawy (Incoterms, per pozycja)
- **CPT** - dostarczamy; transport jest w cenie pozycji.
- **FCA**, **FCA Kraków** - klient odbiera sam: transport = 0 EUR/t, a tony tych pozycji nie wchodzą do ciężarówek. Różnią się tylko miejscem na PDF.
- DAP nie jest już oferowany; stare pozycje z DAP działają jak CPT.
Warunek trzeba wybrać dla każdej nowej pozycji; jedna oferta może mieszać warunki.

## Jak liczony jest transport (cennik przewoźnika, w PLN)
1. Odległość drogowa z adresu nadania (Ustawienia "Adres nadania", domyślnie Kraków) do adresu dostawy ("Oblicz trasę"; można też wpisać kilometry ręcznie). Trasa liczona jest profilem ciężarówki, z zapasowym serwisem map, gdy główny nie odpowiada.
2. **Ciężarówki = zaokrąglenie w górę (tony pozycji CPT całej oferty / ładowność)**. Nawet 1 t ponad ładowność to kolejna cała ciężarówka. Domyślna ładowność: 21 t.
3. **Stawka za kurs** z pasma odległości (domyślny cennik, edytowalny przez administratora):
   | Odległość | Stawka za ciężarówkę |
   |---|---|
   | do 100 km | 1 344 zł ryczałt |
   | 100-223 km | 1 680 zł ryczałt |
   | 223-350 km | 7,50 zł/km |
   | powyżej 350 km | 6,50 zł/km |
4. Elementy 13,6-15,1 m (zaznaczane ręcznie): + ryczałt do każdego kursu (domyślnie 250 zł).
5. **Koszt = ciężarówki x (stawka za kurs + dopłata za długość)** w PLN.
6. **Transport EUR/t = koszt / tony pozycji CPT / kurs EUR/PLN oferty** (zaokrąglone do centów). Ta sama stawka EUR/t trafia do każdej pozycji CPT oferty; pozycje FCA mają 0.

Dodanie lub usunięcie pozycji zmienia tonaż, więc może dołożyć kurs - wtedy stawka EUR/t przelicza się dla wszystkich pozycji CPT ("Transport przeliczony").

## Kiedy transport wpisuje się ręcznie
- Ponadgabaryt: elementy dłuższe niż 15,1 m lub szersze niż 2,4 m - wymaga wyceny indywidualnej u przewoźnika.
- Brak stawki dla odległości w cenniku albo brak trasy.
- Handlowiec wybrał "Wpisz kwotę ręcznie".

## Przykład (domyślny cennik, kurs 4,30)
42 t CPT, 300 km: ciężarówki = ceil(42 / 21) = 2; stawka 300 x 7,50 = 2 250 zł; koszt 2 x 2 250 = 4 500 zł; transport = 4 500 / 42 / 4,30 = 24,92 EUR/t.
