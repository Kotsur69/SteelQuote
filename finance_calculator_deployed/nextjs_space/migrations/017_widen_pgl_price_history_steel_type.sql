-- Migration: dopuszczenie PICKLED/TEARDROP/ZM w historii zmian cen PGL
-- Run this manually with: psql $DATABASE_URL -f migrations/017_widen_pgl_price_history_steel_type.sql
--
-- Kontekst: migracja 013 ograniczyła pgl_price_history.steel_type do ('HRS','CR','HDG')
-- inline CHECK-iem (nazwa auto-nadana przez Postgresa: pgl_price_history_steel_type_check,
-- potwierdzone zapytaniem do pg_constraint). Rozbudowa o PICKLED/TEARDROP/ZM (migracja 016)
-- wymaga poszerzenia tego samego CHECK-a, inaczej PATCH /api/settings wywali się przy
-- zapisie historii zmiany ceny dla nowych typów.

BEGIN;

ALTER TABLE pgl_price_history DROP CONSTRAINT IF EXISTS pgl_price_history_steel_type_check;

ALTER TABLE pgl_price_history
    ADD CONSTRAINT pgl_price_history_steel_type_check
    CHECK (steel_type IN ('HRS', 'CR', 'HDG', 'PICKLED', 'TEARDROP', 'ZM'));

\echo '== pgl_price_history CHECK po migracji =='
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'pgl_price_history'::regclass AND conname = 'pgl_price_history_steel_type_check';

COMMIT;
-- W razie problemów zamiast powyższego COMMIT użyj:
-- ROLLBACK;
