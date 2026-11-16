-- Migration: default margin % a new calculator item starts with (v2.3)
-- Run this manually with: psql $DATABASE_URL -f migrations/037_add_default_margin_pct.sql
--
-- Until now the calculator hard-coded 7 % as the starting margin. The admin now sets it in
-- Ustawienia, next to min_margin_pct (014). They are separate on purpose: min_margin_pct is the
-- warning threshold, default_margin_pct is only the value the salesperson sees first.
--
-- The server also treats this value as "the system default" for roles without the
-- can_change_price_margin permission (lib/access/fieldGuards.ts): they may save it unchanged.
--
-- DEFAULT 7 keeps today's behaviour. Idempotent (IF NOT EXISTS), safe to run repeatedly.

ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS default_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 7;

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_default_margin_pct_sane;
ALTER TABLE app_settings
    ADD CONSTRAINT app_settings_default_margin_pct_sane CHECK (default_margin_pct >= 0 AND default_margin_pct <= 100);
