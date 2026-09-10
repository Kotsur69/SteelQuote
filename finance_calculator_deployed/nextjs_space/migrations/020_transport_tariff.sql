-- Migration: cennik transportowy (pasma odległości) + cache tras + parametry ciężarówki
-- Run this manually with: psql $DATABASE_URL -f migrations/020_transport_tariff.sql
--
-- Kontekst: do tej pory transport był JEDNĄ liczbą (app_settings.transport_base, €/t),
-- wpisywaną ręcznie przez handlowca. Od tej zmiany liczy się go z realnej odległości
-- drogowej Kraków -> adres klienta wg cennika przewoźnika.
--
-- Model kosztu (decyzja usera 2026-09-10):
--   1. km z API tras (Geoapify -> fallback Nominatim+OSRM), cache w route_cache
--   2. cena za JEDNĄ ciężarówkę = pasmo z transport_tariff_bands (ryczałt albo zł/km)
--   3. liczba ciężarówek = ceil(tony_calej_oferty / transport_truck_capacity_t)
--      — nawet 1 tona to CAŁA ciężarówka, klient płaci za komplet
--   4. koszt = ciężarówki * cena + dopłaty ponadgabarytowe
--   5. koszt / tony_oferty -> zł/t -> €/t po kursie z app_settings
--
-- Stawki trzymamy w PLN, bo tak kwotuje je przewoźnik (1344 zł, 7,50 zł/km). Przeliczenie
-- na EUR (jedyna waluta silnika, patrz lib/currency.ts) dzieje się przy liczeniu i jest
-- zamrażane w offer_data razem z kursem — dokładnie jak PGL bazowe.
--
-- Bezpieczna przy wielokrotnym uruchomieniu (IF NOT EXISTS wszędzie).

BEGIN;

-- --- Parametry transportu w app_settings ------------------------------------

-- Ładowność jednej ciężarówki w tonach. 21 t = realna ładowność naczepy przy stali.
ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS transport_truck_capacity_t NUMERIC(6,2) NOT NULL DEFAULT 21;

-- Adres nadania. Cennik jest liczony "wysyłka z Krakowa", ale trzymamy to jako
-- ustawienie, a nie stałą w kodzie — magazyn może się zmienić bez deployu.
ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS transport_origin_address TEXT NOT NULL DEFAULT 'Kraków, Polska';

-- Dopłata za elementy 13,6-15,1 m, naliczana ZA KAŻDĄ ciężarówkę (tak jak stawka bazowa).
ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS transport_oversize_long_pln NUMERIC(10,2) NOT NULL DEFAULT 250;

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_truck_capacity_sane;
ALTER TABLE app_settings
    ADD CONSTRAINT app_settings_truck_capacity_sane
    CHECK (transport_truck_capacity_t > 0 AND transport_truck_capacity_t <= 100);

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_oversize_long_sane;
ALTER TABLE app_settings
    ADD CONSTRAINT app_settings_oversize_long_sane
    CHECK (transport_oversize_long_pln >= 0 AND transport_oversize_long_pln <= 100000);

-- --- Cennik: pasma odległości -----------------------------------------------
--
-- Pasmo ma ALBO ryczałt (flat_price_pln) ALBO stawkę kilometrową (price_per_km_pln),
-- nigdy oba i nigdy żadnego — pilnuje tego CHECK poniżej. distance_to_km = NULL
-- oznacza "i wszystko powyżej" (ostatnie pasmo).

CREATE TABLE IF NOT EXISTS transport_tariff_bands (
    id               SERIAL PRIMARY KEY,
    distance_from_km NUMERIC(8,2) NOT NULL,
    distance_to_km   NUMERIC(8,2),
    flat_price_pln   NUMERIC(10,2),
    price_per_km_pln NUMERIC(10,2),
    updated_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT tariff_band_range_sane
        CHECK (distance_from_km >= 0 AND (distance_to_km IS NULL OR distance_to_km > distance_from_km)),
    -- Dokładnie jeden model ceny na pasmo.
    CONSTRAINT tariff_band_one_price_model
        CHECK ((flat_price_pln IS NOT NULL) <> (price_per_km_pln IS NOT NULL)),
    CONSTRAINT tariff_band_price_sane
        CHECK (COALESCE(flat_price_pln, 0) >= 0 AND COALESCE(price_per_km_pln, 0) >= 0)
);

-- Dwa pasma nie mogą zaczynać się w tym samym miejscu — inaczej wybór pasma
-- zależałby od kolejności wierszy, a nie od danych.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tariff_bands_from ON transport_tariff_bands (distance_from_km);

-- Cennik AMSteel (wysyłka z Krakowa), stan na 2026-09-10.
INSERT INTO transport_tariff_bands (distance_from_km, distance_to_km, flat_price_pln, price_per_km_pln)
SELECT * FROM (VALUES
    (0::numeric,   100::numeric,  1344::numeric, NULL::numeric),
    (100::numeric, 223::numeric,  1680::numeric, NULL::numeric),
    (223::numeric, 350::numeric,  NULL::numeric, 7.50::numeric),
    (350::numeric, NULL::numeric, NULL::numeric, 6.50::numeric)
) AS v(distance_from_km, distance_to_km, flat_price_pln, price_per_km_pln)
WHERE NOT EXISTS (SELECT 1 FROM transport_tariff_bands);

-- --- Cache tras --------------------------------------------------------------
--
-- Publiczne serwery (Nominatim/OSRM) mają limit ~1 req/s i zero SLA, a Geoapify ma
-- dzienny limit. Ta sama trasa do tego samego klienta ma się liczyć RAZ. Klucze są
-- znormalizowanym adresem (lower+trim), żeby "Kraków " i "kraków" trafiły w ten sam wpis.

CREATE TABLE IF NOT EXISTS route_cache (
    id           SERIAL PRIMARY KEY,
    origin_key   TEXT NOT NULL,
    dest_key     TEXT NOT NULL,
    origin_label TEXT NOT NULL,
    dest_label   TEXT NOT NULL,
    origin_lat   NUMERIC(9,6) NOT NULL,
    origin_lng   NUMERIC(9,6) NOT NULL,
    dest_lat     NUMERIC(9,6) NOT NULL,
    dest_lng     NUMERIC(9,6) NOT NULL,
    distance_km  NUMERIC(8,2) NOT NULL,
    provider     VARCHAR(32)  NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT route_cache_distance_sane CHECK (distance_km >= 0 AND distance_km <= 20000)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_cache_pair ON route_cache (origin_key, dest_key);

-- --- Kontrola PRZED COMMIT ---------------------------------------------------

\echo '== Pasma cennika =='
SELECT distance_from_km, distance_to_km, flat_price_pln, price_per_km_pln
FROM transport_tariff_bands ORDER BY distance_from_km;

\echo '== Parametry transportu w app_settings =='
SELECT transport_truck_capacity_t, transport_origin_address, transport_oversize_long_pln
FROM app_settings WHERE id = 1;

COMMIT;
-- W razie problemów zamiast powyższego COMMIT użyj:
-- ROLLBACK;
