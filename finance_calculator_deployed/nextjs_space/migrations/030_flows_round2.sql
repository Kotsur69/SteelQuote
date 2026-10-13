-- Migration: flows v2 round 2 - answers to the open questions of 12.10.2026 (v2.0)
-- Run this manually with: psql $DATABASE_URL -f migrations/030_flows_round2.sql
--
-- See "Historia wersji oraz md/questions_for_lukasz.md":
--   - a parallel level can stand in for chain levels up to a rank (Head of Projects = N+1 and
--     N+2): hierarchy_levels.covers_chain_rank
--   - one person works in one flow, except roles marked multi_flow (Head of Projects, CEO)
--   - an approval is valid for approval_validity_hours (48 h), then the offer is re-validated
--   - the rules' "priority" column was an artefact of the source sheet and is dropped
--   - Flow 2: CEO moves to N+3, so a rule "to N+1 / N+2" lands on Head of Projects
--   - margin rule N+2 reads "margin 2.1 % or lower" (variant b), not a 2.1 pp deficit
--   - Head of Cluster sees every offer of Flow 1
--
-- Schema statements are idempotent; the data changes run ONCE (schema_backfills marker), so a
-- later admin edit is never reverted by a restart.

BEGIN;

-- The seed texts below are Polish. psql on Windows otherwise reads this UTF-8 file in the
-- console code page and stores mojibake.
SET LOCAL client_encoding = 'UTF8';

SELECT pg_advisory_xact_lock(hashtext('030_flows_round2'));

-- Highest chain rank a parallel level's approval stands in for (NULL = none).
ALTER TABLE hierarchy_levels ADD COLUMN IF NOT EXISTS covers_chain_rank INTEGER;

-- A role whose holders may belong to more than one flow. Everyone else works in one flow.
ALTER TABLE roles ADD COLUMN IF NOT EXISTS multi_flow BOOLEAN NOT NULL DEFAULT false;

-- How long an approval stays valid before the offer has to be re-validated.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS approval_validity_hours INTEGER NOT NULL DEFAULT 48;

-- Constraints added only when missing: a DROP / ADD on every start would take an exclusive
-- lock on these tables each time the app boots.
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hierarchy_levels_covers_parallel_only') THEN
    ALTER TABLE hierarchy_levels
        ADD CONSTRAINT hierarchy_levels_covers_parallel_only
            CHECK (covers_chain_rank IS NULL OR (kind = 'parallel' AND covers_chain_rank >= 1));
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_approval_validity_hours_valid') THEN
    ALTER TABLE app_settings
        ADD CONSTRAINT app_settings_approval_validity_hours_valid
            CHECK (approval_validity_hours BETWEEN 1 AND 8760);
END IF;
END $$;

-- Ties between rules demanding the same level are broken by sort order now.
ALTER TABLE approval_rules DROP COLUMN IF EXISTS priority;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM schema_backfills WHERE key = 'seed_030_flows_round2') THEN

UPDATE hierarchy_levels SET covers_chain_rank = 2
WHERE code = 'NPR' AND kind = 'parallel' AND covers_chain_rank IS NULL;

UPDATE roles SET multi_flow = true WHERE code IN ('HOP', 'CEO');

-- Flow 2: CEO from N+2 to N+3 (only if still where the 025 seed put it).
UPDATE flow_roles fr SET level_id = n3.id
FROM flows f, roles r, hierarchy_levels n2, hierarchy_levels n3
WHERE fr.flow_id = f.id AND f.code = 'FLOW2'
  AND fr.role_id = r.id AND r.code = 'CEO'
  AND n2.code = 'N+2' AND fr.level_id = n2.id
  AND n3.code = 'N+3';

-- Margin N+2 / N+3: absolute margin instead of a deficit, only where the seed is unedited.
UPDATE approval_rules
SET criterion = 'margin_below_target', operator = '<=', reference_value = NULL, unit = '%',
    condition_text = 'Marża oferty 2,1% lub niższa', updated_at = CURRENT_TIMESTAMP
WHERE seed_key = 'F1_MARGIN_N2' AND criterion = 'margin_deficit_pp' AND operator = '>='
  AND threshold = 2.1 AND reference_value = 4.5;

UPDATE approval_rules
SET criterion = 'margin_below_target', operator = '<=', reference_value = NULL, unit = '%',
    condition_text = 'Marża oferty - próg N+3', updated_at = CURRENT_TIMESTAMP
WHERE seed_key = 'F1_MARGIN_N3' AND criterion = 'margin_deficit_pp' AND threshold IS NULL;

-- Head of Cluster: full visibility of distribution (Flow 1).
UPDATE visibility_rules v
SET see_all_in_flow = true, note = 'Pełna widoczność ofert dystrybucji (Flow 1) + kolejka N+2.'
FROM flows f, roles r
WHERE v.flow_id = f.id AND f.code = 'FLOW1' AND v.role_id = r.id AND r.code = 'HOC';

INSERT INTO schema_backfills (key) VALUES ('seed_030_flows_round2') ON CONFLICT DO NOTHING;
END IF;
END $$;

COMMIT;
