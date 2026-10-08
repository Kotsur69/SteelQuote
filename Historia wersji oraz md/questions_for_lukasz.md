# Pytania do Łukasza – kto co robi w nowym obiegu ofert

Przy przenoszeniu formularza uprawnień i walidacji ofert (wersja z 22.09.2026) do aplikacji
trafiłam na miejsca, w których formularz mówi dwie różne rzeczy albo nie mówi nic. Na razie
aplikacja działa według założeń opisanych przy każdym pytaniu („Teraz:”). Wszystkie te ustawienia
można zmienić w panelu „Uprawnienia”, bez przebudowy aplikacji. Wystarczy decyzja.

Przy każdym pytaniu wystarczy krótka odpowiedź: „tak jak teraz” albo co zmienić.

---

## 1. Kto jest kim

**1.1. Na jakim poziomie jest CEO w Flow 2 (Projekty)?**
Arkusz ROLE podaje N+3, ale strona startowa i symulator mówią, że Flow 2 kończy się na N+2.
Teraz: CEO jest w Flow 2 na poziomie N+2, a we Flow 1 na N+3. 

**1.2. Kto w Flow 2 jest „pierwszym przełożonym” (N+1)?**
Symulator nazywa go „Dyrektorem działu”, ale w arkuszu ROLE w Flow 2 nie ma nikogo na poziomie
N+1. Są tylko handlowcy, Head of Projects i CEO.
Teraz: w Flow 2 nie ma poziomu N+1. Gdyby jakaś reguła go wymagała, oferta idzie wyżej, do CEO.

**1.3. Czym różni się Internal Front Office od External Front Office (Flow 1)?**
W formularzu obie role mają identyczne uprawnienia i widoczność.
Teraz: działają tak samo, różnią się tylko nazwą. brak

**1.4. Czy jedna osoba może pracować w obu flow?**
Na przykład handlowiec, który obsługuje i dystrybucję, i projekty.
Teraz: tak. Taka osoba przełącza się między flow w górnym pasku, a nowa oferta trafia do flow,
w którym akurat pracuje. brak

**1.5. Od czego zależy, do którego flow należy oferta?**
Od osoby, która ją robi, od klienta czy od rodzaju zamówienia?
Teraz: od tego, w którym flow pracuje handlowiec w momencie tworzenia oferty. Wszystkie oferty
sprzed przebudowy trafiły do Flow 1.

**1.6. Czy w aplikacji są oferty sprzed przebudowy, które powinny być w Flow 2 (Projekty)?**
Teraz: wszystkie stare oferty są w Flow 1. Jeśli niektóre są projektowe, trzeba wskazać które.

**1.7. Czy Administrator (osoba techniczna, IT) może zatwierdzać oferty?**
W formularzu Administrator ma wszystkie uprawnienia na „TAK”.
Teraz: tak, może zatwierdzić lub odrzucić każdą ofertę i nie potrzebuje niczyjej zgody na własne
oferty. Jeśli ma tylko zarządzać kontami i ustawieniami, a nie decydować o cenach, trzeba to
wyłączyć. brak 

---

## 2. Kto zatwierdza co

**2.1. Czy ofertę może zatwierdzić dowolny kierownik danego poziomu, czy tylko przełożony handlowca?**
Na przykład: handlowiec z oddziału A wysyła ofertę do walidacji na poziomie N+1.
Teraz: ofertę widzi i może zatwierdzić każdy Area Sales Manager w danym flow, czyli wspólna
kolejka. W aplikacji nie ma jeszcze podziału na oddziały i regiony (patrz punkt 4.2). brak 

**2.2. Kto przejmuje zatwierdzanie, gdy osoba z danego poziomu jest na urlopie?**
Teraz: przy wspólnej kolejce zrobi to każdy inny kierownik z tego samego poziomu. Jeśli na danym
poziomie jest tylko jedna osoba, oferta czeka. brak 

**2.3. Czy oferta przechodzi przez wszystkie szczeble po kolei, czy trafia od razu do właściwego poziomu?**
Na przykład: oferta wymaga N+2. Czy najpierw zatwierdza N+1, a potem N+2?
Teraz: trafia od razu do N+2, a N+1 nie musi jej zatwierdzać.

**2.4. Co się dzieje, gdy ofertę robi sam kierownik?**
Na przykład: Area Sales Manager robi ofertę, która wymaga zgody N+1, czyli jego własnego poziomu.
Teraz: nikt nie musi jej zatwierdzać, bo jego poziom to pokrywa. Jeśli wymaga N+2, idzie do
Head of Cluster. Nikt nie może zatwierdzić własnej oferty.

