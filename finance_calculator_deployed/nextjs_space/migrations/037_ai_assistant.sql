-- Migration: AI assistant (docs/ai-assistant-plan.md, phase 1)
-- Run this manually with: psql $DATABASE_URL -f migrations/037_ai_assistant.sql
--
-- Adds what the chat assistant needs on the database side. No chat text is stored anywhere
-- (plan D9 / D11): ai_turns keeps metadata only - which tools ran, token counts, cost, guard hits.
--
--   ai_state         single row: data_version, bumped by triggers on every table an answer can
--                    depend on. Part of the answer-cache key, so a cached answer can never be
--                    stale: any write makes every older entry a miss.
--   ai_turns         one row per question: metadata + cost. Source of the budget and the limits.
--   ai_feedback      thumbs up / down per answer.
--   ai_answer_cache  final read-only answers, keyed by a hash that includes data_version.
--   app_settings     kill switch, monthly budget, per-user daily limit.
--   users            per-user switch (plan D18: admin can turn the assistant off for a user).
--
-- Idempotent. Safe to run before or after the code: without it the chat route answers
-- "assistant not configured" instead of failing.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('037_ai_assistant'));

-- --- settings ----------------------------------------------------------------------------

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS ai_monthly_budget_usd NUMERIC(10,2) NOT NULL DEFAULT 20
    CONSTRAINT app_settings_ai_budget_sane CHECK (ai_monthly_budget_usd >= 0);
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS ai_user_daily_limit INTEGER NOT NULL DEFAULT 100
    CONSTRAINT app_settings_ai_daily_sane CHECK (ai_user_daily_limit >= 0);

ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_assistant_enabled BOOLEAN NOT NULL DEFAULT true;

-- --- data version ------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_state (
    id           INTEGER PRIMARY KEY DEFAULT 1,
    data_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ai_state_single_row CHECK (id = 1)
);
INSERT INTO ai_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- A row update rather than a sequence on purpose: the new version becomes visible only when
-- the writing transaction commits, together with its data. With a (non-transactional) sequence
-- a reader could cache an answer computed on the old data under the new version.
CREATE OR REPLACE FUNCTION ai_bump_data_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE ai_state SET data_version = data_version + 1 WHERE id = 1;
    RETURN NULL;
END;
$$;

-- Statement-level: one bump per statement, however many rows it touches.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'offers', 'offer_approval_steps', 'clients', 'client_contacts', 'users', 'team_members',
        'user_flow_roles', 'flow_roles', 'visibility_rules', 'approval_rules', 'lost_reasons',
        'app_settings', 'pgl_quarterly_prices', 'price_book_entries', 'steel_grades',
        'transport_tariff_bands'
    ] LOOP
        -- A table missing on an older database is skipped, not an error.
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS ai_data_version ON %I', t);
            EXECUTE format(
                'CREATE TRIGGER ai_data_version AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I
                 FOR EACH STATEMENT EXECUTE FUNCTION ai_bump_data_version()', t);
        END IF;
    END LOOP;
END;
$$;

-- --- usage log (metadata only) -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_turns (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    model              VARCHAR(60) NOT NULL,
    lang               VARCHAR(2) NOT NULL,
    -- answer | guard_fallback | refusal | step_limit | truncated | error
    outcome            VARCHAR(20) NOT NULL,
    cache_hit          BOOLEAN NOT NULL DEFAULT false,
    steps              INTEGER NOT NULL DEFAULT 0,
    -- [{name, ok, status, ms}] - tool names and outcomes, never inputs or results.
    tool_calls         JSONB NOT NULL DEFAULT '[]'::jsonb,
    guard_violations   INTEGER NOT NULL DEFAULT 0,
    injection_flag     BOOLEAN NOT NULL DEFAULT false,
    input_tokens       INTEGER NOT NULL DEFAULT 0,
    output_tokens      INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd           NUMERIC(10,6) NOT NULL DEFAULT 0,
    duration_ms        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ai_turns_created ON ai_turns(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_turns_user_created ON ai_turns(user_id, created_at);

CREATE TABLE IF NOT EXISTS ai_feedback (
    turn_id    BIGINT NOT NULL REFERENCES ai_turns(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     SMALLINT NOT NULL CONSTRAINT ai_feedback_rating CHECK (rating IN (-1, 1)),
    comment    VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (turn_id, user_id)
);

-- --- answer cache ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_answer_cache (
    -- sha256 over question, visibility fingerprint, page, language, day, data_version, prompt
    -- version and model (lib/assistant/cache.ts).
    cache_key  CHAR(64) PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answer     JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Only for the cleanup of entries a later data_version already made unreachable.
CREATE INDEX IF NOT EXISTS idx_ai_answer_cache_created ON ai_answer_cache(created_at);

COMMIT;
