-- Migration: offer visibility matrix (WIDOCZNOSC sheet) (v2.0)
-- Run this manually with: psql $DATABASE_URL -f migrations/027_visibility_rules.sql
--
-- One row per role per flow, enforced server-side in lib/access/visibility.ts. Visibility
-- never implies the right to edit or approve. The "effective scope" column of the sheet is
-- derived in code from these flags and is not stored. The superuser (users.is_superuser)
-- always sees everything and has no row here.

BEGIN;

-- The seed texts below are Polish. psql on Windows otherwise reads this UTF-8 file in the
-- console code page and stores mojibake ("MarĹźa" instead of "Marża").
SET LOCAL client_encoding = 'UTF8';

CREATE TABLE IF NOT EXISTS visibility_rules (
    flow_id                INTEGER NOT NULL,
    role_id                INTEGER NOT NULL,
    see_own                BOOLEAN NOT NULL DEFAULT true,
    see_team               BOOLEAN NOT NULL DEFAULT false,
    see_branch             BOOLEAN NOT NULL DEFAULT false,
    see_region             BOOLEAN NOT NULL DEFAULT false,
    see_all_in_flow        BOOLEAN NOT NULL DEFAULT false,
    see_all_flows          BOOLEAN NOT NULL DEFAULT false,
    see_awaiting_my_review BOOLEAN NOT NULL DEFAULT false,
    note                   TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (flow_id, role_id),
    FOREIGN KEY (flow_id, role_id) REFERENCES flow_roles(flow_id, role_id) ON DELETE CASCADE
);

-- Seeded once (schema_backfills marker): a row the admin edits or a role/flow pair they remove
-- is never touched again by a later start.
-- Columns: own, team, branch, region, all in my flow, all flows, awaiting my validation.
-- Head of Projects' Flow 1 note in the sheet was a copy of the Flow 2 one; corrected here.
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM schema_backfills WHERE key = 'seed_027_visibility') THEN
INSERT INTO visibility_rules (flow_id, role_id, see_own, see_team, see_branch, see_region,
                              see_all_in_flow, see_all_flows, see_awaiting_my_review, note)
SELECT f.id, r.id, s.own, s.team, s.branch, s.region, s.flow_all, s.all_flows, s.awaiting, s.note
FROM (VALUES
    ('FLOW1', 'IFO', true, true, true, false, false, false, false, 'Tylko własne oferty.'),
    ('FLOW1', 'EFO', true, true, true, false, false, false, false, 'Domyślnie tylko własne; można rozszerzyć na zespół.'),
    ('FLOW1', 'ASM', true, true, true, false, false, false, true,  'Widoczność ofert oddziału + kolejka N+1.'),
    ('FLOW1', 'HOP', true, true, true, true,  true,  true,  true,  'Widoczność wszystkich ofert + kolejka NPR.'),
    ('FLOW1', 'HOC', true, true, true, true,  false, false, true,  'Widoczność całego regionu + kolejka N+2.'),
    ('FLOW1', 'CEO', true, true, true, true,  true,  true,  true,  'Pełna widoczność biznesowa.'),
    ('FLOW2', 'IFO', true, true, true, false, false, false, false, 'Tylko własne oferty.'),
    ('FLOW2', 'KAM', true, true, true, false, false, false, false, 'Tylko własne oferty; rozszerzenie na portfolio klientów można dodać osobno.'),
    ('FLOW2', 'HOP', true, true, true, true,  true,  true,  true,  'Widoczność wszystkich ofert + kolejka NPR.'),
    ('FLOW2', 'CEO', true, true, true, true,  true,  true,  true,  'Pełna widoczność biznesowa.')
) AS s(flow_code, role_code, own, team, branch, region, flow_all, all_flows, awaiting, note)
JOIN flows f ON f.code = s.flow_code
JOIN roles r ON r.code = s.role_code
JOIN flow_roles fr ON fr.flow_id = f.id AND fr.role_id = r.id
ON CONFLICT (flow_id, role_id) DO NOTHING;

INSERT INTO schema_backfills (key) VALUES ('seed_027_visibility') ON CONFLICT DO NOTHING;
END IF;
END $$;

COMMIT;