**2.5. Head of Projects i CEO nie wysyłają ofert do walidacji (w formularzu „NIE”). Czy to znaczy, że ich oferty nie wymagają żadnej zgody?**
Teraz: tak, ich oferty idą do klienta bez walidacji. Wynika z tego kolizja:
- CEO obniża bazę wyceny. Reguła mówi „do Head of Projects”, a CEO jest wyżej w hierarchii.
  Teraz: nikt tego nie sprawdza.
- Head of Projects robi we Flow 1 ofertę powyżej 1 000 000 € (reguła: „do N+2”, czyli do Head of
  Cluster). Teraz: nikt tego nie sprawdza.
Czy tak ma być?

**2.6. Gdy oferta wymaga dwóch zgód naraz (np. kierownika za marżę i Head of Projects za bazę wyceny), czy obie są potrzebne?**
Teraz: tak, obie, w dowolnej kolejności. Jeśli jedna z osób odrzuci, oferta wraca do
handlowca.

**2.7. Kto może zmieniać ofertę w trakcie zatwierdzania i kto wysyła ją do klienta?**
Teraz: zatwierdzający może poprawić ofertę, a potem zatwierdzić ją i od razu wysłać do klienta
w imieniu handlowca. Aplikacja zapisuje, kto ją wysłał. Jeśli po poprawce oferta wymaga wyższego
poziomu (np. bardziej obniżona marża), idzie wyżej.
Pytanie: czyje dane kontaktowe mają być na PDF w takiej ofercie, handlowca czy zatwierdzającego? brak

**2.8. Co, jeśli handlowiec zmieni ofertę już zatwierdzoną, ale jeszcze nie wysłaną?**
Teraz: jeśli po zmianie oferta znów spełnia warunki walidacji, wraca do zatwierdzenia od nowa.

**2.9. Jak długo zatwierdzenie jest ważne?**
Czy zatwierdzona oferta może czekać na wysłanie dowolnie długo?
Teraz: tak, bez limitu. brak 

**2.10. Co, jeśli reguły zmienią się, gdy oferta już czeka na zatwierdzenie?**
Wymagany poziom ustalany jest w chwili wysłania oferty do walidacji. Jeśli później reguły
się zmienią (albo oferta pochodzi jeszcze ze starej wersji aplikacji), oferta mogła czekać
u zbyt niskiego poziomu.
Teraz: przy zatwierdzaniu aplikacja sprawdza reguły jeszcze raz. Jeśli dziś wymagają wyższego
poziomu, oferta nie zostaje zatwierdzona, tylko przechodzi wyżej (np. od kierownika ASM do
Head of Cluster i Head of Projects). Poziom nigdy nie jest obniżany, a zgody już udzielone
(np. Head of Projects) pozostają ważne.
Przykład: oferta wysłana przy marży 4,0% czekała u ASM; dziś ma marżę 2,4%, więc wymaga N+2.
Pytanie: czy tak ma być również dla starych ofert, które czekały na zatwierdzenie przed
wdrożeniem nowego obiegu (wtedy zatwierdzał je starszy handlowiec)? Czy te oferty powinien
nadal móc zatwierdzić ASM, tak jak w starym systemie?

---

## 3. Reguły – kiedy oferta wymaga zgody

### Marża

**3.1. Czy marżę liczymy dla całej oferty, czy osobno dla każdej pozycji?**
Na przykład: oferta ma 5 pozycji, 4 z marżą 6% i jedną z marżą 2%.
Teraz: liczy się najniższa marża spośród pozycji. Wystarczy jedna słaba pozycja, żeby oferta
wymagała zgody. brak

**3.2. Co oznacza „2,1” w regule marży na N+2?**
Formularz mówi: „marża niższa niż zakładana, ≥ 2,1% → N+2”. Można to czytać na dwa sposoby:
- (a) marża jest o co najmniej 2,1 punktu procentowego niższa od zakładanej, czyli przy celu
  4,5% chodzi o marżę 2,4% i niżej;
- (b) marża wynosi 2,1% lub mniej.
Teraz: wariant (a).

**3.3. Czy marża zakładana to jedna liczba (4,5%) dla wszystkich ofert?**
W symulatorze przykład używa 7%. Może marża zakładana zależy od klienta, produktu albo gatunku
stali?
Teraz: jedna liczba, 4,5%, dla wszystkich ofert w danym flow.

**3.4. Kiedy oferta trafia do CEO (N+3) we Flow 1?**
Progi dla N+3 (marża, obniżenie bazy, ważność) są w formularzu „do uzupełnienia”.
Teraz: żadna reguła nie wysyła oferty do CEO, więc CEO we Flow 1 nie dostaje niczego do
zatwierdzenia. Podobnie w Flow 2: wszystkie reguły kierują do Head of Projects, więc CEO też nic
nie dostaje.

