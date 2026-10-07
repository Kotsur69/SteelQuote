-- Migration: one-shot backfill of legacy junior/senior/admin accounts into the flow model (v2.0)
-- Run this manually with: psql $DATABASE_URL -f migrations/029_backfill_legacy_roles.sql
--
-- Confirmed mapping (docs/flows-v2-plan.md):
--   junior -> Flow 1 / Internal Front Office
--   senior -> Flow 1 / Area Sales Manager (team_members rows are kept as they are)
--   admin  -> users.is_superuser = true
-- Every existing offer -> Flow 1. An offer already pending review gets one N+1 step, so a
-- Flow 1 approver can still decide it.
--
-- Passwords, sessions, offers and history are untouched; users.role stays readable.
--
-- ONE-SHOT: migrations re-run on every start, but this must not. Without the marker, an
-- admin who later removes a membership would see it come back on the next start, and every
-- new account (users.role defaults to 'junior') would silently land in Flow 1.

BEGIN;

-- Two app instances starting together must not both run the backfill.
SELECT pg_advisory_xact_lock(hashtext('029_backfill_legacy_roles'));

CREATE TABLE IF NOT EXISTS schema_backfills (
    key        VARCHAR(60) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

DO $$
DECLARE
    flow1_id INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM schema_backfills WHERE key = 'legacy_roles_v2') THEN
        RETURN;
    END IF;

    SELECT id INTO flow1_id FROM flows WHERE code = 'FLOW1';
    IF flow1_id IS NULL THEN
        RAISE EXCEPTION 'Flow FLOW1 missing - migration 025 must run first';
    END IF;

    UPDATE users SET is_superuser = true WHERE role = 'admin';

    INSERT INTO user_flow_roles (user_id, flow_id, role_id)
    SELECT u.id, flow1_id, r.id
    FROM users u
    JOIN roles r ON r.code = CASE u.role WHEN 'junior' THEN 'IFO' WHEN 'senior' THEN 'ASM' END
    WHERE u.role IN ('junior', 'senior')
    ON CONFLICT (user_id, flow_id) DO NOTHING;

    -- Steps for legacy pending offers, before flow_id is filled (that is how they are found).
    INSERT INTO offer_approval_steps (offer_id, track, level_id, required_level_id)
    SELECT o.id, 'chain', l.id, l.id
    FROM offers o
    JOIN hierarchy_levels l ON l.code = 'N+1'
    WHERE o.flow_id IS NULL AND o.status = 'pending_review';

    UPDATE offers SET flow_id = flow1_id WHERE flow_id IS NULL;

    -- Every offer now belongs to a flow; new ones get it from the creator's active flow.
    -- Inside the one-shot block, so later starts take no exclusive lock on offers.
    ALTER TABLE offers ALTER COLUMN flow_id SET NOT NULL;

    INSERT INTO schema_backfills (key) VALUES ('legacy_roles_v2') ON CONFLICT DO NOTHING;
END $$;

COMMIT;
