-- Migration: offers belong to a flow + per-offer approval steps (v2.0)
-- Run this manually with: psql $DATABASE_URL -f migrations/028_offer_flow_workflow.sql
--
-- On submit, lib/access/routing.ts evaluates the flow's rules and writes one row per approval
-- the offer needs: at most one 'chain' step (the required N-level) and one 'parallel' step
-- per parallel level (NPR). The offer becomes 'approved' when every step is approved.
-- offers.status keeps its existing values (migration 005).

BEGIN;

-- Nullable here; migration 029 backfills legacy offers to Flow 1 and then sets NOT NULL.
-- RESTRICT: flows are deactivated, never deleted while offers reference them.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS flow_id INTEGER REFERENCES flows(id) ON DELETE RESTRICT;

-- Who actually sent the offer - a reviewer may send on the creator's behalf.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Facts + triggered rules at the last evaluation, for the reviewer UI and audit.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS validation_snapshot JSONB;

-- Visibility predicates filter by flow and, for the team scope, by flow + owner.
CREATE INDEX IF NOT EXISTS idx_offers_flow_user ON offers(flow_id, user_id);
CREATE INDEX IF NOT EXISTS idx_offers_sent_by ON offers(sent_by);

CREATE TABLE IF NOT EXISTS offer_approval_steps (
    id                 SERIAL PRIMARY KEY,
    offer_id           INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    track              VARCHAR(10) NOT NULL CHECK (track IN ('chain', 'parallel')),
    -- The level that must approve (after any conflict escalation) ...
    level_id           INTEGER NOT NULL REFERENCES hierarchy_levels(id) ON DELETE RESTRICT,
    -- ... and the level the rules originally demanded. Differs only when escalated (T5).
    required_level_id  INTEGER NOT NULL REFERENCES hierarchy_levels(id) ON DELETE RESTRICT,
    status             VARCHAR(12) NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
    decided_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at         TIMESTAMP WITH TIME ZONE,
    comment            TEXT,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_offer_approval_steps_offer ON offer_approval_steps(offer_id);
-- "Offers awaiting my validation": pending steps by level, then offer.
CREATE INDEX IF NOT EXISTS idx_offer_approval_steps_pending_level
    ON offer_approval_steps(level_id, offer_id) WHERE status = 'pending';
-- "Offers I decided" (a reviewer's own history).
CREATE INDEX IF NOT EXISTS idx_offer_approval_steps_decided_by
    ON offer_approval_steps(decided_by, offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_approval_steps_required_level
    ON offer_approval_steps(required_level_id);
-- At most one open step per offer, track and level.
CREATE UNIQUE INDEX IF NOT EXISTS ux_offer_approval_steps_one_pending
    ON offer_approval_steps(offer_id, track, level_id) WHERE status = 'pending';

COMMIT;
