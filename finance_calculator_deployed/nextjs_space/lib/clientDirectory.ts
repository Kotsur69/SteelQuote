import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { ClientInfo } from './pdfGenerator';

// Zapis oferty przychodzi z otwartej transakcji (PoolClient), a wyszukiwanie kontaktów
// z puli (Pool). Oba mają tę samą metodę `query`, więc funkcje szukające przyjmują ten
// wąski kształt zamiast konkretnej klasy — inaczej trzeba by je duplikować albo
// wypożyczać połączenie z puli tylko po to, żeby zgadzał się typ.
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<R>>;
}

// Katalog klientów — zapis przy zapisywaniu oferty.
//
// Do tej pory tabela `clients` była martwa z punktu widzenia handlowca: zapełnił ją
// jednorazowy backfill z migracji 006, a potem pisał do niej wyłącznie panel admina.
// Kalkulator trzymał dane klienta tylko w blobie offer_data. Bez tego pliku
// wyszukiwarka firmy/NIP-u w kalkulatorze do końca świata podpowiadałaby te same
// kilkanaście rekordów z backfillu.

// Dopasowanie oferty do istniejącego klienta.
//
// NIP ma pierwszeństwo, nazwa firmy jest fallbackiem — DOKŁADNIE ta sama kolejność
// co w dedupie migracji 006, żeby dopisywanie nie zaczęło tworzyć duplikatów obok
// rekordów, które tamta migracja już scaliła.
//
// Przy wielu rekordach na ten sam klucz wygrywa NAJSTARSZY (ORDER BY id ASC) — znów
// za migracją 006, gdzie źródłem danych była najstarsza oferta. Dzięki temu powtórny
// zapis tej samej oferty trafia zawsze w ten sam wiersz.
//
// Eksportowane, bo tej samej identyfikacji używa trasa podpowiedzi kontaktów
// (app/api/clients/contacts) — musi trafić DOKŁADNIE w tego klienta, do którego zapis
// oferty dopisze potem kontakt. Dwie różne reguły dopasowania = podpowiedzi z innej
// firmy niż ta, do której zapis trafi.
export async function findClientId(
  db: Queryable,
  company: string,
  nip: string
): Promise<number | null> {
  if (nip !== '') {
    const byNip = await db.query<{ id: number }>(
      `SELECT id FROM clients WHERE LOWER(TRIM(nip)) = LOWER($1) ORDER BY id ASC LIMIT 1`,
      [nip]
    );
    if (byNip.rows.length > 0) return byNip.rows[0].id;
  }

  const byCompany = await db.query<{ id: number }>(
    `SELECT id FROM clients WHERE LOWER(TRIM(company)) = LOWER($1) ORDER BY id ASC LIMIT 1`,
    [company]
  );
  return byCompany.rows.length > 0 ? byCompany.rows[0].id : null;
}

