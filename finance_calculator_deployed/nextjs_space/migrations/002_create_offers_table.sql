-- Migration: Create offers table for storing calculator state
-- Run this manually with: psql $DATABASE_URL -f migrations/002_create_offers_table.sql

CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offer_name VARCHAR(255) NOT NULL,
    offer_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster user queries
CREATE INDEX IF NOT EXISTS idx_offers_user_id ON offers(user_id);

-- Create index for ordering by date
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON offers(created_at DESC);
