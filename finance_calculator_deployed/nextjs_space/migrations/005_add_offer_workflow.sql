-- Migration: Offer approval workflow + change offers.user_id FK behaviour
-- Run this manually with: psql $DATABASE_URL -f migrations/005_add_offer_workflow.sql
--
-- Dodaje obieg statusów oferty: draft -> pending_review -> approved/rejected -> sent.
-- Dane historyczne nie mają statusu, więc wszystkie istniejące oferty backfillują się
-- na 'draft' (DEFAULT przy ADD COLUMN NOT NULL) — nie zgadujemy statusów wstecz.

-- --- Kolumny workflow -------------------------------------------------------

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'sent'));

-- Recenzent (senior) i kiedy zrecenzował. ON DELETE SET NULL: gdyby konto recenzenta
-- kiedyś zniknęło, oferta i informacja "recenzowana" mają zostać (recenzent = NULL).
ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE;

-- Panel admina filtruje po statusie -> indeks.
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);

-- --- Zmiana FK offers.user_id: CASCADE -> SET NULL --------------------------
--
-- DECYZJA (nieodwracalna zmiana schematu): przechodzimy z ON DELETE CASCADE na
-- ON DELETE SET NULL.
--
-- Dlaczego: podstawową ścieżką "usuwania" handlowca jest soft delete (users.is_active
-- = false, patrz migracja 004) — konta nie znikają z bazy, więc historia ofert, którą
-- panel admina ma pokazywać, jest zachowana. Zmiana FK to zabezpieczenie w głąb: gdyby
-- ktoś mimo to usunął usera fizycznie (ręcznie w SQL, RODO, sprzątanie konta testowego),
-- oferty NIE zostaną skasowane kaskadą — user_id ustawi się na NULL (autor "usunięty"),
-- a same dokumenty (klient, kwoty, status) przetrwają.
--
-- Konsekwencja: offers.user_id musi być NULLable. Zapytania w panelu admina używają
-- LEFT JOIN users i muszą obsłużyć NULL (np. "— handlowiec usunięty —").

ALTER TABLE offers ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_user_id_fkey;

ALTER TABLE offers
    ADD CONSTRAINT offers_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
