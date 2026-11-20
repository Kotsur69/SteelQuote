-- Migration: AI assistant actions (docs/ai-assistant-plan.md section 7, phase 3)
-- Run this manually with: psql $DATABASE_URL -f migrations/038_ai_pending_actions.sql
--
-- The assistant never changes data itself: a propose_* tool stores what it WOULD do here and
-- shows the user a confirmation card. Only the user's click on that card executes it, through
-- the same offer service as the app's buttons (lib/offers/service.ts).
--
-- A row is single-use and short-lived (10 minutes). A confirmed row is also the audit record
-- of the action (plan D25): who confirmed what on which offer and when - the offer page and
-- get_offer show "przez asystenta" from it. No chat text is stored (D9 / D11).
--
-- Idempotent. Requires 037 (the assistant) - without 038 the propose tools answer that actions
-- are not configured yet.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('038_ai_pending_actions'));

CREATE TABLE IF NOT EXISTS ai_pending_actions (
    id               BIGSERIAL PRIMARY KEY,
    -- Who saw the card. SET NULL, not CASCADE: a confirmed row is the audit record and must
    -- outlive a deleted user (as ai_turns does); a pending row of a deleted user can never run.
    user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind             VARCHAR(20) NOT NULL
        CONSTRAINT ai_pending_actions_kind CHECK (kind IN (
            'draft', 'edit', 'duplicate', 'submit', 'send', 'approve', 'reject', 'decision'
        )),
    -- The offer the action works on; NULL for a new draft (or once a deletable draft is deleted -
    -- the audit row stays, the confirm then refuses: payload still names the offer).
    offer_id         INTEGER REFERENCES offers(id) ON DELETE SET NULL,
    -- offers.updated_at::text when the card was built: the confirm refuses when the offer has
    -- changed since (the card would show stale numbers).
    offer_version    TEXT,
    -- Exactly what the confirm will execute (validated again by the service at confirm time).
    payload          JSONB NOT NULL,
    status           VARCHAR(12) NOT NULL DEFAULT 'pending'
        CONSTRAINT ai_pending_actions_status CHECK (status IN ('pending', 'confirmed', 'cancelled', 'failed')),
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    decided_at       TIMESTAMP WITH TIME ZONE,
    -- The offer the confirmed action created or changed (a new version / draft / copy has a new id).
    result_offer_id  INTEGER REFERENCES offers(id) ON DELETE SET NULL,
    CONSTRAINT ai_pending_actions_decided CHECK ((status = 'pending') = (decided_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_user ON ai_pending_actions(user_id, created_at);
-- Plain (not partial) indexes: the ON DELETE SET NULL of both foreign keys looks rows up by
-- offer id without a status filter, on every offer delete. result_offer_id also serves the
-- "przez asystenta" lookup.
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_offer ON ai_pending_actions(offer_id);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_result ON ai_pending_actions(result_offer_id);

COMMIT;
