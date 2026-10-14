-- Migration: who saved each offer version.
-- Run this manually with: psql $DATABASE_URL -f migrations/033_offer_version_author.sql
--
-- Every saved edit of an offer becomes a new offers row (015_offer_versions.sql), but the row
-- keeps the OWNER's user_id - a reviewer correcting someone's offer must not take it over. So
-- until now nothing recorded who actually made a version. created_by is that editor:
--   * POST /api/offers and the duplicate route set it to the creator,
--   * PUT /api/offers/[id] sets it to the editor when it inserts a new version.
-- The offer lists derive "edited by reviewer" from created_by <> user_id (lib/offerVersionDiff.ts).
-- Rows saved before this migration keep NULL and are shown without an author.
--
-- DEPLOY ORDER: run this BEFORE deploying the code that reads created_by. Unlike 032 there is
-- no code fallback - without the column every offer list (/offers, /admin/oferty, /senior) and
-- every offer save returns 500. Running it first is safe: the column is nullable and the old
-- code never reads it.
-- ON DELETE SET NULL for the same reason as offers.reviewed_by: deleting a user must not
-- delete or block the offers they touched.

SET client_encoding = 'UTF8';

BEGIN;

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN offers.created_by IS
    'User who saved this offer version (creator or editor); NULL for rows saved before migration 033.';

COMMIT;
