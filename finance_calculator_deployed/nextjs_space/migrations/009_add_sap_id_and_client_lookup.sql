-- Migration: SAP_ID klienta + indeksy pod wyszukiwarkę firmy/NIP-u w kalkulatorze
-- Run: psql $DATABASE_URL -f migrations/009_add_sap_id_and_client_lookup.sql
--
-- Kontekst: do tej pory tabela `clients` była zasilana WYŁĄCZNIE przez panel admina
-- (plus jednorazowy backfill z migracji 006). Kalkulator zapisywał dane klienta tylko
-- do blobu offer_data i nigdy nie dotykał `clients`. Od tej zmiany zapis oferty
-- dopisuje/aktualizuje klienta w katalogu (patrz lib/clientDirectory.ts), a pola
-- "Firma" i "NIP" w kalkulatorze działają jak wyszukiwarki po tym katalogu.
--
-- Bezpieczna przy wielokrotnym uruchomieniu (IF NOT EXISTS wszędzie).

BEGIN;

-- --- SAP_ID -----------------------------------------------------------------
-- Istniejący klienci dostają NULL. To świadome: SAP_ID uzupełnia się z czasem,
-- a puste pole nie może blokować wyceny. Handlowiec wpisze go ręcznie przy
-- pierwszej ofercie dla danej firmy, upsert go wtedy utrwali w katalogu.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sap_id VARCHAR(50);

-- --- Indeksy pod wyszukiwarkę (infiks) --------------------------------------
-- Wyszukiwarka dopasowuje frazę przez ILIKE '%fraza%'. Przy dopasowaniu
-- infiksowym btree jest bezużyteczny (nie ma wspólnego prefiksu), dlatego GIN
-- + pg_trgm. Rozszerzenie włączyła już migracja 008, ale powtarzamy warunkowo,
-- żeby ta migracja działała też na świeżej bazie puszczonej bez 008.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_clients_company_trgm ON clients USING gin (company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_nip_trgm     ON clients USING gin (nip     gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_sap_id_trgm  ON clients USING gin (sap_id  gin_trgm_ops);

-- --- Indeksy pod dopasowanie klienta przy zapisie oferty ---------------------
-- Upsert szuka klienta po znormalizowanym NIP-ie, a gdy NIP-u brak — po nazwie
-- firmy. Indeksy funkcyjne muszą użyć DOKŁADNIE tego samego wyrażenia co zapytanie
-- w lib/clientDirectory.ts, inaczej planer ich nie użyje.
CREATE INDEX IF NOT EXISTS idx_clients_nip_norm     ON clients (LOWER(TRIM(nip)));
CREATE INDEX IF NOT EXISTS idx_clients_company_norm ON clients (LOWER(TRIM(company)));

-- --- Kontrola PRZED COMMIT ---------------------------------------------------

\echo '== Kolumny tabeli clients =='
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clients'
ORDER BY ordinal_position;

\echo '== Klienci w katalogu (z podziałem na wypełniony SAP_ID) =='
SELECT COUNT(*)                                                      AS clients_total,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(sap_id), '') IS NOT NULL)  AS with_sap_id,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(nip), '')    IS NOT NULL)  AS with_nip
FROM clients;

\echo '== Potencjalne duplikaty po NIP-ie (upsert wybierze najstarszego) =='
SELECT LOWER(TRIM(nip)) AS nip_norm, COUNT(*) AS ile
FROM clients
WHERE NULLIF(TRIM(nip), '') IS NOT NULL
GROUP BY 1
HAVING COUNT(*) > 1
ORDER BY ile DESC;

COMMIT;
-- W razie problemów zamiast powyższego COMMIT użyj:
-- ROLLBACK;
