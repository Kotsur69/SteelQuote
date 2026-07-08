-- Migration: Add client information columns to offers table
-- Run this manually with: psql $DATABASE_URL -f migrations/003_add_client_info_to_offers.sql

-- Add client information columns
ALTER TABLE offers ADD COLUMN IF NOT EXISTS client_first_name VARCHAR(100);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS client_last_name VARCHAR(100);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS client_company VARCHAR(255);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS client_nip VARCHAR(50);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS client_phone VARCHAR(50);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS client_email VARCHAR(255);
