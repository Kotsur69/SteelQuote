-- Migration: client's answer to a sent offer (won / lost)
-- Run this manually with: psql $DATABASE_URL -f migrations/018_offer_client_decision.sql
--
-- offers.status covers the INTERNAL workflow (draft -> pending_review -> approved/rejected
-- -> sent). It says nothing about what the client answered afterwards, so 'approved' and
-- 'rejected' must NOT be read as won/lost - those are our own review verdicts.
--
-- This adds a separate axis: once an offer is sent, the salesperson records the client's
-- decision. The analytics panel (app/analytics) reads it for won/lost tonnage and win rate.
--
-- Historical data has no decision, so everything backfills to 'pending' via the DEFAULT -
-- we do not guess outcomes for offers sent before this column existed.

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS client_decision VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (client_decision IN ('pending', 'won', 'lost'));

-- When the decision was recorded. NULL while still 'pending'. The analytics panel can
-- bucket the timeline on this date ("decided in month X") instead of created_at/sent_at,
-- so a deal closed in March counts in March even if the offer was written in January.
ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS client_decision_at TIMESTAMP WITH TIME ZONE;

-- Who recorded it. ON DELETE SET NULL for the same reason as offers.reviewed_by: losing
-- an account must not erase the fact that the offer was won or lost.
ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS client_decision_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Free-text reason, mainly for losses ("price", "lead time", "went to competitor").
ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS client_decision_note TEXT;

-- The analytics panel filters and groups by decision -> index.
CREATE INDEX IF NOT EXISTS idx_offers_client_decision ON offers(client_decision);

-- Bucketing the timeline on the decision date filters on this column first.
CREATE INDEX IF NOT EXISTS idx_offers_client_decision_at ON offers(client_decision_at);
