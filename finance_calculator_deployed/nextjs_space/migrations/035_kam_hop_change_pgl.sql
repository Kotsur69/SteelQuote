-- Migration: Key Account Manager and Head of Projects may change the base PGL (v2.2)
-- Run this manually with: psql $DATABASE_URL -f migrations/035_kam_hop_change_pgl.sql
--
-- Mati 2026-11-02: KAM and HoP must be able to edit the base PGL in the calculator. The 025
-- seed already set can_change_pgl_base for them, but it used ON CONFLICT DO NOTHING, so a
-- database seeded or edited differently may still have it off. This grants it in every flow
-- the two roles hold. Lowering PGL still triggers the NPR rule; when HoP is the creator their
-- own level covers that step (no self-approval), see lib/access/routing.ts.
--
-- The data change runs ONCE (schema_backfills marker), so a later admin edit in the Roles
-- panel is never reverted by running this file again.

BEGIN;

SET LOCAL client_encoding = 'UTF8';

SELECT pg_advisory_xact_lock(hashtext('035_kam_hop_change_pgl'));

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM schema_backfills WHERE key = 'seed_035_kam_hop_change_pgl') THEN

UPDATE flow_roles fr
SET can_change_pgl_base = true
FROM roles r
WHERE fr.role_id = r.id
  AND r.code IN ('KAM', 'HOP')
  AND fr.can_change_pgl_base = false;

INSERT INTO schema_backfills (key) VALUES ('seed_035_kam_hop_change_pgl') ON CONFLICT DO NOTHING;
END IF;
END $$;

COMMIT;
