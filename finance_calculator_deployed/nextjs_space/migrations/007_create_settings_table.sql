-- Migration: globalne ustawienia aplikacji (kurs EUR/PLN, bazowe PGL, bazowy transport)
-- Run this manually with: psql $DATABASE_URL -f migrations/007_create_settings_table.sql
--
-- Do tej pory PGL bazowe (645), transport (20) i brak kursu były zaszyte na sztywno
-- w components/Calculator.tsx. Wydzielamy je do bazy, żeby admin mógł je zmieniać z panelu.
--
-- Tabela jest JEDNOWIERSZOWA (CHECK id = 1) — to nie jest słownik, tylko jeden globalny
-- zestaw nastaw. Dzięki temu odczyt to zwykły SELECT bez ORDER BY/LIMIT i nie da się
-- przypadkiem stworzyć drugiego, konkurencyjnego wiersza ustawień.
--
-- WAŻNE: te wartości są DOMYŚLNE dla nowej kalkulacji. Zapisane oferty trzymają własne
-- kopie PGL/transportu i własny zamrożony kurs w offer_data — zmiana ustawień NIE przelicza
-- wstecz istniejących ofert.

BEGIN;

CREATE TABLE IF NOT EXISTS app_settings (
    id             INTEGER PRIMARY KEY DEFAULT 1,
    eur_pln_rate   NUMERIC(10,4) NOT NULL DEFAULT 4.3000,
    pgl_base       NUMERIC(10,2) NOT NULL DEFAULT 645,
    transport_base NUMERIC(10,2) NOT NULL DEFAULT 20,
    updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT app_settings_single_row CHECK (id = 1),
    CONSTRAINT app_settings_rate_sane   CHECK (eur_pln_rate > 0 AND eur_pln_rate <= 100),
    CONSTRAINT app_settings_pgl_sane    CHECK (pgl_base >= 0),
    CONSTRAINT app_settings_transp_sane CHECK (transport_base >= 0)
);

-- Seed = dzisiejsze hardkody z Calculator.tsx (pglBase 645, transport 20) + kurs 4,30.
-- ON CONFLICT DO NOTHING => ponowne puszczenie migracji nie nadpisze zmian admina.
INSERT INTO app_settings (id, eur_pln_rate, pgl_base, transport_base)
VALUES (1, 4.3000, 645, 20)
ON CONFLICT (id) DO NOTHING;

\echo '== Ustawienia po migracji =='
SELECT id, eur_pln_rate, pgl_base, transport_base FROM app_settings;

COMMIT;
-- W razie problemów zamiast powyższego COMMIT użyj:
-- ROLLBACK;
