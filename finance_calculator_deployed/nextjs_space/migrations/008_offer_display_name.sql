-- Migration: nazwa zastepcza oferty ("offer_[ID]") + wyszukiwanie ofert
-- Run this manually with: psql $DATABASE_URL -f migrations/008_offer_display_name.sql
--
-- KTO NADAJE ID: nikt nowy. offers.id to od migracji 002 zwykly SERIAL, czyli sekwencja
-- Postgresa. Sekwencja jest NIETRANSAKCYJNA: nextval() nigdy nie wyda dwa razy tej samej
-- liczby, a skasowanie oferty 29 NIE sprawia, ze nastepna dostanie znowu 29. To juz jest
-- trwaly stan, ktorego szukamy - nie dokladamy tabeli-licznika (wymagalaby blokady wiersza
-- przy kazdym zapisie oferty, serializowalaby zapisy i moglaby sie zakleszczyc).
-- Konsekwencja swiadomie zaakceptowana: nieudany/wycofany INSERT spala numer, wiec w numeracji
-- moga pojawic sie dziury (28, 29, 31). Numery sa UNIKALNE i ROSNACE, ale nie ciagle.
--
-- offer_name trzyma teraz WYLACZNIE to, co wpisal handlowiec (moze byc NULL/puste).
-- display_name to kolumna GENEROWANA - Postgres liczy ja z tego samego wiersza, wiec
-- nazwa zastepcza powstaje w tym samym INSERCIE co ID (bez drugiego zapytania i bez wyscigu).

BEGIN;

-- Puste = brak nazwy od handlowca. Do tej pory kolumna byla NOT NULL i API wymuszalo nazwe.
ALTER TABLE offers ALTER COLUMN offer_name DROP NOT NULL;

-- id::text (a nie 'offer_' || id) jest konieczne: operator text || anynonarray jest w Postgresie
-- STABLE, a kolumna generowana dopuszcza tylko wyrazenia IMMUTABLE. Jawny cast int4->text jest
-- immutable, wiec wyrazenie przechodzi.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)
    GENERATED ALWAYS AS (
        COALESCE(NULLIF(TRIM(offer_name), ''), 'offer_' || id::text)
    ) STORED;

-- Indeks trigramowy daje szybkie ILIKE '%fraza%'. pg_trgm bywa niedostepny na hostingu
-- (brak uprawnien do CREATE EXTENSION), wiec probujemy, a w razie porazki lecimy dalej -
-- wyszukiwanie dziala i bez indeksu, tylko wolniej (przy tej skali: bez znaczenia).
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm niedostepny (%) - pomijam indeks trigramowy', SQLERRM;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE INDEX IF NOT EXISTS idx_offers_display_name_trgm
            ON offers USING gin (display_name gin_trgm_ops);
    ELSE
        -- Fallback: btree po lower() obsluzy przynajmniej wyszukiwanie od poczatku nazwy.
        CREATE INDEX IF NOT EXISTS idx_offers_display_name_lower
            ON offers (lower(display_name));
    END IF;
END $$;

\echo '== Oferty po migracji (nazwa handlowca vs nazwa wyswietlana) =='
SELECT id, offer_name, display_name FROM offers ORDER BY id;

COMMIT;
-- W razie problemow zamiast powyzszego COMMIT uzyj:
-- ROLLBACK;
