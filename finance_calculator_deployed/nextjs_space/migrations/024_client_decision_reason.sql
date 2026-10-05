-- Migration: structured reason for a client's rejection ('lost') of a sent offer
-- Run this manually with: psql $DATABASE_URL -f migrations/024_client_decision_reason.sql
--
-- offers.client_decision_note (migration 018) is free text, which cannot be grouped for
-- statistics. This adds a closed list of reason codes next to it. The note stays and now
-- doubles as the custom text for reason 'other' ("nothing matches").
--
-- Codes are mirrored in lib/lostReasons.ts - keep both lists in sync.

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS client_decision_reason VARCHAR(30)
        CHECK (client_decision_reason IN (
            'price', 'lead_time', 'competitor', 'project_cancelled',
            'no_response', 'payment_terms', 'other'
        ));

-- Offers already marked lost carry no code. We do not guess - they go to 'other', which
-- keeps the existing free-text note readable next to it. Only touches rows without a code,
-- so re-running the migration changes nothing.
UPDATE offers
   SET client_decision_reason = 'other'
 WHERE client_decision = 'lost'
   AND client_decision_reason IS NULL;

-- Statistics group lost offers by reason.
CREATE INDEX IF NOT EXISTS idx_offers_client_decision_reason ON offers(client_decision_reason);
