-- Migration: configurable flows, hierarchy levels, roles and per-flow permissions (v2.0)
-- Run this manually with: psql $DATABASE_URL -f migrations/025_flows_roles_levels.sql
--
-- Replaces the hardcoded junior/senior/admin model (migration 004) with configuration the
-- admin panel edits. See docs/flows-v2-plan.md. users.role stays in place, unread by logic,
-- until the cut-over is confirmed.
--
-- Every migration runs on every start (steelquote-start.ps1), so seeds use ON CONFLICT DO
-- NOTHING on their natural keys: a re-run never duplicates rows and never reverts an edit the
-- admin made in the panel.

BEGIN;

-- N0 = offer creator, N+1..N+3 = consecutive approval levels ordered by chain_rank,
-- NPR = special approver outside the N-chain (kind 'parallel', no rank).
CREATE TABLE IF NOT EXISTS hierarchy_levels (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(20)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    kind        VARCHAR(10)  NOT NULL CHECK (kind IN ('chain', 'parallel')),
    chain_rank  INTEGER CHECK (chain_rank IS NULL OR chain_rank >= 0),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT hierarchy_levels_rank_matches_kind CHECK ((kind = 'chain') = (chain_rank IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS flows (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(30)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Global catalogue. The level is NOT here: the same role can sit on a different level in
-- another flow (CEO is N+3 in Flow 1 and N+2 in Flow 2), so it lives on flow_roles.
CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(30)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- A role inside a flow: its level and the six functional permissions of the ROLE sheet.
CREATE TABLE IF NOT EXISTS flow_roles (
    flow_id                    INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    role_id                    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    level_id                   INTEGER NOT NULL REFERENCES hierarchy_levels(id) ON DELETE RESTRICT,
    can_create_offer           BOOLEAN NOT NULL DEFAULT true,
    can_edit_own_before_submit BOOLEAN NOT NULL DEFAULT true,
    can_submit_to_validation   BOOLEAN NOT NULL DEFAULT true,
    can_approve_reject         BOOLEAN NOT NULL DEFAULT false,
    can_change_pgl_base        BOOLEAN NOT NULL DEFAULT false,
    can_change_price_margin    BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (flow_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_flow_roles_level ON flow_roles(level_id);

-- Administrator = technical superuser outside the pyramid, present in every flow.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN NOT NULL DEFAULT false;
-- Flow context remembered across logins (flow switcher).
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_flow_id INTEGER REFERENCES flows(id) ON DELETE SET NULL;

-- Membership: one role per user per flow.
CREATE TABLE IF NOT EXISTS user_flow_roles (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    flow_id     INTEGER NOT NULL,
    role_id     INTEGER NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, flow_id),
    FOREIGN KEY (flow_id, role_id) REFERENCES flow_roles(flow_id, role_id) ON DELETE CASCADE
);

-- Approver queues and the pyramid resolve "who holds this role in this flow".
CREATE INDEX IF NOT EXISTS idx_user_flow_roles_flow_role ON user_flow_roles(flow_id, role_id);

-- --- Seed: levels ------------------------------------------------------------------------

INSERT INTO hierarchy_levels (code, name, kind, chain_rank, sort_order) VALUES
    ('N0',  'N0 - offer creator',          'chain',    0, 10),
    ('N+1', 'N+1',                          'chain',    1, 20),
    ('N+2', 'N+2',                          'chain',    2, 30),
    ('N+3', 'N+3',                          'chain',    3, 40),
    ('NPR', 'NPR - special approver',       'parallel', NULL, 50)
ON CONFLICT (code) DO NOTHING;

-- --- Seed: flows ------------------------------------------------------------------------

INSERT INTO flows (code, name, sort_order) VALUES
    ('FLOW1', 'Flow 1 - DYSTR',    10),
    ('FLOW2', 'Flow 2 - PROJEKTY', 20)
ON CONFLICT (code) DO NOTHING;

-- --- Seed: roles (ROLE sheet) -----------------------------------------------------------

INSERT INTO roles (code, name) VALUES
    ('IFO', 'Internal Front Office'),
    ('EFO', 'External Front Office'),
    ('ASM', 'Area Sales Manager'),
    ('HOC', 'Head of Cluster'),
    ('HOP', 'Head of Projects'),
    ('CEO', 'CEO'),
    ('KAM', 'Key Account Manager')
ON CONFLICT (code) DO NOTHING;

-- --- Seed: roles inside flows ----------------------------------------------------------
-- Columns: create, edit own, submit, approve/reject, change PGL, change price/margin.
-- Flow 2 CEO is N+2 - the ROLE sheet's N+3 was confirmed wrong (START + SYMULATOR: Flow 2
-- tops out at N+2). Flow 2 front office may change PGL, Flow 1 front office may not.

INSERT INTO flow_roles (flow_id, role_id, level_id, can_create_offer, can_edit_own_before_submit,
                        can_submit_to_validation, can_approve_reject, can_change_pgl_base,
                        can_change_price_margin)
SELECT f.id, r.id, l.id, s.c, s.e, s.s, s.a, s.p, s.m
FROM (VALUES
    ('FLOW1', 'IFO', 'N0',  true, true, true,  false, false, true),
    ('FLOW1', 'EFO', 'N0',  true, true, true,  false, false, true),
    ('FLOW1', 'ASM', 'N+1', true, true, true,  true,  true,  true),
    ('FLOW1', 'HOC', 'N+2', true, true, true,  true,  true,  true),
    ('FLOW1', 'HOP', 'NPR', true, true, false, true,  true,  true),
    ('FLOW1', 'CEO', 'N+3', true, true, false, true,  true,  true),
    ('FLOW2', 'IFO', 'N0',  true, true, true,  false, true,  true),
    ('FLOW2', 'KAM', 'N0',  true, true, true,  false, true,  true),
    ('FLOW2', 'HOP', 'NPR', true, true, false, true,  true,  true),
    ('FLOW2', 'CEO', 'N+2', true, true, false, true,  true,  true)
) AS s(flow_code, role_code, level_code, c, e, s, a, p, m)
JOIN flows f            ON f.code = s.flow_code
JOIN roles r            ON r.code = s.role_code
JOIN hierarchy_levels l ON l.code = s.level_code
ON CONFLICT (flow_id, role_id) DO NOTHING;

COMMIT;
