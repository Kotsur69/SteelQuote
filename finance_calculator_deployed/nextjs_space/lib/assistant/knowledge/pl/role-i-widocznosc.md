# Role, flow i widoczność

## Flow
- **Flow 1 - DYSTR** (dystrybucja) i **Flow 2 - PROJEKTY**. Administrator może je konfigurować.
- Oferta należy do flow, w którym utworzył ją twórca (aktywny flow, przełącznik flow w aplikacji).
- Każda osoba ma jedną rolę w danym flow i zwykle pracuje w jednym flow; Head of Projects i CEO mogą należeć do kilku.

## Role i poziomy (wartości startowe, edytowalne w zakładce Uprawnienia)
| Rola | Flow 1 | Flow 2 | Zatwierdza | Zmienia PGL |
|---|---|---|---|---|
| IFO - Internal Front Office | N0 | N0 | nie | Flow 1: nie, Flow 2: tak |
| EFO - External Front Office | N0 | - | nie | nie |
| KAM - Key Account Manager | - | N0 | nie | tak |
| ASM - Area Sales Manager | N+1 | - | tak | tak |
| HoC - Head of Cluster | N+2 | - | tak | tak |
| HoP - Head of Projects | NPR | NPR | tak | tak |
| CEO | N+3 | N+3 | tak | tak |

- N0 = twórca oferty. NPR = osobny, równoległy poziom zatwierdzania (Head of Projects), który zastępuje też N+1 i N+2.
- Wszystkie role mogą tworzyć oferty i zmieniać marżę (wartość startowa). Head of Projects i CEO nie wysyłają ofert do weryfikacji - zatwierdzają swoje oferty sami do swojego poziomu.
- **Administrator** - konto techniczne poza hierarchią: widzi wszystko, jego oferty nie wymagają walidacji, może zdecydować każdy krok zatwierdzenia, zarządza Ustawieniami, cennikiem dopłat, powodami przegranej i Uprawnieniami.
- Konto bez przypisanej roli nie ma dostępu do ofert, dopóki administrator go nie przypisze.

## Kto widzi które oferty (wartości startowe)
Zawsze: własne oferty, a osoba zatwierdzająca - także oferty, w których sama zdecydowała krok, do czasu decyzji klienta.
| Rola | Widzi dodatkowo |
|---|---|
| IFO, EFO, KAM | oferty swojego zespołu w tym flow |
| ASM | oferty zespołu + oferty czekające na jego weryfikację |
| HoC | wszystkie oferty Flow 1 + kolejka weryfikacji |
| HoP, CEO | wszystkie oferty we wszystkich flow |
| Administrator | wszystko |

- **Zespół** = "Mój zespół" (lider i członkowie, powiązanie w obie strony). Nie ma jeszcze modelu oddziałów i regionów - zakres "oddział / region" działa jak zespół (ustawienie administratora może go rozszerzyć na cały flow).
- Widoczność nie daje prawa edycji ani zatwierdzania - to osobne uprawnienia.
- Ta sama widoczność obowiązuje na liście ofert, w Panelu Menedżera i w Analizie.

## Asystent i widoczność
Asystent odpowiada **wyłącznie w zakresie widoczności pytającego użytkownika**: liczy i pokazuje tylko oferty, które ta osoba widzi w aplikacji. Pytanie "ile ofert wysłała cała firma" od handlowca dostaje odpowiedź z jego zakresu, z wyraźną informacją, że to nie jest suma całej firmy. Asystent nie może zrobić niczego, czego użytkownik nie może zrobić w aplikacji.
