-- Migration: offer value rule routing to the CEO (N+3), threshold 1 000 000 EUR (v2.2)
-- Run this manually with: psql $DATABASE_URL -f migrations/036_value_rule_ceo.sql
--
-- Mati 2026-11-04: an offer waits for the CEO through a real rule the admin can edit. Until now
-- no rule sent an offer to the CEO on value (026 stops at N+2 / NPR), and Flow 2 had no N+3
-- rule at all. One rule per flow, for every creator role. The threshold is a working value
-- from Mati, to be confirmed by the business; it is editable in the Rules panel.
--
-- It takes effect immediately, and it matches the 026 value rules: over 1 000 000 EUR a Flow 1
-- offer now goes to N+3 instead of N+2, and a Flow 2 offer to NPR + N+3. An offer already
-- approved over that value returns to validation, because its approval no longer covers N+3.
--
-- Safe to run before or after the 2.2 code. Runs ONCE (schema_backfills marker), so a rule the
-- admin later edits or deletes is neither reverted nor resurrected.

BEGIN;

-- The seed texts below are Polish. psql on Windows otherwise reads this UTF-8 file in the
-- console code page and stores mojibake.
SET LOCAL client_encoding = 'UTF8';

SELECT pg_advisory_xact_lock(hashtext('036_value_rule_ceo'));

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM schema_backfills WHERE key = 'seed_036_value_rule_ceo') THEN

INSERT INTO approval_rules (seed_key, flow_id, criterion, condition_text, operator, threshold,
                            unit, target_level_id, sort_order)
SELECT s.seed_key, f.id, 'offer_value_eur', 'Wartość oferty - próg N+3', '>', 1000000, 'EUR', l.id, s.ord
FROM (VALUES
    ('F1_VALUE_N3', 'FLOW1', 155),
    ('F2_VALUE_N3', 'FLOW2', 165)
) AS s(seed_key, flow_code, ord)
JOIN flows f            ON f.code = s.flow_code
JOIN hierarchy_levels l ON l.code = 'N+3'
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO schema_backfills (key) VALUES ('seed_036_value_rule_ceo') ON CONFLICT DO NOTHING;
END IF;
END $$;

COMMIT;
