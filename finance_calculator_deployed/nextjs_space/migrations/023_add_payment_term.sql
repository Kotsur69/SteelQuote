-- Migration: termin płatności oferty (data obok "okresu ważności oferty")
-- Run this manually with: psql $DATABASE_URL -f migrations/023_add_payment_term.sql
--
-- Kontekst: PDF pokazywał tylko generyczne "Warunki płatności: wg ustaleń indywidualnych".
-- Handlowiec ma teraz wybrać konkretną datę (Ważna od + N dni), gdzie N to domyślny termin
-- klienta (jeśli ustawiony) albo globalny domyślny z Ustawień — dokładnie jak scrap_pct/
-- min_margin_pct (migracja 014/022).

ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS payment_term_days INTEGER NOT NULL DEFAULT 7;

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_payment_term_days_sane;
ALTER TABLE app_settings
    ADD CONSTRAINT app_settings_payment_term_days_sane CHECK (payment_term_days >= 0 AND payment_term_days <= 365);

-- NULL = klient dziedziczy globalny domyślny termin z app_settings.payment_term_days.
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS payment_term_days INTEGER;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_payment_term_days_sane;
ALTER TABLE clients
    ADD CONSTRAINT clients_payment_term_days_sane CHECK (payment_term_days IS NULL OR (payment_term_days >= 0 AND payment_term_days <= 365));
