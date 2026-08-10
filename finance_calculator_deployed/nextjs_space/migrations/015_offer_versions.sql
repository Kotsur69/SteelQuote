-- Migration: wersjonowanie ofert przy edycji zapisanej oferty
-- Run this manually with: psql $DATABASE_URL -f migrations/015_offer_versions.sql
--
-- Zapis edytowanej, juz zapisanej oferty (PUT /api/offers/[id]) ma odtad NIE nadpisywac
-- wiersza w miejscu, tylko - o ile cos sie realnie zmienilo - wstawiac NOWY wiersz-wersje,
-- zeby poprzedni stan zostal widoczny w "moje oferty" zamiast zniknac pod UPDATE-em.
--
-- root_offer_id: NULL dla oferty-korzenia (oryginalu). Dla wersji wskazuje ZAWSZE na
-- korzen (nie na bezposredniego rodzica), zeby zgrupowanie "wszystkie wersje danej oferty"
-- bylo jednym prostym WHERE root_offer_id = X, bez rekurencji po lancuchu.
-- version_number: 0 dla korzenia, 1/2/3... dla kolejnych zapisanych wersji tej samej rodziny.
ALTER TABLE offers ADD COLUMN IF NOT EXISTS root_offer_id INTEGER REFERENCES offers(id);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_offers_root_offer_id ON offers(root_offer_id);
