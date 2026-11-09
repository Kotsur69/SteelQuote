# Cykl życia oferty

## Ścieżka
Szkic -> (Wyślij do weryfikacji) -> Do weryfikacji -> Zatwierdzona albo Odrzucona -> (Wyślij do klienta) -> Wysłana -> decyzja klienta: Wygrana / Przegrana.

- **Szkic** - oferta zapisana, można ją edytować i usunąć.
- Jeśli reguły walidacji niczego nie wymagają (albo poziom twórcy już to pokrywa), twórca od razu klika **Wyślij do klienta** - bez weryfikacji.
- **Wyślij do weryfikacji** - aplikacja liczy, kto musi zatwierdzić, i tworzy kroki zatwierdzenia. Oferta ma status **Do weryfikacji**.
- **Zatwierdź / Odrzuć** - robi osoba z wymaganym poziomem w danym flow (wspólna kolejka: każda osoba z tym poziomem i prawem zatwierdzania). Odrzucenie wymaga powodu (instrukcji dla handlowca). Gdy wszystkie kroki zatwierdzone - **Zatwierdzona**.
- **Odrzucona** - twórca poprawia i wysyła ponownie; weryfikacja zaczyna się od nowa.
- Weryfikujący może edytować ofertę w weryfikacji - powstaje nowa wersja, reguły liczą się od nowa (edycja może podnieść wymagany poziom).
- Edycja oferty zatwierdzonej: jeśli nadal wymaga walidacji, wraca do weryfikacji z nowymi krokami.
- **Ważność zatwierdzenia** - zatwierdzenie jest ważne 48 h (ustawienie administratora). Po tym czasie, albo gdy reguły w międzyczasie się zaostrzyły, oferta musi przejść weryfikację ponownie przed wysłaniem.
- **Wysłana** - tylko do odczytu. Usunąć można tylko własny szkic albo odrzuconą ofertę.

## "Wyślij do klienta" = potwierdzenie ręcznej wysyłki
Aplikacja niczego nie wysyła. Handlowiec pobiera PDF, sam wysyła go klientowi (e-mail, telefon), a potem klika "Wyślij do klienta", żeby potwierdzić wysyłkę. Od tej chwili liczy się data wysłania i można zapisać decyzję klienta.
- Wysłać może tylko twórca (właściciel) oferty - zatwierdzający nie wysyła.
- Bez danych firmy klienta (nazwa firmy i NIP) oferty nie da się wysłać.

## Decyzja klienta
- Zapisuje ją właściciel oferty (także administrator albo osoba, która zatwierdzała/odrzucała krok tej oferty). Tylko dla najnowszej wersji wysłanej oferty.
- **Przegrana** wymaga powodu z listy administratora (/admin/powody-przegranej); przy "Inne" także notatki. Domyślna lista: Cena, Termin dostawy, Wybrał konkurencję, Konkurencja była szybsza, Projekt anulowany, Brak odpowiedzi klienta, Warunki płatności, Inne. Administrator może dodawać i archiwizować powody.
- **Renegocjacja** - najnowszą wersję przegranej oferty można edytować: powstaje nowa wersja tej samej oferty w statusie Szkic, która znów przechodzi weryfikację i wysyłkę.

## Wersje
- Zapis zmienionej oferty tworzy nową wersję (`offer_123.1`, `offer_123.2`...), stara zostaje bez zmian i jest tylko do odczytu.
- W analityce każda rodzina wersji liczy się **raz**, według najnowszej wersji. Oferta renegocjowana czterokrotnie to jedna oferta.

## Kto zatwierdza (reguły walidacji)
Reguły i ich progi ustawia administrator w zakładce Uprawnienia i **mogą się zmieniać z miesiąca na miesiąc** (np. próg marży 4,5% w jednym miesiącu, 5% w następnym). Poniżej tylko wartości startowe jako przykład - pytany o aktualny próg, asystent zawsze sprawdza bieżące reguły narzędziem `get_approval_rules`, nigdy nie podaje liczb z tej tabeli jako aktualnych. Wymagany poziom = **najwyższy** spośród reguł, które zadziałały (poziomy N+1 < N+2 < N+3). NPR (Head of Projects) to osobny, równoległy krok. Tylko wymagany poziom zatwierdza (nie ma przechodzenia N+1 -> N+2).

Co reguły mierzą: najniższą marżę spośród pozycji (pozycja bez marży liczy się jako 0%), obniżenie PGL poniżej bazy, ważność oferty w godzinach, okres ważności ceny (ten sam miesiąc / jeden kwartał / więcej kwartałów), wartość oferty w EUR (suma wartości pozycji).

**Flow 1 (DYSTR)**
| Warunek | Zatwierdza |
|---|---|
| marża < 4,5% | N+1 (Area Sales Manager) |
| marża <= 2,1% | N+2 (Head of Cluster) |
| obniżenie PGL poniżej bazy | NPR (Head of Projects) |
| ważność oferty > 48 h | N+2 |
| okres ważności ceny obejmuje więcej niż jeden miesiąc kalendarzowy, ale mieści się w jednym kwartale | N+1 |
| okres ważności ceny obejmuje więcej niż jeden kwartał | N+2 |
| wartość oferty > 1 000 000 EUR | N+3 (CEO) |

**Flow 2 (PROJEKTY)**
| Warunek | Zatwierdza |
|---|---|
| marża < 4,5% | NPR (Head of Projects) |
| obniżenie PGL poniżej bazy | NPR |
| ważność oferty > 48 h | NPR |
| okres ważności ceny wykracza poza jeden miesiąc kalendarzowy | NPR |
| wartość oferty > 1 000 000 EUR | NPR + N+3 (CEO) |

Zasady trasowania:
- Kroki na poziomie twórcy lub niższym są spełnione automatycznie (np. ASM nie potrzebuje zgody N+1 na własną ofertę).
- Osoba z wyższego poziomu łańcucha może zdecydować krok niższego poziomu (zastępstwo), np. N+2 krok N+1.
- Head of Projects zastępuje poziomy N+1 i N+2: w Flow 2 (bez N+1/N+2) wszystko do N+2 trafia do niego, a w Flow 1 krok N+1/N+2 razem z krokiem NPR to jedno zatwierdzenie u Head of Projects.
- Head of Projects i CEO zatwierdzają własne oferty sami (do swojego poziomu); krok wyżej (np. N+3 dla oferty Head of Projects) nadal idzie wyżej.
- Oferty administratora nie wymagają walidacji.
