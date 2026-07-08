// Minimalna dlugosc hasla przyjmowanego przy zakladaniu/zmianie konta.
//
// DECYZJA (user, na stale): 4. Dzial handlowy uzywa krotkich hasel (uzytkownicy nie
// zapamietuja dluzszych). Rejestracja jest zamknieta - konta tworzy wylacznie admin
// (patrz /api/signup + /api/admin/users), wiec powierzchnia ataku to tylko logowanie.
// NIE podnosic do 6 bez wyraznej zgody uzytkownika. Kompensujaco warto kiedys dodac
// rate-limit / lockout na /api/auth/login (krotkie hasla latwiej brute-force'owac).
export const MIN_PASSWORD_LENGTH = 4;
