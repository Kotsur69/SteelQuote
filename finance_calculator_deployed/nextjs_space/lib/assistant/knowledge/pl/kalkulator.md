# Kalkulator - jak powstaje cena

## Wzór (EUR za tonę, dla każdej pozycji osobno)
- Cena wsadu = PGL + Σ Huta
- Marża = (PGL + Σ Huta) x marża% / 100
- **Cena końcowa = PGL + Σ Huta + marża + dopłata dodatkowa + transport + Σ SSC + dopłata za małą ilość**
- **Wartość całkowita = cena końcowa x tony** (zaokrąglona do centów)
- Wartość oferty = suma wartości pozycji (w EUR; transport jest w niej zawarty, bo jest częścią ceny końcowej).

Serwer przy zapisie sprawdza, że każda pozycja jest spójna z tym wzorem (tolerancja 1 eurocent); niespójnej oferty nie da się zapisać.

## Skąd biorą się składniki
- **PGL** - cena bazowa typu stali z Ustawień, nadpisywana ceną zaplanowaną na kwartał. Kalkulator bierze PGL z kwartału daty "Ważna od". Gdy okres ważności obejmuje kilka kwartałów, PGL nie jest dobierane automatycznie. Obniżenie PGL poniżej bazy wymaga zatwierdzenia (NPR).
- **Σ Huta** - suma dopłat huty: wymiar, gatunek, tolerancja grubości, certyfikat, powłoka (HDG, ZM), trawienie (PICKLED), łezka (TEARDROP) i opcje CR/HDG/ZM (zabezpieczenie, opakowanie, powierzchnia, wykończenie, zgrzew).
- **Σ SSC** - dopłaty cięcia: dopłata podstawowa (HRS, PICKLED, TEARDROP wg długości arkusza; CR, HDG, ZM wg szerokości; poza tabelą - stawka zastępcza, domyślnie 29 EUR/t, z ostrzeżeniem), tolerancja długości, płaskość, powierzchnia, waga paczki, oznakowanie, brzegowanie, granica plastyczności (wybrane gatunki), opakowanie, etykiety, złom (= cena wsadu x złom% / 100, zaokrąglone). **Krąg: Σ SSC = 0.**
- **Marża** - domyślnie wartość "Minimalna marża" z Ustawień; zmienić ją może rola z uprawnieniem "Zmienia cenę / marżę".
- **Dopłata za małą ilość** - wg tonażu pozycji (< 5 t, 5-9,9 t, > 9,9 t brak), stawki z cennika dopłat, zamrażane przy dodaniu pozycji.
- Wartości dopłat pochodzą z cennika dopłat (/admin/cennik), który administrator może zmieniać dla każdego typu stali; granice przedziałów są stałe.

## Przykład (liczby poglądowe, nie z cennika)
PGL 600 + Σ Huta 50 = cena wsadu 650. Marża 7% = 45,50. Transport 24,92, Σ SSC 40, dopłata dodatkowa 0, mała ilość 0 (20 t).
Cena końcowa = 650 + 45,50 + 0 + 24,92 + 40 + 0 = 760,42 EUR/t. Wartość = 760,42 x 20 = 15 208,40 EUR.

## Kurs i waluta
Silnik liczy w EUR. Oferta ma walutę wyświetlania (EUR lub PLN) i kurs EUR/PLN zamrożony przy zapisie - późniejsza zmiana kursu w Ustawieniach nie zmienia zapisanych ofert.

## Edycja w nowym kwartale
Gdy edytujesz ofertę wycenioną w poprzednim kwartale, kalkulator sam aktualizuje PGL, ceny i okres ważności do bieżącego kwartału i pokazuje komunikat "PGL zaktualizowane". Starsze pozycje bez pełnej zapisanej konfiguracji dostają tylko nowe PGL - trzeba je sprawdzić ręcznie.

## Jak używać kalkulatora (krok po kroku)
1. Wybierz typ stali (HRS, CR, HDG, PICKLED, TEARDROP, ZM).
2. Wpisz grubość, szerokość, długość (mm), wybierz **Arkusz** albo **KRĄG** i gatunek.
3. Ustaw dopłaty w panelach "Huta Dopłaty" i "SSC Dopłaty Processing".
4. W "Podsumowaniu" sprawdź PGL bazę, marżę, dopłatę dodatkową, wybierz warunek dostawy (CPT / FCA / FCA Kraków) i transport, podaj ilość w tonach albo arkuszach.
5. Kliknij **Dodaj do zestawienia**. Pozycję w zestawieniu można edytować ("Aktualizuj pozycję") albo usunąć.
6. Uzupełnij dane klienta (do wysyłki wymagane: nazwa firmy i NIP), okres ważności ceny (Ważna od / do) i ważność oferty.
7. **Zapisz ofertę** (nazwa opcjonalna). Z zestawienia można też wyeksportować PDF i Excel.
8. Dalsze kroki (Wyślij do weryfikacji, Wyślij do klienta, decyzja klienta) są w "Moje Oferty".

Ostrzeżenia w kalkulatorze: wymiar poza tabelą, marża poniżej minimalnej, PGL poniżej bazy, okres ważności obejmujący kilka kwartałów.
