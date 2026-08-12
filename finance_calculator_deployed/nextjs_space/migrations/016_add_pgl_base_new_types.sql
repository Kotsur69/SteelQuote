-- Migration: PGL bazowe dla 3 nowych typów stali — PICKLED / TEARDROP / ZM
-- Run this manually with: psql $DATABASE_URL -f migrations/016_add_pgl_base_new_types.sql
--
-- Kontekst: rozbudowa kalkulatora o PICKLED (HRS Trawiona), TEARDROP (Łezka) i ZM
-- (Magnelis) obok istniejących HRS/CR/HDG — dane klienta, sierpień 2026. Ten sam wzorzec
-- co migracja 011 (pgl_base_hrs/cr/hdg): trzy nowe kolumny NUMERIC z domyślną wartością
-- i CHECK-iem sanity, bez backfillu (kolumny nie istniały wcześniej pod żadną inną nazwą).

BEGIN;

ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS pgl_base_pickled  NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS pgl_base_teardrop NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS pgl_base_zm       NUMERIC(10,2);

UPDATE app_settings
SET pgl_base_pickled  = COALESCE(pgl_base_pickled, 650),
    pgl_base_teardrop = COALESCE(pgl_base_teardrop, 650),
    pgl_base_zm       = COALESCE(pgl_base_zm, 650)
WHERE id = 1;

ALTER TABLE app_settings
    ALTER COLUMN pgl_base_pickled  SET DEFAULT 650,
    ALTER COLUMN pgl_base_teardrop SET DEFAULT 650,
    ALTER COLUMN pgl_base_zm       SET DEFAULT 650,
    ALTER COLUMN pgl_base_pickled  SET NOT NULL,
    ALTER COLUMN pgl_base_teardrop SET NOT NULL,
    ALTER COLUMN pgl_base_zm       SET NOT NULL;

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pgl_base_pickled_sane;
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pgl_base_teardrop_sane;
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pgl_base_zm_sane;

ALTER TABLE app_settings
    ADD CONSTRAINT app_settings_pgl_base_pickled_sane  CHECK (pgl_base_pickled  >= 0),
    ADD CONSTRAINT app_settings_pgl_base_teardrop_sane CHECK (pgl_base_teardrop >= 0),
    ADD CONSTRAINT app_settings_pgl_base_zm_sane       CHECK (pgl_base_zm       >= 0);

\echo '== app_settings po migracji =='
SELECT id, eur_pln_rate, pgl_base_hrs, pgl_base_cr, pgl_base_hdg,
       pgl_base_pickled, pgl_base_teardrop, pgl_base_zm, transport_base
FROM app_settings;

COMMIT;
-- W razie problemów zamiast powyższego COMMIT użyj:
-- ROLLBACK;