### Baza wyceny (PGL)

**3.5. Kto zatwierdza obniżenie bazy wyceny: pierwszy przełożony (N+1) czy Head of Projects?**
Strona startowa mówi „każda zmiana bazy = minimum N+1”, a arkusz reguł mówi „do Head of
Projects”, i to w obu flow.
Teraz: zgodnie z arkuszem reguł, każde obniżenie bazy idzie do Head of Projects, także we Flow 1
(Dystrybucja).
Pytanie dodatkowe: czy Head of Projects ma zatwierdzać oferty dystrybucyjne?

**3.6. Czy podwyższenie bazy też wymaga zgody?**
Reguła mówi „każda zmiana w dół”.
Teraz: zgody wymaga tylko obniżenie bazy, podwyższenie nie.

**3.7. Kto we Flow 1 w ogóle może zmienić bazę?**
Handlowcy Front Office we Flow 1 mają w formularzu „NIE”, więc bazę zmieniają tylko kierownicy.
Wtedy obniżenie bazy przez Area Sales Managera idzie do Head of Projects. Czy o to chodzi?
W Flow 2 handlowcy mogą zmieniać bazę, więc każde obniżenie trafia do Head of Projects.

**3.8. Od jakiego obniżenia bazy oferta idzie wyżej (N+2, N+3)?**
Teraz: brak progów („do uzupełnienia”), więc każde obniżenie traktujemy tak samo.

### Termin ważności oferty i okres obowiązywania ceny

**3.9. Czym jest „termin ważności oferty” (standard 48 godzin)?**
Teraz: to czas, przez jaki klient może przyjąć ofertę. W aplikacji ustawia go pole terminu w
dniach (1 dzień = 24 godziny), a na PDF pojawia się jako „oferta ważna X godzin”. Każdy termin
dłuższy niż 48 godzin wymaga zgody: we Flow 1 od razu N+2 (Head of Cluster), w Flow 2 Head of
Projects.
Czy dobrze to rozumiemy? I czy we Flow 1 na pewno od razu N+2, z pominięciem N+1?

**3.10. Co znaczy „cena ważna na kwartał” i „dłużej niż kwartał”?**
Teraz:
- cena ważna w obrębie jednego miesiąca: bez zgody;
- dłużej niż miesiąc, ale w jednym kwartale kalendarzowym (np. 1.10–15.11): N+1;
- okres przechodzi przez granicę kwartałów: N+2. Dotyczy to także krótkich okresów, np.
  25.09–5.10 (10 dni, ale wrzesień i październik to różne kwartały).

Czy kwartał to kwartał kalendarzowy (I–IV), czy po prostu 3 miesiące od dnia oferty? Czy
krótka cena na przełomie kwartałów naprawdę ma wymagać N+2?

### Wartość oferty

**3.11. Jakie są progi wartości?**
Strona startowa mówi o dwóch progach: 200 i 1000, z jednostką do potwierdzenia. Arkusz reguł
podaje tylko próg 1 000 000 €.
Teraz: jeden próg, powyżej 1 000 000 € (we Flow 1: N+2, w Flow 2: Head of Projects).
Pytania:
- Czy próg 200 (200 000 €?) ma istnieć? Jeśli tak, na jaki poziom?
- Czy do wartości wliczamy transport?

### Ogólne

**3.12. Co oznacza kolumna „Priorytet” (10 / 20 / 30) w arkuszu reguł?**
Teraz: nie używamy jej. Gdy kilka reguł działa naraz, zawsze wygrywa najwyższy wymagany poziom,
zgodnie z zasadą ze strony startowej.

**3.13. Co ma się stać, gdy reguła wymaga poziomu, którego w danym flow nie ma?**
Na przykład ktoś ustawi w Flow 2 regułę „do N+3”, a w Flow 2 nie ma N+3 (scenariusz T5 z
symulatora).
Teraz: oferta idzie do najbliższego wyższego poziomu, który istnieje (w Flow 2 do CEO), z
widoczną adnotacją. Do wyboru są jeszcze: zablokować wysyłkę albo zawsze wysyłać na samą górę.

---

## 4. Kto co widzi

**4.1. W formularzu widoczności opisy nie zgadzają się z zaznaczeniami.**
Przy handlowcach Front Office i Key Account Managerze uwaga mówi „tylko własne oferty”, ale
w kolumnach „oferty zespołu” i „oferty oddziału” jest „TAK”.
Teraz: działa według zaznaczeń „TAK”, czyli handlowiec widzi też oferty zespołu.
Co jest prawdą: tylko własne czy także zespołu i oddziału? brak 

