# Pytania do Łukasza – kto co robi w nowym obiegu ofert

Stan na 12.10.2026. Dotyczy formularza uprawnień i walidacji ofert (wersja z 22.09.2026)
przeniesionego do aplikacji.

Wszystkie pytania z pierwszej i drugiej rundy mają już odpowiedź i są wprowadzone w aplikacji
(wersja 2.0, sekcja B na dole). Otwarte zostały tylko sprawy, które czekają na Excel z
oddziałami i regionami.

---

## A. Czeka na Excel z oddziałami i regionami

Excel z oddziałami, regionami i przypisanymi osobami (z funkcjami) ma przyjść wkrótce. Do tego
czasu aplikacja zna tylko zespoły (kierownik i jego handlowcy), a zatwierdzanie działa jako
wspólna kolejka w danym flow.

**2.1. Czy ofertę zatwierdza dowolny kierownik danego poziomu, czy tylko przełożony handlowca?**
Wstępnie od Łukasza: zakres zależy od flow. We Flow 1 do oddziału należą Internal Front Office,
External Front Office i Area Sales Manager, który widzi oferty oddziału. Do regionu należy Head
of Cluster, który widzi wszystkie oddziały regionu i ich oferty, ale nie widzi Flow 2 (do
potwierdzenia).

**4.1. Handlowiec widzi tylko własne oferty, czy także oferty zespołu i oddziału?**
Formularz mówi „tylko własne”, a w kolumnach jest „TAK”. Teraz działa według „TAK”.

**4.2. Jakie są oddziały i regiony i kto do nich należy?**
Z Excela zbudujemy oddziały i regiony w aplikacji. Wtedy oferta będzie trafiać do właściwego
kierownika, a nie do wspólnej kolejki.

---

## B. Ustalone

Oznaczenia: **bez zmian** – aplikacja już tak działała; **wdrożone** – zmienione w wersji 2.0.

### 1. Kto jest kim

| Nr | Decyzja | Aplikacja |
|----|---------|-----------|
| 1.1 | CEO jest zawsze na szczycie piramidy. W Flow 2 CEO jest na N+3, bo poziomy N+1 i N+2 pokrywa Head of Projects (zob. 3.13). | wdrożone |
| 1.2 | W Flow 2 nie ma osoby na N+1; oferta trafia od razu do Head of Projects. | wdrożone |
| 1.3 | Internal i External Front Office różnią się na razie tylko nazwą. | bez zmian |
| 1.4 | Jedna osoba pracuje w jednym flow. W kilku flow mogą być tylko role oznaczone w panelu „Może pracować w kilku flow” (Head of Projects, CEO); Administrator jest poza flow. Przełącznik flow widzą tylko osoby z kilkoma flow. | wdrożone |
| 1.5 | Flow oferty zależy od osoby, która ją tworzy. | bez zmian |
| 1.6 | Oferty sprzed przebudowy są testowe i zostają we Flow 1. | bez zmian |
| 1.7 | Administrator na razie ma pełny panel, łącznie z zatwierdzaniem (ale nie wysyła cudzych ofert, zob. 2.7). | bez zmian |

### 2. Kto zatwierdza co

