# Słownik SteelQuote

## Oferta i wersje
- **Oferta** - wycena dla klienta: dane klienta + zestawienie pozycji (typ stali, gatunek, wymiary, tony, cena za tonę, wartość). Ma właściciela (twórcę) i flow, w którym powstała.
- **Nazwa oferty** - nadana przez handlowca; puste pole = nazwa zastępcza `offer_<numer>`.
- **Numer oferty / wersja** - `offer_123` to oryginał, `offer_123.1`, `offer_123.2` to kolejne wersje tej samej oferty (rodzina). Zapis zmienionej oferty tworzy nową wersję zamiast nadpisywać starą; zapis bez zmian nie tworzy wersji. Starsze wersje są tylko do odczytu (można je skopiować).
- **Kopiuj ofertę** - tworzy nową, niezależną ofertę (nowa rodzina) w statusie Szkic, której właścicielem jest kopiujący.
- **Zestawienie** - lista pozycji oferty.

## Statusy (jak w aplikacji)
| Kod | Etykieta |
|---|---|
| draft | Szkic |
| pending_review | Do weryfikacji |
| approved | Zatwierdzona |
| rejected | Odrzucona |
| sent | Wysłana |

## Decyzja klienta (tylko dla ofert wysłanych)
- **Bez decyzji** (pending), **Wygrana** (won, przycisk "Klient przyjął"), **Przegrana** (lost, przycisk "Klient odrzucił"). Decyzję można cofnąć ("Cofnij decyzję").
- **Powód przegranej** - obowiązkowy przy przegranej, wybierany z listy zarządzanej przez administratora. Przy "Inne" trzeba dopisać notatkę.

## Ceny i dopłaty (wszystkie kwoty w silniku: EUR za tonę)
- **PGL** (PGL baza) - cena bazowa za tonę dla typu stali. Administrator ustala ją w Ustawieniach i może zaplanować ceny na kwartały (Q1-Q4); cena zaplanowana na kwartał wchodzi automatycznie z początkiem kwartału. Zmienić PGL w kalkulatorze może tylko rola z uprawnieniem "Zmienia bazę PGL".
- **Dopłaty huty (Σ Huta, SumaHuta, "Dopłaty huta")** - dopłaty niezależne od PGL: wymiar (grubość/szerokość), gatunek, tolerancja grubości, certyfikat (2.2 / 3.1 / 3.2), powłoka (HDG, ZM), trawienie (PICKLED), dopłata Łezka (TEARDROP, wg szerokości), a dla CR/HDG/ZM także zabezpieczenie, opakowanie, powierzchnia, wykończenie, zgrzew.
- **Cena wsadu** = PGL + Σ Huta.
- **Dopłaty SSC (Σ SSC, SumaSSC)** - dopłaty processingu (cięcie na arkusze): dopłata podstawowa (dla HRS, PICKLED, TEARDROP wg długości, dla CR, HDG, ZM wg szerokości), tolerancja długości, płaskość, powierzchnia, waga paczki, oznakowanie, brzegowanie, granica plastyczności (YS, tylko wybrane gatunki), rodzaj opakowania (S01...SB3), etykiety, złom. Dla kręgów Σ SSC = 0.
- **Złom** - procent ceny wsadu (Ustawienia "Złom (%)", domyślnie 2%) doliczany w Σ SSC.
- **Marża** - procent od ceny wsadu: marża = (PGL + Σ Huta) x marża% / 100. Zmienić marżę może tylko rola z uprawnieniem "Zmienia cenę / marżę".
- **Marża minimalna** - Ustawienia "Minimalna marża (%)" (domyślnie 7%): wartość startowa marży nowej pozycji i próg ostrzeżenia w kalkulatorze. O tym, kto zatwierdza ofertę, decydują reguły walidacji (patrz cykl-oferty.md), nie to pole.
- **Dopłata dodatkowa (extra)** - kwota EUR/t wpisana ręcznie, z opcjonalnym komentarzem (może trafić do PDF).
- **Transport** - EUR/t wliczane w cenę pozycji (patrz transport.md).
- **Dopłata za małą ilość** - EUR/t wg tonażu pozycji: poniżej 5 t stawka 1 (domyślnie 10), od 5 do 9,9 t stawka 2 (domyślnie 5), powyżej 9,9 t brak. Stawki są w cenniku dopłat; kwota jest zamrażana przy dodaniu pozycji.
- **Cena końcowa** - cena za tonę pozycji; **Wartość całkowita** = cena końcowa x tony.
- **Cennik dopłat** (/admin/cennik) - edytowalne przez administratora wartości dopłat dla każdego typu stali.

## Warunki oferty
- **Incoterms** (warunek dostawy, per pozycja): **CPT** - dostarczamy, transport w cenie; **FCA** i **FCA Kraków** - klient odbiera sam, transport = 0. DAP nie jest już oferowany (stare pozycje z DAP działają jak CPT).
- **Kurs EUR/PLN** - zamrażany w ofercie przy zapisie. Zmiana kursu przez administratora dotyczy tylko nowych kalkulacji. Oferta ma też walutę wyświetlania (EUR lub PLN).
- **Termin płatności** - w dniach od wystawienia faktury; pochodzi z karty klienta, a gdy klient go nie ma - z Ustawień (domyślnie 30 dni). 0 = przedpłata.
- **Ważność oferty** - ile dni oferta jest ważna od wystawienia (szybki wybór 1, 2, 5, 7 dni; domyślnie 1 dzień). Przechowywana w godzinach.
- **Okres ważności ceny (Ważna od / Ważna do)** - okres, na który podana jest cena; od kwartału daty "Ważna od" zależy PGL. Okres obejmujący więcej niż jeden kwartał nie dobiera PGL automatycznie.
- **OWS** - Ogólne Warunki Sprzedaży; PDF oferty zawiera blok warunków i informację, że OWS są integralną częścią oferty.

## Stal
| Kod w aplikacji | Nazwa w UI | Po polsku potocznie |
|---|---|---|
| HRS | Walcowana na gorąco | blacha gorącowalcowana |
| PICKLED | HRS Trawiona | blacha trawiona |
| TEARDROP | Blacha łezkowa (ŁEZKA) | łezka |
| CR | Walcowana na zimno | blacha zimnowalcowana |
| HDG | Ocynkowana | ocynk, blacha ocynkowana |
| ZM | Magnelis | Magnelis |

- **Krąg (KRĄG)** - materiał w kręgu, bez cięcia: brak dopłat SSC, ilość tylko w tonach.
- **Arkusz** - cięcie na wymiar: liczone dopłaty SSC; ilość można podać w tonach albo w arkuszach (aplikacja przelicza z wagi teoretycznej arkusza).
- **Grubość, szerokość, długość** - w mm. Kombinacja spoza tabel daje ostrzeżenie w kalkulatorze.
- **Gatunek** - gatunek stali z listy dla danego typu (np. S235JR+AR, S355JR+N, DC01, DX51D); każdy ma własną dopłatę. Można dodać gatunek jednorazowy z ręczną dopłatą.
