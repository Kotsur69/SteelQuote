-- Migration: minimalna marża wymagana do bezpośredniej wysyłki oferty przez juniora
-- Run this manually with: psql $DATABASE_URL -f migrations/014_add_min_margin_pct.sql
--
-- Kontekst: junior mógł dotąd wysłać ofertę do klienta WYŁĄCZNIE po zatwierdzeniu przez
-- seniora/admina (submit -> pending_review -> approve -> send). Od teraz może wysłać
-- bezpośrednio z draftu, jeśli KAŻDA pozycja w ofercie ma marżę >= tego progu ORAZ PGL
-- bazowe >= aktualnej wartości bazowej dla swojego typu stali (patrz lib/offerReview.ts).
-- W przeciwnym razie oferta nadal wymaga pełnej ścieżki zatwierdzenia jak dotychczas.

ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS min_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 7;

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_min_margin_pct_sane;
ALTER TABLE app_settings
    ADD CONSTRAINT app_settings_min_margin_pct_sane CHECK (min_margin_pct >= 0 AND min_margin_pct <= 100);