| Nr | Decyzja | Aplikacja |
|----|---------|-----------|
| 2.2 | Zastępstwo: ofertę czekającą na niższy poziom może zatwierdzić każdy wyższy (np. N+1 → N+2, N+3; Head of Projects za N+1 i N+2). Oferta pojawia się w ich kolejce z informacją, że wymagana jest tylko walidacja niższego poziomu i nie muszą jej zatwierdzać. Oferta nie przechodzi wyżej sama po czasie. | wdrożone |
| 2.3 | Oferta trafia od razu do wymaganego poziomu (np. N+2), bez N+1 po drodze. | bez zmian |
| 2.4 | Ofertę kierownika na jego własnym poziomie nikt nie musi zatwierdzać; wyżej idzie do kolejnego poziomu. Nikt nie zatwierdza własnej oferty. | bez zmian |
| 2.5 | Oferty Head of Projects i CEO idą do klienta bez walidacji. | bez zmian |
| 2.6 | Gdy działa kilka reguł naraz, obowiązuje najwyższy wymagany poziom. Head of Projects liczy się jak N+2: przy marży (N+1 lub N+2) i obniżeniu bazy wystarczy sama zgoda Head of Projects. Gdy oferta wymaga N+3, potrzebny jest jeszcze CEO. | wdrożone |
| 2.7 | Zatwierdzający może poprawić ofertę, a potem ją zatwierdzić albo odrzucić, ale jej nie wysyła. Do klienta wysyła tylko handlowiec, który ją stworzył. Na PDF są jego dane, a w statystykach oferta należy do niego. Poprawiona oferta zostaje w kolejce zatwierdzającego, a jeśli po poprawce nie wymaga już walidacji, znika z kolejki i wraca do handlowca. | wdrożone |
| 2.8 | Zmiana zatwierdzonej, niewysłanej oferty, która znów spełnia warunki walidacji, wraca do zatwierdzenia. | bez zmian |
| 2.9 | Zatwierdzenie jest ważne 48 godzin od ostatniej wymaganej zgody. Potem handlowiec zamiast „Wyślij do klienta” ma „Wyślij do weryfikacji”. Liczbę godzin ustawia Administrator w panelu Reguły. | wdrożone |
| 2.10 | Gdy po zatwierdzeniu reguły lub PGL zmienią się tak, że oferta wymaga wyższego poziomu, ma wyraźne oznaczenie i wraca do weryfikacji (zatwierdzający też to widzi). Gdy reguły się poluzowały, zatwierdzenie zostaje ważne, a oferta ma informację, że reguły się zmieniły. | wdrożone |

### 3. Reguły

| Nr | Decyzja | Aplikacja |
|----|---------|-----------|
| 3.1 | Liczy się każda pozycja osobno: jedna pozycja poniżej progu wystarczy do walidacji, średnia nie ma znaczenia. | bez zmian |
| 3.2 | Wariant (b): marża 2,1% lub niższa → N+2. Próg zmienia Administrator w panelu Reguły. Przykład przy celu 4,5%: marża 4,0% → N+1; 2,4% → N+1 (wcześniej było N+2); 2,1% → N+2. | wdrożone |
| 3.3 | Marża zakładana to jedna liczba (4,5%) dla wszystkich ofert w flow. | bez zmian |
| 3.4 | CEO we Flow 1 na razie niczego nie zatwierdza; Administrator może dodać reguły „do N+3” w panelu Reguły. | bez zmian |
| 3.5 | Obniżenie bazy idzie do Head of Projects w obu flow, także w dystrybucji. | bez zmian |
| 3.6 | Podwyższenie bazy nie wymaga zgody. | bez zmian |
| 3.7 | We Flow 1 bazę zmieniają tylko kierownicy; ich obniżenie idzie do Head of Projects. | bez zmian |
| 3.8 | Progi obniżenia bazy dla wyższych poziomów ustawia Administrator w panelu Reguły. | bez zmian |
| 3.9 | Termin ważności oferty dłuższy niż 48 godzin: Flow 1 → N+2, Flow 2 → Head of Projects. | bez zmian |
| 3.10 | Kwartał kalendarzowy (I–IV), jak przy PGL. Cena na przełomie kwartałów → N+2, także krótka. | bez zmian |
| 3.11 | Jeden próg wartości: 1 000 000 €. Administrator może dodać kolejne progi z różnymi poziomami. Wartość oferty obejmuje transport (jest już w cenie za tonę każdej pozycji). | bez zmian |
| 3.12 | Kolumna „Priorytet” to błąd generatora arkusza; usunięta. | wdrożone |
| 3.13 | Brakujący poziom: Head of Projects pełni rolę N+1 i N+2 (w Flow 2 reguła „do N+1” lub „do N+2” trafia do Head of Projects, „do N+3” do CEO). Zakres zastępstwa ustawia się w panelu Role i poziomy. | wdrożone |

### 4. Kto co widzi

| Nr | Decyzja | Aplikacja |
|----|---------|-----------|
| 4.3 | Head of Cluster ma pełną widoczność ofert dystrybucji (Flow 1). | wdrożone |
| 4.4 | Head of Projects widzi wszystkie oferty we wszystkich flow i zatwierdza oferty wymagające NPR. | bez zmian |
| 4.5 | Zatwierdzający widzi ofertę do czasu decyzji klienta (przyjęcie albo odrzucenie). | wdrożone |

### 5. Nowe konta

| Nr | Decyzja | Aplikacja |
|----|---------|-----------|
| 5.1 | Konta zakłada i role przypisuje tylko Administrator albo osoba z uprawnieniami Administratora. | bez zmian |
