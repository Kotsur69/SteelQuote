import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { DEFAULT_ORIGIN_ADDRESS } from '@/lib/transportTariff';
import {
  addressCacheKey,
  normalizeAddress,
  resolveRoute,
  RoutingError,
  type RouteProvider,
} from '@/lib/transportRouting';

// POST - odległość drogowa z magazynu do klienta.
//
// Dostępne dla każdej zalogowanej roli: to zwykłe narzędzie wyceny, a nie zmiana danych.
// Klucz Geoapify żyje wyłącznie tutaj (server-side) — przeglądarka nigdy go nie widzi.
//
// Każdy wynik ląduje w route_cache, bo publiczne Nominatim/OSRM mają limit ~1 req/s,
// a Geoapify limit dzienny. Druga wycena dla tego samego klienta ma być natychmiastowa
// i nie zużywać limitu.
//
// Body: { destAddress: string, originAddress?: string }
//   originAddress pominięty -> adres nadania z app_settings (domyślnie Kraków).

interface CachedRoute {
  distanceKm: number;
  originLabel: string;
  destLabel: string;
  provider: RouteProvider;
}

async function readCache(originKey: string, destKey: string): Promise<CachedRoute | null> {
  try {
    const result = await pool.query(
      `SELECT distance_km, origin_label, dest_label, provider
       FROM route_cache WHERE origin_key = $1 AND dest_key = $2`,
      [originKey, destKey]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      distanceKm: Number(row.distance_km),
      originLabel: row.origin_label,
      destLabel: row.dest_label,
      provider: row.provider as RouteProvider,
    };
  } catch (error) {
    // 42P01 = undefined_table: kod wdrożony, migracja 020 jeszcze nie puszczona.
    // Brak cache'u nie może blokować wyceny — liczymy trasę na żywo.
    if ((error as { code?: string })?.code === '42P01') {
      console.warn('Tabela route_cache nie istnieje — uruchom migrations/020_transport_tariff.sql.');
      return null;
    }
    throw error;
  }
}

async function writeCache(
  originKey: string,
  destKey: string,
  route: Awaited<ReturnType<typeof resolveRoute>>
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO route_cache
         (origin_key, dest_key, origin_label, dest_label,
          origin_lat, origin_lng, dest_lat, dest_lng, distance_km, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (origin_key, dest_key) DO UPDATE SET
         origin_label = EXCLUDED.origin_label,
         dest_label   = EXCLUDED.dest_label,
         origin_lat   = EXCLUDED.origin_lat,
         origin_lng   = EXCLUDED.origin_lng,
         dest_lat     = EXCLUDED.dest_lat,
         dest_lng     = EXCLUDED.dest_lng,
         distance_km  = EXCLUDED.distance_km,
         provider     = EXCLUDED.provider`,
      [
        originKey, destKey,
        route.origin.label, route.dest.label,
        route.origin.lat, route.origin.lng,
        route.dest.lat, route.dest.lng,
        route.distanceKm, route.provider,
      ]
    );
  } catch (error) {
    // Zapis cache'u jest optymalizacją, nie warunkiem poprawności — handlowiec ma
    // dostać swoje kilometry nawet gdy cache padnie.
    console.error('Nie udało się zapisać route_cache:', error);
  }
}

/** Adres nadania z ustawień. Fallback na stałą, gdy migracja 020 nie jest puszczona. */
async function readOriginFromSettings(): Promise<string> {
  try {
    const result = await pool.query(
      'SELECT transport_origin_address FROM app_settings WHERE id = 1'
    );
    const value = result.rows[0]?.transport_origin_address;
    return typeof value === 'string' && value.trim().length > 0 ? value : DEFAULT_ORIGIN_ADDRESS;
  } catch {
    return DEFAULT_ORIGIN_ADDRESS;
  }
}

// Komunikat dla handlowca zamiast surowego kodu błędu. Każdy przypadek kończy się
// tym samym: da się wpisać kilometry ręcznie, więc wycena nigdy nie jest zablokowana.
const ERROR_MESSAGES: Record<string, string> = {
  EMPTY_ADDRESS: 'Podaj adres dostawy.',
  ORIGIN_NOT_FOUND: 'Nie znaleziono adresu nadania — popraw go w Ustawieniach.',
  DEST_NOT_FOUND: 'Nie znaleziono adresu dostawy. Sprawdź pisownię albo wpisz kilometry ręcznie.',
  NO_ROUTE: 'Nie udało się wyznaczyć trasy dla tych adresów. Wpisz kilometry ręcznie.',
  PROVIDER_UNAVAILABLE: 'Serwis map nie odpowiada. Wpisz kilometry ręcznie.',
};

export async function POST(request: NextRequest) {
  const auth = await requireRole(['junior', 'senior', 'admin']);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();

    const destAddress = normalizeAddress(body?.destAddress);
    const originAddress = body?.originAddress
      ? normalizeAddress(body.originAddress)
      : normalizeAddress(await readOriginFromSettings());

    const originKey = addressCacheKey(originAddress);
    const destKey = addressCacheKey(destAddress);

    const cached = await readCache(originKey, destKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const route = await resolveRoute(originAddress, destAddress);
    await writeCache(originKey, destKey, route);

    return NextResponse.json({
      distanceKm: route.distanceKm,
      originLabel: route.origin.label,
      destLabel: route.dest.label,
      provider: route.provider,
      cached: false,
    });
  } catch (error) {
    if (error instanceof RoutingError) {
      // 422, nie 500: żądanie było poprawne, po prostu nie dało się wyznaczyć trasy.
      return NextResponse.json(
        { error: ERROR_MESSAGES[error.code] ?? ERROR_MESSAGES.PROVIDER_UNAVAILABLE, code: error.code },
        { status: 422 }
      );
    }
    console.error('Błąd liczenia trasy:', error);
    return NextResponse.json({ error: 'Nie udało się policzyć trasy' }, { status: 500 });
  }
}