// Dopisz osobę kontaktową do firmy (tabela client_contacts z migracji 010).
//
// PO CO OSOBNA TABELA, skoro `clients` ma już first_name/last_name/phone/email:
// tamte kolumny mieszczą JEDNĄ osobę na firmę i — przez regułę "uzupełniamy luki" —
// pierwsza wpisana osoba zajmowała miejsce na zawsze. Drugi handlowiec dopisywał
// technologa i jego dane po prostu znikały. Tutaj każda osoba dostaje własny wiersz.
//
// Tożsamością osoby jest imię + nazwisko w obrębie firmy. Bez nazwiska i imienia nie
// zapisujemy nic: pod polem "Imię" nie dałoby się takiego kontaktu podpowiedzieć,
// a w tabeli zostałby wiersz-sierota z samym telefonem.
async function upsertContact(
  db: PoolClient,
  clientId: number,
  client: ClientInfo,
  userId: number
): Promise<void> {
  const firstName = client.firstName.trim();
  const lastName = client.lastName.trim();
  if (firstName === '' && lastName === '') return;

  const phone = client.phone.trim();
  const email = client.email.trim();

  // Dopasowanie MUSI być tym samym wyrażeniem co unikalny indeks z migracji 010,
  // inaczej SELECT nie znajdzie wiersza, a INSERT rozbije się o ten indeks.
  const existing = await db.query<{ id: number }>(
    `SELECT id FROM client_contacts
     WHERE client_id = $1
       AND LOWER(TRIM(COALESCE(first_name, ''))) = LOWER($2)
       AND LOWER(TRIM(COALESCE(last_name,  ''))) = LOWER($3)
     ORDER BY id ASC
     LIMIT 1`,
    [clientId, firstName, lastName]
  );

  if (existing.rows.length === 0) {
    await db.query(
      `INSERT INTO client_contacts (client_id, first_name, last_name, phone, email, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [clientId, firstName || null, lastName || null, phone || null, email || null, userId]
    );
    return;
  }

  // Ta sama reguła co przy firmie: uzupełniamy luki, nie nadpisujemy. Kontakt jest
  // wspólny dla całego działu — pusty formularz jednego handlowca nie może skasować
  // telefonu, który wpisał ktoś inny. Poprawki zostają dla panelu admina.
  await db.query(
    `UPDATE client_contacts
     SET phone      = COALESCE(NULLIF(TRIM(phone), ''), $1),
         email      = COALESCE(NULLIF(TRIM(email), ''), $2),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [phone || null, email || null, existing.rows[0].id]
  );
}

// Synchronizuje "kontakt główny" wpisany wprost w formularzu klienta (panel admina
// Klienci, app/api/admin/clients) do wspólnej tabeli client_contacts, żeby ta sama
// osoba była widoczna w zakładce Kontakty. Bez tego admin wpisywał dane osoby w
// Klienci i nigdzie się one nie pojawiały — client_contacts zasilały wyłącznie
// zapis oferty i przycisk "Zapisz kontakt" w kalkulatorze.
//
// W odróżnieniu od upsertContact() wyżej (gap-fill, bo tam handlowiec mógł wysłać
// niepełny formularz) TA funkcja NADPISUJE telefon/e-mail wprost — admin edytujący
// Klienci jest tu źródłem prawdy, nie ma powodu chronić starszych danych przed jego
// własną poprawką.
export async function syncPrimaryContact(
  db: PoolClient,
  clientId: number,
  contact: { firstName: string; lastName: string; phone: string; email: string },
  userId: number
): Promise<void> {
  const firstName = contact.firstName.trim();
  const lastName = contact.lastName.trim();
  if (firstName === '' && lastName === '') return;

  const phone = contact.phone.trim();
  const email = contact.email.trim();

  // To samo wyrażenie dopasowania co przy unikalnym indeksie z migracji 010 i przy
  // upsertContact() wyżej — inaczej SELECT nie trafi w ten sam wiersz co INSERT.
  const existing = await db.query<{ id: number }>(
    `SELECT id FROM client_contacts
     WHERE client_id = $1
       AND LOWER(TRIM(COALESCE(first_name, ''))) = LOWER($2)
       AND LOWER(TRIM(COALESCE(last_name,  ''))) = LOWER($3)
     ORDER BY id ASC
     LIMIT 1`,
    [clientId, firstName, lastName]
  );

  if (existing.rows.length === 0) {
    await db.query(
      `INSERT INTO client_contacts (client_id, first_name, last_name, phone, email, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [clientId, firstName || null, lastName || null, phone || null, email || null, userId]
    );
    return;
  }

  await db.query(
    `UPDATE client_contacts
     SET phone      = $1,
         email      = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [phone || null, email || null, existing.rows[0].id]
  );
}

// Dopisz lub zaktualizuj klienta na podstawie danych z oferty. Zwraca clients.id
// (do wpisania w offers.client_id) albo null, gdy oferta nie niesie nic, co
// identyfikowałoby firmę.
//
// MUSI dostać PoolClient z otwartej transakcji, nie pulę — dopisanie klienta i zapis
// oferty mają się udać albo nie udać razem. Inaczej nieudany zapis oferty zostawiałby
// w katalogu klienta-widmo bez ani jednej oferty.
export async function upsertClientFromOffer(
  db: PoolClient,
  client: ClientInfo,
  userId: number
): Promise<number | null> {
  const company = client.company.trim();
  const nip = client.nip.trim();

  // Bez nazwy firmy nie ma czego dopisywać. Sam NIP bez firmy to zwykle stan
  // przejściowy w trakcie pisania, a nie klient — nie zaśmiecamy nim katalogu.
  if (company === '') return null;

  const address = client.address.trim();
  const sapId = client.sapId.trim();
  const firstName = client.firstName.trim();
  const lastName = client.lastName.trim();
  const phone = client.phone.trim();
  const email = client.email.trim();

  const existingId = await findClientId(db, company, nip);

  if (existingId === null) {
    const inserted = await db.query<{ id: number }>(
      `INSERT INTO clients (company, nip, address, sap_id, first_name, last_name, phone, email, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        company,
        nip || null,
        address || null,
        sapId || null,
        firstName || null,
        lastName || null,
        phone || null,
        email || null,
        userId,
      ]
    );

    const newId = inserted.rows[0].id;
    await upsertContact(db, newId, client, userId);
    return newId;
  }

  // UZUPEŁNIAMY LUKI, NIE NADPISUJEMY.
  //
  // COALESCE(NULLIF(TRIM(kolumna), ''), $n) czyta się: "zostaw to, co w bazie, chyba
  // że jest puste — wtedy weź to z oferty".
  //
  // Katalog jest współdzielony przez cały dział, a formularz oferty bywa wypełniany
  // byle jak (skrócony adres, firma wpisana z literówką). Gdyby zapis oferty nadpisywał
  // rekord w całości, jeden handlowiec psułby dane wyczyszczone przez admina i to bez
  // śladu. Pusty adres uzupełni się sam przy pierwszej ofercie, która go niesie;
  // POPRAWKA istniejącej wartości jest świadomie zarezerwowana dla panelu admina.
  await db.query(
    `UPDATE clients
     SET company    = COALESCE(NULLIF(TRIM(company),    ''), $1),
         nip        = COALESCE(NULLIF(TRIM(nip),        ''), $2),
         address    = COALESCE(NULLIF(TRIM(address),    ''), $3),
         sap_id     = COALESCE(NULLIF(TRIM(sap_id),     ''), $4),
         first_name = COALESCE(NULLIF(TRIM(first_name), ''), $5),
         last_name  = COALESCE(NULLIF(TRIM(last_name),  ''), $6),
         phone      = COALESCE(NULLIF(TRIM(phone),      ''), $7),
         email      = COALESCE(NULLIF(TRIM(email),      ''), $8),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $9`,
    [
      company,
      nip || null,
      address || null,
      sapId || null,
      firstName || null,
      lastName || null,
      phone || null,
      email || null,
      existingId,
    ]
  );

  // Kontakt dopisujemy OSOBNO, także gdy firma jest już w katalogu. To jest właśnie ten
  // przypadek, w którym stary model się wykładał: firma istnieje od miesięcy, jej
  // kolumny kontaktowe są zajęte przez pierwszą osobę, a handlowiec dopisuje drugą.
  await upsertContact(db, existingId, client, userId);

  return existingId;
}
