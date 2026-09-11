-- Migration: procent złomu naliczany od ceny wsadu (PGL + Σ Huta)
-- Run this manually with: psql $DATABASE_URL -f migrations/022_add_scrap_pct.sql
--
-- Kontekst: dotąd "Złom" w podsumowaniu SSC był stałą kwotą 10 €/t (SCRAP_CONSTANT
-- w kodzie). Od teraz jest to procent ceny wsadu (pglBase + sumaHuta), konfigurowalny
-- w Ustawieniach przez admina — dokładnie jak min_margin_pct (migracja 014).

ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS scrap_pct NUMERIC(5,2) NOT NULL DEFAULT 2;

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_scrap_pct_sane;
ALTER TABLE app_settings
    ADD CONSTRAINT app_settings_scrap_pct_sane CHECK (scrap_pct >= 0 AND scrap_pct <= 100);
