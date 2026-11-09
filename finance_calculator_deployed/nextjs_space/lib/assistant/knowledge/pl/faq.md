# FAQ

**Kliknąłem "Wyślij do klienta" - czy klient dostał ofertę?**
Nie. Aplikacja niczego nie wysyła. Pobierz PDF, wyślij go klientowi sam (e-mail, telefon), a "Wyślij do klienta" kliknij, żeby to potwierdzić. Potem oznacz ofertę jako wygraną lub przegraną.

**Dlaczego nie mogę wysłać oferty?**
Najczęściej: brak nazwy firmy lub NIP klienta, oferta wymaga weryfikacji (najpierw "Wyślij do weryfikacji"), minęło 48 h od zatwierdzenia albo reguły się zaostrzyły (trzeba ponownie zweryfikować). Wysłać może tylko twórca oferty.

**Kto zatwierdzi moją ofertę?**
Zależy od reguł walidacji i flow, które ustawia administrator (progi mogą się zmieniać co miesiąc - aktualne wartości asystent sprawdza w bieżących regułach). Przykład na wartościach startowych w Flow 1: niska marża - ASM (N+1), bardzo niska marża - Head of Cluster (N+2), obniżone PGL - Head of Projects, bardzo wysoka wartość oferty - CEO. Zatwierdza tylko najwyższy wymagany poziom. Szczegóły w cykl-oferty.md.

**Moja oferta została odrzucona. Co teraz?**
Przeczytaj powód odrzucenia, popraw ofertę i wyślij ją ponownie do weryfikacji.

**Edytowałem ofertę i pojawiło się offer_123.1 - co to jest?**
Nowa wersja tej samej oferty. Zapis zmian nie nadpisuje poprzedniej wersji. W statystykach liczy się tylko najnowsza wersja.

**Klient odrzucił ofertę, ale chce negocjować. Muszę robić nową?**
Nie. Edytuj najnowszą wersję przegranej oferty - powstanie nowa wersja tej samej oferty jako Szkic, która przejdzie weryfikację i wysyłkę.

**Czy przy przegranej muszę podać powód?**
Tak, z listy (np. Cena, Termin dostawy, Wybrał konkurencję). Przy "Inne" dopisz notatkę.

**Jak liczona jest cena końcowa?**
PGL + dopłaty huty + marża + dopłata dodatkowa + transport + dopłaty SSC + dopłata za małą ilość, w EUR za tonę. Marża = (PGL + dopłaty huty) x marża% / 100. Wartość = cena końcowa x tony.

**Dlaczego dla kręgu nie ma dopłat SSC?**
Krąg nie jest cięty na arkusze, więc dopłaty SSC (w tym złom) wynoszą 0.

**Skąd ta dopłata przy małej ilości?**
Pozycja poniżej 5 t i od 5 do 9,9 t dostaje dopłatę za tonę z cennika dopłat; powyżej 9,9 t jej nie ma.

**Dlaczego transport na tonę wzrósł, gdy dodałem pozycję?**
Transport liczy się za całe ciężarówki (domyślnie 21 t). Gdy tonaż pozycji CPT przekroczy ładowność, dochodzi kolejny kurs i stawka EUR/t przelicza się dla wszystkich pozycji CPT.

**Klient odbiera sam - co zaznaczyć?**
FCA albo FCA Kraków. Transport tej pozycji wynosi wtedy 0.

**Admin zmienił kurs EUR/PLN - czy moje oferty się zmienią?**
Nie. Kurs jest zamrożony w ofercie przy zapisie. Zmiana dotyczy tylko nowych kalkulacji.

**Nie mogę zmienić PGL ani marży w kalkulatorze.**
Twoja rola nie ma uprawnienia "Zmienia bazę PGL" lub "Zmienia cenę / marżę". Uprawnienia nadaje administrator.

**Dlaczego nie widzę ofert kolegi?**
Widzisz oferty zgodnie ze swoją rolą: własne, zespołu, a niektóre role cały flow lub wszystkie oferty. Asystent też liczy tylko oferty, które widzisz.
