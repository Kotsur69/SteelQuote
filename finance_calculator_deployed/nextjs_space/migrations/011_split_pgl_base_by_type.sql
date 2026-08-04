-- Migration: PGL bazowe osobno dla HRS / CR / HDG (zamiast jednej wspólnej wartości)
-- Run this manually with: psql $DATABASE_URL -f migrations/011_split_pgl_base_by_type.sql
--
-- Kontekst: do tej pory `app_settings.pgl_base` było JEDNĄ wartością współdzieloną przez
-- wszystkie trzy typy stali w kalkulatorze — HRS, CR i HDG mają jednak różne bazowe ceny
-- wsadu w praktyce. Rozdzielamy na trzy kolumny; stara `pgl_base` znika, bo nic poza tą
-- migracją po nią nie sięga (zapisane oferty trzymają własną zamrożoną kopię PGL w
-- offer_data, nie referencję do tej tabeli).
--
-- Bezpieczne przy wielokrotnym uruchomieniu: backfill przez COALESCE nie nadpisze
-- wartości, które admin już ustawił nowym panelem po pierwszym przebiegu tej migracji.

BEGIN;

ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS pgl_base_hrs NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS pgl_base_cr  NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS pgl_base_hdg NUMERIC(10,2);

-- Backfill z dotychczasowej wspólnej wartości. COALESCE = no-op przy ponownym uruchomieniu
-- po tym, jak admin już rozdzielił wartości przez nowy panel.
-- Owinięte w warunek na istnienie pgl_base: przy kolejnym uruchomieniu tej migracji (np. przy
-- każdym starcie steelquote-start.ps1) kolumna pgl_base jest już usunięta niżej w tym samym
-- pliku, więc bezwarunkowy UPDATE referencjonujący ją wywalałby się na starcie za drugim razem.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_settings' AND column_name = 'pgl_base'
    ) THEN
        UPDATE app_settings
        SET pgl_base_hrs = COALESCE(pgl_base_hrs, pgl_base, 645),
            pgl_base_cr  = COALESCE(pgl_base_cr,  pgl_base, 645),
            pgl_base_hdg = COALESCE(pgl_base_hdg, pgl_base, 645)
        WHERE id = 1;
    END IF;
END $$;

ALTER TABLE app_settings
    ALTER COLUMN pgl_base_hrs SET DEFAULT 645,
    ALTER COLUMN pgl_base_cr  SET DEFAULT 645,
    ALTER COLUMN pgl_base_hdg SET DEFAULT 645,
    ALTER COLUMN pgl_base_hrs SET NOT NULL,
    ALTER COLUMN pgl_base_cr  SET NOT NULL,
    ALTER COLUMN pgl_base_hdg SET NOT NULL;

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pgl_base_hrs_sane;
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pgl_base_cr_sane;
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pgl_base_hdg_sane;

ALTER TABLE app_settings
    ADD CONSTRAINT app_settings_pgl_base_hrs_sane CHECK (pgl_base_hrs >= 0),
    ADD CONSTRAINT app_settings_pgl_base_cr_sane  CHECK (pgl_base_cr  >= 0),
    ADD CONSTRAINT app_settings_pgl_base_hdg_sane CHECK (pgl_base_hdg >= 0);

-- Stara wspólna kolumna i jej CHECK — nic poza tą migracją już po nią nie sięga.
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pgl_sane;
ALTER TABLE app_settings DROP COLUMN IF EXISTS pgl_base;

\echo '== app_settings po migracji =='
SELECT id, eur_pln_rate, pgl_base_hrs, pgl_base_cr, pgl_base_hdg, transport_base FROM app_settings;

COMMIT;
-- W razie problemów zamiast powyższego COMMIT użyj:
-- ROLLBACK;
