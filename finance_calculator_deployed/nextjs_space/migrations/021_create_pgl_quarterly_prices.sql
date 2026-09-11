-- Migration: harmonogram kwartalny cen bazowych PGL (Q1-Q4 danego roku, per typ stali)
-- Run this manually with: psql $DATABASE_URL -f migrations/021_create_pgl_quarterly_prices.sql
--
-- Kontekst: do tej pory admin zmieniał PGL bazowe (app_settings.pgl_base_*) ręcznie, w chwili
-- gdy cena faktycznie się zmieniała (migracje 011/016, log w pgl_price_history). Ta migracja
-- dokłada możliwość ZAPLANOWANIA ceny na przyszły kwartał z wyprzedzeniem — np. admin wpisuje
-- cenę na Q4, gdy trwa jeszcze Q3 — a kalkulator ma sam przełączyć się na nią z chwilą wejścia
-- w ten kwartał, bez żadnej dodatkowej akcji admina.
--
-- Model: jeden wiersz = jedna cena jednego typu stali na jeden kwartał jednego roku (klucz
-- naturalny year+quarter+steel_type). GET /api/settings (patrz lib/pglQuarterly.ts) nakłada na
-- app_settings.pgl_base_* cenę z tej tabeli dla AKTUALNEGO kwartału wg zegara serwera — o ile
-- taki wiersz istnieje. W przeciwnym razie zostaje dotychczasowa wartość ręczna jako fallback,
-- więc instalacja bez ani jednego zaplanowanego kwartału działa dokładnie jak dziś.
--
-- Zapisane oferty i tak trzymają własną zamrożoną kopię PGL w offer_data — ta tabela wpływa
-- WYŁĄCZNIE na wartość startową nowej kalkulacji, dokładnie jak pgl_base_* dotychczas.

BEGIN;

CREATE TABLE IF NOT EXISTS pgl_quarterly_prices (
    year        SMALLINT NOT NULL,
    quarter     SMALLINT NOT NULL,
    steel_type  TEXT NOT NULL,
    price       NUMERIC(10,2) NOT NULL,
    updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (year, quarter, steel_type),
    CONSTRAINT pgl_quarterly_prices_year_sane CHECK (year BETWEEN 2020 AND 2100),
    CONSTRAINT pgl_quarterly_prices_quarter_sane CHECK (quarter BETWEEN 1 AND 4),
    CONSTRAINT pgl_quarterly_prices_steel_type_check
        CHECK (steel_type IN ('HRS', 'CR', 'HDG', 'PICKLED', 'TEARDROP', 'ZM')),
    CONSTRAINT pgl_quarterly_prices_price_sane CHECK (price >= 0)
);

-- GET /api/settings zawsze filtruje po (year, quarter) — PRIMARY KEY (year jako pierwsza
-- kolumna) już to pokrywa, osobny indeks jest zbędny.

\echo '== pgl_quarterly_prices po migracji =='
SELECT count(*) AS existing_rows FROM pgl_quarterly_prices;

COMMIT;
-- W razie problemów zamiast powyższego COMMIT użyj:
-- ROLLBACK;
