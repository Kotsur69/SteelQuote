-- Migration: global default payment term = 30 days from invoice receipt.
-- Run this manually with: psql $DATABASE_URL -f migrations/034_payment_term_default_30.sql
--
-- From 2.1 the calculator no longer lets the seller pick a payment term per offer: it is
-- taken from the client (clients.payment_term_days, edited in Klienci / senior panel) or,
-- when the client has none, from app_settings.payment_term_days. The per-offer picker is
-- replaced by "Ważność oferty" in hours (offer_data.quoteValidityHours, JSON only - no column).
-- Business default is 30 days, so the global value and the column default move from 7 to 30.
-- Clients with their own term are not touched.
--
-- Safe to run before or after the 2.1 code: old code just reads the new number.

SET client_encoding = 'UTF8';

ALTER TABLE app_settings ALTER COLUMN payment_term_days SET DEFAULT 30;

UPDATE app_settings SET payment_term_days = 30 WHERE id = 1;