**4.2. Jakie są oddziały i regiony i kto do nich należy?**
Formularz używa pojęć „oddział” i „region”, ale ich nie definiuje.
Teraz: aplikacja zna tylko zespoły (kierownik i jego handlowcy), więc „oddział” i „region”
działają jak „zespół”. Potrzebujemy listy oddziałów i regionów z przypisanymi osobami. Wtedy
zatwierdzanie może też trafiać do właściwego kierownika, a nie do wspólnej kolejki. brak 

**4.3. Head of Cluster: „widoczność całego regionu”, ale „wszystkie oferty we flow” ma „NIE”.**
To ma sens tylko wtedy, gdy regionów jest kilka. Ile ich jest? brak

**4.4. Uwaga przy Head of Projects mówi o „kolejce N+1”.**
Head of Projects jest jednak na osobnym poziomie (NPR), a nie N+1. Do tego uwaga przy Head of
Projects we Flow 1 mówi o „ofertach w Flow 2”. Wygląda na skopiowany opis.
Teraz: Head of Projects widzi wszystkie oferty we wszystkich flow i zatwierdza oferty, które
wymagają NPR.

**4.5. Czy zatwierdzający widzi ofertę tylko na czas zatwierdzania, czy także później?**
Na przykład: Head of Cluster zatwierdził ofertę spoza swojego regionu.
Teraz: widzi ją tylko wtedy, gdy czeka na jego decyzję albo gdy pozwala na to jego zakres
widoczności. brak

---

## 5. Nowe konta

**5.1. Kto zakłada konta i przypisuje role?** 
Teraz: nowe konto nie ma żadnego dostępu, dopóki Administrator nie przypisze go do flow i roli.
Czy to zawsze ma być Administrator, czy na przykład także kierownik dla swoich handlowców? brak 


pare odpowiedzi: 
 1.1 niech ceo będzie n+2 w tym workflow ale zawsze jest na top jak mamy piramidę wizualną, jeśli będziemy chcieli dodać do workflow jednak do workflow 2 osobę n+2 to
  ceo przyjmuje n+3 i tak włąsnie to wygląda w wizualnej wersji piramidy.
 1.2 teorytycznie jest to npr i n+3. w tym worflow po prostu nie ma n+2 który sam może
  walidowac oferty. więc nie ma tam po prostu osoby która waliduje n+1 tylko oferta od razu idzie wyżej do osby która nie musi być walidowana czyli do n+3 
1.3 (odp łukasza) na tą chwile tylko nazwą. 
1.4 (odp łukasza)
1.5 od osoby która tworzy ofertę 
1.6 to są i tak oferty testowe także mogą zostać w flow1
1.7 (odp łukasza) tak na tą chwile zostawiamy cały panel dla admina
2.1 (odp łukasza) wszystko zależy od flow, w flow 1 oddział czy region to zakres. do oddziału należą Internal Front Office External Front Office Area Sales Manager - który widzi oferty oddziału. do regionu należy Head of Cluster - czyli osoba widząca wszystkie oddziały i wszystkie oferty z tych oddziałow ale nie widzi flow2 - tak mi się wydaje ale do ustalenia
2.2 (odp łukasza)
2.3 Przechodzi tylko do N+2
2.4 tak jak myślisz 
2.5 tak
2.6 Jeżeli kilka warunków jest spełnionych jednocześnie, obowiązuje najwyższy wymagany poziom akceptacji.
2.7 (odp łukasza)
2.8 dokładnie tak
2.9 (odp łukasza)
2.10 (odp łukasza)
3.1 (odp łukasza)
3.2 wariant b - do możliwość zmiany w adminie
3.3 tak 
3.4 i niech tak zostanie póki co ale daj możliwość dodania reguł dla n+3 w flow1 ale na tą chwilę nie ceo niue waliduje niczego 
3.5 tak niech idzie zgodnie z arkuszem reguł 
3.6 zmiana w góre nie trzeba dodawać zgody
3.7 tak o to chodzi
3.8 (odp łukasza) zrób panel w panelu admina do możliwości zmiany poszczególnych wartości 
3.9 tak dobrze rozumiemy 
3.10 kwartał kalendarzowy dokładnie jak w tej chwili zbudowany jest system PGL q1-q2 itp. i tak n+2 ma być wwwzywany
3.11 do jednego 1000000 ale z mozliwoscia dodania różnych progów i różnych osób do dodania modyfikacji do poszczególnych poziomów do walidacji
3.12 (odp łukasza)
3.13 (odp łukasza)
4.1 (odp łukasza)
4.2 (odp łukasza)
4.3 (odp łukasza)
4.4 i tak to ma działać
4.5 (odp łukasza)
5.1 (odp łukasza)