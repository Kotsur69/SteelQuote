-- Migration: senior <-> junior team membership
-- Run this manually with: psql $DATABASE_URL -f migrations/019_create_team_members.sql
--
-- A senior can build a team out of juniors. In the analytics panel (app/analytics) a senior
-- then sees, and can filter to, their own book PLUS every team member's - juniors and admins
-- are unaffected. Membership is many-to-many on purpose: the same junior may sit on more than
-- one senior's team, and each of those seniors counts that junior's offers once in their own
-- panel. Company-wide totals (admin scope) never read this table, so nothing is double counted
-- there.
--
-- Roles are checked in the API, not with a CHECK constraint here: a junior can be promoted to
-- senior or an account demoted, and we do not want a role change to fail because an old
-- membership row suddenly violates a constraint. A stale row is harmless - the worst case is a
-- former junior still showing on an old team until the senior removes them.

CREATE TABLE IF NOT EXISTS team_members (
    senior_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    junior_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (senior_id, junior_id)
);

-- A senior loading their team, and analytics resolving "my team" ids on every panel render.
CREATE INDEX IF NOT EXISTS idx_team_members_senior ON team_members(senior_id);
-- Listing the juniors still assignable (NOT already on this senior's team) and, later, showing
-- a junior which teams they are on.
CREATE INDEX IF NOT EXISTS idx_team_members_junior ON team_members(junior_id);
