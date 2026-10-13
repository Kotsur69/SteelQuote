-- Migration: admin-managed list of reasons a client lost an offer.
-- Run this manually with: psql $DATABASE_URL -f migrations/032_lost_reasons.sql
--
-- Kontekst: migration 024 stored offers.client_decision_reason as a closed list of codes,
-- fixed by a CHECK constraint and mirrored in lib/lostReasons.ts. From v2.0 the superuser
-- edits the list at /admin/powody-przegranej:
--   * lost_reasons - one row per reason, labelled in all four UI languages. Reasons are
--     archived (archived_at), never deleted, so old offers and analytics keep their label.
--   * 'other' is the built-in catch-all (is_system): it cannot be archived, and picking it
--     makes the free-text note (client_decision_note) mandatory.
--   * offers.client_decision_reason keeps its codes - the CHECK is replaced by a foreign key,
--     so no offer row changes.
-- Until this migration runs, the app reads the code fallback (the 024 list) and the admin
-- page refuses to save with a clear message.

SET client_encoding = 'UTF8';

BEGIN;

CREATE TABLE IF NOT EXISTS lost_reasons (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(30) NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_]{1,30}$'),
    label_pl    TEXT NOT NULL CHECK (length(btrim(label_pl)) BETWEEN 1 AND 80),
    label_en    TEXT NOT NULL CHECK (length(btrim(label_en)) BETWEEN 1 AND 80),
    label_cs    TEXT NOT NULL CHECK (length(btrim(label_cs)) BETWEEN 1 AND 80),
    label_de    TEXT NOT NULL CHECK (length(btrim(label_de)) BETWEEN 1 AND 80),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMP WITH TIME ZONE NULL,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The catch-all must always be pickable.
    CHECK (NOT (is_system AND archived_at IS NOT NULL))
);

-- Polish names are unique regardless of case / surrounding spaces (the API checks every
-- language; this is the backstop for hand-made inserts).
CREATE UNIQUE INDEX IF NOT EXISTS uq_lost_reasons_label_pl_ci ON lost_reasons (lower(btrim(label_pl)));

-- Seed: the 024 codes with their existing labels, plus 'competitor_faster'. 'other' stays last.
INSERT INTO lost_reasons (code, label_pl, label_en, label_cs, label_de, sort_order, is_system) VALUES
    ('price',             'Cena',                       'Price',                      'Cena',                       'Preis',                         10, FALSE),
    ('lead_time',         'Termin dostawy',             'Lead time',                  'Dodací lhůta',               'Lieferzeit',                    20, FALSE),
    ('competitor',        'Wybrał konkurencję',         'Chose a competitor',         'Zvolil konkurenci',          'Wettbewerber gewählt',          30, FALSE),
    ('competitor_faster', 'Konkurencja była szybsza',   'Competitor was faster',      'Konkurence byla rychlejší',  'Wettbewerber war schneller',    40, FALSE),
    ('project_cancelled', 'Projekt anulowany',          'Project cancelled',          'Projekt zrušen',             'Projekt abgebrochen',           50, FALSE),
    ('no_response',       'Brak odpowiedzi klienta',    'No response from client',    'Bez odpovědi klienta',       'Keine Antwort des Kunden',      60, FALSE),
    ('payment_terms',     'Warunki płatności',          'Payment terms',              'Platební podmínky',          'Zahlungsbedingungen',           70, FALSE),
    ('other',             'Inne',                       'Other',                      'Jiné',                       'Sonstiges',                   1000, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Drop the 024 CHECK on offers.client_decision_reason, whatever name Postgres gave it.
DO $$
DECLARE
    con RECORD;
BEGIN
    FOR con IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = 'offers'::regclass
           AND c.contype = 'c'
           AND a.attname = 'client_decision_reason'
    LOOP
        EXECUTE format('ALTER TABLE offers DROP CONSTRAINT %I', con.conname);
    END LOOP;
END $$;

-- Every stored code must exist in the list. RESTRICT: a reason in use can be archived,
-- never removed. A code outside the list (hand-edited data) stops the migration with a
-- readable message instead of a bare FK violation; the whole migration rolls back.
DO $$
DECLARE
    unknown TEXT;
BEGIN
    SELECT string_agg(DISTINCT o.client_decision_reason, ', ') INTO unknown
      FROM offers o
     WHERE o.client_decision_reason IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM lost_reasons r WHERE r.code = o.client_decision_reason);
    IF unknown IS NOT NULL THEN
        RAISE EXCEPTION 'offers.client_decision_reason holds codes missing from lost_reasons: %', unknown;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'offers'::regclass AND conname = 'fk_offers_client_decision_reason'
    ) THEN
        ALTER TABLE offers
            ADD CONSTRAINT fk_offers_client_decision_reason
            FOREIGN KEY (client_decision_reason) REFERENCES lost_reasons(code)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;

COMMIT;
