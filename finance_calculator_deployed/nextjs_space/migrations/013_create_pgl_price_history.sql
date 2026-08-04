-- Migration: historia zmian cen bazowych PGL per typ stali (HRS/CR/HDG)
-- Run this manually with: psql $DATABASE_URL -f migrations/013_create_pgl_price_history.sql
--
-- Kontekst: app_settings.pgl_base_hrs/cr/hdg (migracja 011) trzyma TYLKO aktualną wartość —
-- updated_by/updated_at pokazują kto i kiedy zmienił OSTATNI raz, ale nie zostawiają śladu
-- poprzednich zmian. Ta tabela to log: jeden wiersz = jedna zmiana jednego typu stali,
-- ze starą i nową wartością. Wypełniana wyłącznie z PATCH /api/settings (app/api/settings/route.ts).

BEGIN;

CREATE TABLE IF NOT EXISTS pgl_price_history (
    id         SERIAL PRIMARY KEY,
    steel_type TEXT NOT NULL CHECK (steel_type IN ('HRS', 'CR', 'HDG')),
    old_price  NUMERIC(10,2) NOT NULL,
    new_price  NUMERIC(10,2) NOT NULL,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Historia jest zawsze czytana posortowana od najnowszych (patrz GET /api/settings/pgl-history).
CREATE INDEX IF NOT EXISTS idx_pgl_price_history_changed_at ON pgl_price_history (changed_at DESC);

\echo '== pgl_price_history po migracji =='
SELECT count(*) AS existing_rows FROM pgl_price_history;

COMMIT;
-- W razie problemów zamiast powyższego COMMIT użyj:
-- ROLLBACK;
