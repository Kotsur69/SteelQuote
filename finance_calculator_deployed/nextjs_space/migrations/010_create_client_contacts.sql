-- Migration: osoby kontaktowe jako osobna tabela, wspólna dla całego działu
-- Run: psql $DATABASE_URL -f migrations/010_create_client_contacts.sql
--
-- Kontekst: po migracji 009 kontakt mieścił się w tabeli `clients` jako JEDEN komplet
-- kolumn (first_name/last_name/phone/email). To dawało dwa problemy naraz:
--
--   1. Jedna firma = jedna osoba. Huta ma kupca, technologa i kogoś od logistyki;
--      drugi kontakt nie miał się gdzie zapisać.
--   2. Zapis oferty uzupełnia tylko puste pola (patrz lib/clientDirectory.ts), więc
--      PIERWSZA osoba wpisana dla danej firmy blokowała miejsce na zawsze — kolejne
--      kontakty ginęły bez śladu.
--
-- Stąd osobna tabela: wiele osób na firmę, widoczne dla każdego handlowca, podpowiadane
-- pod polem "Imię" w kalkulatorze.
--
-- Kolumny kontaktowe w `clients` ZOSTAJĄ i nadal działają jak dotąd — to "kontakt
-- główny" widoczny w panelu admina (app/admin/klienci). Nie ruszamy ich, żeby ta
-- migracja niczego nie zepsuła; nowe kontakty dopisują się DODATKOWO tutaj.
--
-- Bezpieczna przy wielokrotnym uruchomieniu (IF NOT EXISTS wszędzie).

BEGIN;

CREATE TABLE IF NOT EXISTS client_contacts (
    id SERIAL PRIMARY KEY,
    -- ON DELETE CASCADE, nie SET NULL: kontakt bez firmy jest bezużyteczny — nie da
    -- się go już podpowiedzieć, bo podpowiedzi filtruje się właśnie po client_id.
    client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    first_name VARCHAR(100),
    last_name  VARCHAR(100),
    phone      VARCHAR(50),
    email      VARCHAR(255),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Podstawowe zapytanie to "wszystkie osoby tej firmy" — lista jest krótka, więc
-- wystarczy indeks po kluczu obcym, bez trigramów jak przy wyszukiwarce firm.
CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id ON client_contacts(client_id);

-- Tożsamość osoby = firma + imię + nazwisko (znormalizowane). Wyrażenie MUSI być
-- identyczne z tym w lib/clientDirectory.ts, inaczej kod trafiłby obok indeksu i
-- zaczął dublować te same osoby przy każdym zapisie oferty.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contacts_person
    ON client_contacts (
        client_id,
        LOWER(TRIM(COALESCE(first_name, ''))),
        LOWER(TRIM(COALESCE(last_name,  '')))
    );

-- --- Backfill z kolumn kontaktowych w `clients` ------------------------------
-- Bez tego lista podpowiedzi startuje pusta, mimo że kontakty od miesięcy siedzą
-- w katalogu. ON CONFLICT DO NOTHING sprawia, że powtórne uruchomienie migracji
-- niczego nie dubluje.
INSERT INTO client_contacts (client_id, first_name, last_name, phone, email, created_by, created_at, updated_at)
SELECT c.id,
       NULLIF(TRIM(c.first_name), ''),
       NULLIF(TRIM(c.last_name),  ''),
       NULLIF(TRIM(c.phone),      ''),
       NULLIF(TRIM(c.email),      ''),
       c.created_by,
       c.created_at,
       c.updated_at
FROM clients c
-- Bez imienia i nazwiska nie ma czego podpowiadać pod polem "Imię" — sam telefon
-- bez osoby to nie jest kontakt, którego dałoby się wyszukać.
WHERE NULLIF(TRIM(c.first_name), '') IS NOT NULL
   OR NULLIF(TRIM(c.last_name),  '') IS NOT NULL
ON CONFLICT DO NOTHING;

-- --- Kontrola PRZED COMMIT ---------------------------------------------------

\echo '== Kolumny tabeli client_contacts =='
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'client_contacts'
ORDER BY ordinal_position;

\echo '== Przeniesione kontakty =='
SELECT COUNT(*)                                                     AS contacts_total,
       COUNT(DISTINCT client_id)                                    AS companies_with_contact,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(phone), '') IS NOT NULL)  AS with_phone,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(email), '') IS NOT NULL)  AS with_email
FROM client_contacts;

\echo '== Firmy z kontaktem w clients, ale bez wiersza w client_contacts (spodziewane: 0) =='
SELECT COUNT(*) AS missed
FROM clients c
WHERE (NULLIF(TRIM(c.first_name), '') IS NOT NULL OR NULLIF(TRIM(c.last_name), '') IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.client_id = c.id);

COMMIT;
-- W razie problemów zamiast powyższego COMMIT użyj:
-- ROLLBACK;
