-- Migration: validation rules engine (REGULY sheet) + conflict/visibility policies (v2.0)
-- Run this manually with: psql $DATABASE_URL -f migrations/026_approval_rules.sql
--
-- One row per criterion per flow, all admin-editable. The required level of an offer is the
-- MAXIMUM over every rule that fires (chain levels by rank); a rule targeting NPR adds a
-- parallel approval. Facts each criterion reads are computed in lib/access/ruleEngine.ts -
-- keep the criterion list here and there in sync.
--
-- threshold IS NULL = "not configured yet": the rule never fires and the admin panel lists it
-- in the configuration completeness control.
--
-- seed_key identifies seeded rows so a re-run neither duplicates them nor reverts edits.

BEGIN;

CREATE TABLE IF NOT EXISTS approval_rules (
    id                 SERIAL PRIMARY KEY,
    seed_key           VARCHAR(40) UNIQUE,
    flow_id            INTEGER REFERENCES flows(id) ON DELETE CASCADE,    -- NULL = every flow
    criterion          VARCHAR(40) NOT NULL CHECK (criterion IN (
                           'margin_below_target', 'margin_deficit_pp',
                           'base_price_change', 'base_reduction_pct',
                           'quote_validity_hours',
                           'price_validity_quarters', 'price_validity_days',
                           'offer_value_eur')),
    applies_to_role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,    -- NULL = all creators
    condition_text     TEXT NOT NULL DEFAULT '',
    operator           VARCHAR(2) NOT NULL CHECK (operator IN ('<', '<=', '>', '>=', '=', '!=')),
    threshold          NUMERIC(16,4),
    -- Only margin_deficit_pp reads it: the target margin the deficit is measured from.
    reference_value    NUMERIC(16,4),
    unit               VARCHAR(20) NOT NULL DEFAULT '',
    priority           INTEGER NOT NULL DEFAULT 10,
    target_level_id    INTEGER NOT NULL REFERENCES hierarchy_levels(id) ON DELETE RESTRICT,
    is_active          BOOLEAN NOT NULL DEFAULT true,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    updated_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Submit evaluates every active rule of one flow (plus the flow-less ones).
CREATE INDEX IF NOT EXISTS idx_approval_rules_flow ON approval_rules(flow_id) WHERE is_active;

-- What happens when a rule demands a level the offer's flow has no approver for (test T5):
--   escalate_next - nearest higher chain level present in the flow, else the highest one
--   block         - submit fails with a configuration-conflict error
--   escalate_top  - the highest chain level present in the flow
ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS level_conflict_policy VARCHAR(20) NOT NULL DEFAULT 'escalate_next';
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_level_conflict_policy_valid;
ALTER TABLE app_settings
    ADD CONSTRAINT app_settings_level_conflict_policy_valid
        CHECK (level_conflict_policy IN ('escalate_next', 'block', 'escalate_top'));

-- There is no branch/region org model yet. The visibility matrix's branch/region columns
-- resolve to the user's team ('team', least privilege, default) or the whole flow ('flow').
ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS org_scope_fallback VARCHAR(10) NOT NULL DEFAULT 'team';
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_org_scope_fallback_valid;
ALTER TABLE app_settings
    ADD CONSTRAINT app_settings_org_scope_fallback_valid
        CHECK (org_scope_fallback IN ('team', 'flow'));

-- --- Seed: REGULY rows ------------------------------------------------------------------
-- Margin: 4.5 % is the target; the deeper threshold 2.1 is a deficit in percentage points
-- below that target (SYMULATOR formula (target - offer) * 100 >= threshold), so >= 2.1 pp
-- (margin <= 2.4 %) goes to N+2. Base price: REGULY (-> NPR) wins over the START note.
-- Value: 1000K EUR. Rows with threshold NULL are the placeholders the spec leaves for the
-- business to fill (completeness control).

INSERT INTO approval_rules (seed_key, flow_id, criterion, condition_text, operator, threshold,
                            reference_value, unit, priority, target_level_id, sort_order)
SELECT s.seed_key, f.id, s.criterion, s.cond, s.op, s.threshold, s.ref, s.unit, s.prio, l.id, s.ord
FROM (VALUES
    ('F1_MARGIN_N1',     'FLOW1', 'margin_below_target',     'Marża oferty niższa niż marża zakładana',            '<',  4.5::numeric,     NULL::numeric, '%',       10, 'N+1', 10),
    ('F1_MARGIN_N2',     'FLOW1', 'margin_deficit_pp',       'Marża poniżej zakładanej o co najmniej próg (p.p.)', '>=', 2.1,              4.5,           'p.p.',    20, 'N+2', 20),
    ('F1_MARGIN_N3',     'FLOW1', 'margin_deficit_pp',       'Marża poniżej zakładanej - próg N+3',                '>=', NULL,             4.5,           'p.p.',    30, 'N+3', 30),
    ('F2_MARGIN_NPR',    'FLOW2', 'margin_below_target',     'Marża oferty niższa niż marża zakładana',            '<',  4.5,              NULL,          '%',       10, 'NPR', 40),
    ('ALL_BASE_NPR',     NULL,    'base_price_change',       'Każda zmiana bazy wyceny w dół',                     '=',  1,                NULL,          'TAK/NIE', 10, 'NPR', 50),
    ('F1_BASE_N2',       'FLOW1', 'base_reduction_pct',      'Obniżenie bazy vs standard - próg N+2',              '>=', NULL,             NULL,          '%',       20, 'N+2', 60),
    ('F1_BASE_N3',       'FLOW1', 'base_reduction_pct',      'Obniżenie bazy vs standard - próg N+3',              '>=', NULL,             NULL,          '%',       30, 'N+3', 70),
    ('F1_QVALID_N2',     'FLOW1', 'quote_validity_hours',    'Termin dłuższy niż standardowe 48H',                 '>',  48,               NULL,          'h',       10, 'N+2', 80),
    ('F2_QVALID_NPR',    'FLOW2', 'quote_validity_hours',    'Termin dłuższy niż standardowe 48H',                 '>',  48,               NULL,          'h',       10, 'NPR', 90),
    ('F1_PVALID_N1',     'FLOW1', 'price_validity_quarters', 'Oferta ma ważność na kwartał',                       '=',  1,                NULL,          'kwartał', 10, 'N+1', 100),
    ('F1_PVALID_N2',     'FLOW1', 'price_validity_quarters', 'Ważność dłuższa niż kwartał',                        '>',  1,                NULL,          'kwartał', 30, 'N+2', 110),
    ('F1_PVALID_N3',     'FLOW1', 'price_validity_days',     'Ważność ceny - dodatkowy próg N+3',                  '>=', NULL,             NULL,          'dni',     40, 'N+3', 120),
    ('F2_PVALID_NPR_EQ', 'FLOW2', 'price_validity_quarters', 'Oferta ma ważność na kwartał',                       '=',  1,                NULL,          'kwartał', 20, 'NPR', 130),
    ('F2_PVALID_NPR_GE', 'FLOW2', 'price_validity_quarters', 'Ważność co najmniej kwartał',                        '>=', 1,                NULL,          'kwartał', 30, 'NPR', 140),
    ('F1_VALUE_N2',      'FLOW1', 'offer_value_eur',         'Wartość oferty przekracza próg 1000K €',             '>',  1000000,          NULL,          'EUR',     20, 'N+2', 150),
    ('F2_VALUE_NPR',     'FLOW2', 'offer_value_eur',         'Wartość oferty przekracza próg 1000K €',             '>',  1000000,          NULL,          'EUR',     30, 'NPR', 160)
) AS s(seed_key, flow_code, criterion, cond, op, threshold, ref, unit, prio, level_code, ord)
LEFT JOIN flows f        ON f.code = s.flow_code
JOIN hierarchy_levels l  ON l.code = s.level_code
WHERE s.flow_code IS NULL OR f.id IS NOT NULL
ON CONFLICT (seed_key) DO NOTHING;

COMMIT;
