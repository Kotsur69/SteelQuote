-- Migration: Extract clients into their own table + migrate data from offers.client_*
-- Run this manually with: psql $DATABASE_URL -f migrations/006_create_clients_table.sql
--
-- Dziś dane klienta są wpisywane ręcznie w każdej ofercie (kolumny client_* z migracji 003).
-- Wydzielamy je do tabeli clients i podpinamy offers.client_id.
--
-- WAŻNE: stare kolumny offers.client_* ZOSTAJĄ (nie usuwamy ich w tej turze) — przestają
-- tylko być źródłem prawdy. Migracja danych jest heurystyczna (dedup po NIP/e-mailu),
-- dlatego całość jest w transakcji z kontrolnymi SELECT-ami PRZED COMMIT — obejrzyj wynik
-- i dopiero wtedy zatwierdź (albo ROLLBACK, jeśli liczby wyglądają źle).

BEGIN;

-- --- Tabela clients ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100),
    last_name  VARCHAR(100),
    company    VARCHAR(255),
    nip        VARCHAR(50),
    address    TEXT,
    phone      VARCHAR(50),
    email      VARCHAR(255),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_offers_client_id ON offers(client_id);

-- --- Migracja danych z offers.client_* --------------------------------------
--
-- Klucz deduplikacji dla jednej oferty:
--   1. NIP (jeśli niepusty), inaczej
--   2. e-mail (jeśli niepusty), inaczej
--   3. imię|nazwisko|firma
-- wszystko znormalizowane przez lower(trim(...)). Oferty całkowicie puste w polach
-- klienta są pomijane (pozostaną z client_id = NULL).
--
-- Definiujemy klucz raz, jako widok tymczasowy, żeby TEN SAM wzór użyć do wstawienia
-- klientów i do backfillu offers.client_id (spójność jest tu krytyczna).

CREATE TEMP VIEW offer_client_key AS
SELECT
    o.id AS offer_id,
    o.user_id,
    o.created_at,
    o.updated_at,
    NULLIF(TRIM(o.client_first_name), '') AS first_name,
    NULLIF(TRIM(o.client_last_name), '')  AS last_name,
    NULLIF(TRIM(o.client_company), '')    AS company,
    NULLIF(TRIM(o.client_nip), '')        AS nip,
    NULLIF(TRIM(o.client_address), '')    AS address,
    NULLIF(TRIM(o.client_phone), '')      AS phone,
    NULLIF(TRIM(o.client_email), '')      AS email,
    LOWER(COALESCE(
        NULLIF(TRIM(o.client_nip), ''),
        NULLIF(TRIM(o.client_email), ''),
        NULLIF(
            TRIM(COALESCE(o.client_first_name, '') || '|' ||
                 COALESCE(o.client_last_name, '')  || '|' ||
                 COALESCE(o.client_company, '')), '|||')
    )) AS dedup_key
FROM offers o;

-- Wstaw po jednym kliencie na dedup_key (najstarsza oferta wygrywa jako źródło danych).
INSERT INTO clients (first_name, last_name, company, nip, address, phone, email, created_by, created_at, updated_at)
SELECT DISTINCT ON (dedup_key)
    first_name, last_name, company, nip, address, phone, email, user_id, created_at, updated_at
FROM offer_client_key
WHERE dedup_key IS NOT NULL AND dedup_key <> ''
ORDER BY dedup_key, created_at ASC;

-- Backfill offers.client_id po tym samym kluczu.
UPDATE offers o
SET client_id = c.id
FROM offer_client_key k
JOIN clients c ON c.id = (
    SELECT c2.id FROM clients c2
    WHERE LOWER(COALESCE(
              NULLIF(TRIM(c2.nip), ''),
              NULLIF(TRIM(c2.email), ''),
              NULLIF(TRIM(COALESCE(c2.first_name, '') || '|' ||
                          COALESCE(c2.last_name, '')  || '|' ||
                          COALESCE(c2.company, '')), '|||')
          )) = k.dedup_key
    ORDER BY c2.id ASC
    LIMIT 1
)
WHERE o.id = k.offer_id
  AND k.dedup_key IS NOT NULL AND k.dedup_key <> '';

-- --- Kontrola PRZED COMMIT ---------------------------------------------------
-- Obejrzyj wyniki. Jeśli OK -> COMMIT (na dole). Jeśli źle -> wpisz ROLLBACK.

\echo '== Liczba ofert ogółem =='
SELECT COUNT(*) AS offers_total FROM offers;

\echo '== Oferty z podpiętym klientem =='
SELECT COUNT(*) AS offers_with_client FROM offers WHERE client_id IS NOT NULL;

\echo '== Oferty bez klienta (spodziewane: puste dane klienta) =='
SELECT COUNT(*) AS offers_without_client FROM offers WHERE client_id IS NULL;

\echo '== Utworzeni klienci (unikalni) =='
SELECT COUNT(*) AS clients_created FROM clients;

-- Jeśli liczby się zgadzają:
COMMIT;
-- W razie problemów zamiast powyższego COMMIT użyj:
-- ROLLBACK;
