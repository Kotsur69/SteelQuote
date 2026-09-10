import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import type { TariffBand } from '@/lib/transportTariff';

// PUT - podmiana całego cennika transportowego. Tylko admin.
//
// Zapis jest CAŁOŚCIOWY (DELETE + INSERT w jednej transakcji), a nie per wiersz: cennik
// ma sens wyłącznie jako komplet pasm. Zapis pojedynczego pasma mógłby zostawić dziurę
// (np. brak stawki dla 250 km) i wtedy wycena po cichu przestałaby działać.
//
// Body: { bands: [{ fromKm, toKm, flatPln, perKmPln }, ...] }

const MAX_BANDS = 20;
const MAX_DISTANCE_KM = 20000;
const MAX_PRICE_PLN = 1000000;

function parseOptionalNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined; // undefined = błąd
  return n;
}

/**
 * Walidacja cennika. Zwraca gotowe pasma albo komunikat, który admin zobaczy wprost.
 *
 * Reguły są tu, a nie tylko w CHECK-ach bazy, bo admin ma dostać zdanie po polsku
 * ("Pasmo 3: podaj ryczałt albo stawkę za km"), a nie błąd Postgresa.
 */
function validateBands(raw: unknown): { bands: TariffBand[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Cennik musi mieć co najmniej jedno pasmo.' };
  }
  if (raw.length > MAX_BANDS) {
    return { error: `Cennik może mieć najwyżej ${MAX_BANDS} pasm.` };
  }

  const bands: TariffBand[] = [];

  for (let i = 0; i < raw.length; i++) {
    const label = `Pasmo ${i + 1}`;
    const entry = raw[i] as Record<string, unknown>;

    const fromKm = parseOptionalNumber(entry?.fromKm);
    if (fromKm === undefined || fromKm === null) {
      return { error: `${label}: podaj początek zakresu (km).` };
    }
    if (fromKm < 0 || fromKm > MAX_DISTANCE_KM) {
      return { error: `${label}: początek zakresu musi być w przedziale 0-${MAX_DISTANCE_KM} km.` };
    }

    const toKm = parseOptionalNumber(entry?.toKm);
    if (toKm === undefined) {
      return { error: `${label}: koniec zakresu musi być liczbą albo pusty.` };
    }
    if (toKm !== null && (toKm <= fromKm || toKm > MAX_DISTANCE_KM)) {
      return { error: `${label}: koniec zakresu musi być większy od początku i nie większy niż ${MAX_DISTANCE_KM} km.` };
    }

    const flatPln = parseOptionalNumber(entry?.flatPln);
    const perKmPln = parseOptionalNumber(entry?.perKmPln);
    if (flatPln === undefined || perKmPln === undefined) {
      return { error: `${label}: stawka musi być liczbą albo pusta.` };
    }
    // Dokładnie jeden model ceny — ta sama reguła co CONSTRAINT tariff_band_one_price_model.
    if ((flatPln === null) === (perKmPln === null)) {
      return { error: `${label}: podaj ALBO ryczałt, ALBO stawkę za km — nie oba naraz.` };
    }
    const price = flatPln ?? perKmPln;
    if (price === null || price < 0 || price > MAX_PRICE_PLN) {
      return { error: `${label}: stawka musi być w przedziale 0-${MAX_PRICE_PLN} zł.` };
    }

    bands.push({ fromKm, toKm, flatPln, perKmPln });
  }

  bands.sort((a, b) => a.fromKm - b.fromKm);

  // Dwa pasma o tym samym początku = niejednoznaczny cennik (i tak odbiłby to unikalny
  // indeks w bazie, ale admin dostanie tu czytelniejszy komunikat).
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].fromKm === bands[i - 1].fromKm) {
      return { error: `Dwa pasma zaczynają się od ${bands[i].fromKm} km — początki muszą być różne.` };
    }
  }

  // Bez pasma otwartego najdalsze trasy zostałyby bez stawki, a handlowiec zobaczyłby
  // tylko "wpisz kwotę ręcznie" — i to dopiero przy pierwszej dalekiej ofercie.
  const openEnded = bands.filter(b => b.toKm === null);
  if (openEnded.length !== 1) {
    return { error: 'Dokładnie jedno pasmo musi zostać bez górnej granicy (łapie wszystkie dalsze trasy).' };
  }
  if (bands[bands.length - 1].toKm !== null) {
    return { error: 'Pasmo bez górnej granicy musi być ostatnie.' };
  }

  return { bands };
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  try {
    const body = await request.json();
    const parsed = validateBands(body?.bands);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('DELETE FROM transport_tariff_bands');

      for (const band of parsed.bands) {
        await db.query(
          `INSERT INTO transport_tariff_bands
             (distance_from_km, distance_to_km, flat_price_pln, price_per_km_pln, updated_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [band.fromKm, band.toKm, band.flatPln, band.perKmPln, session.userId]
        );
      }

      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }

    return NextResponse.json({ bands: parsed.bands });
  } catch (error) {
    if ((error as { code?: string })?.code === '42P01') {
      return NextResponse.json(
        { error: 'Brak tabeli cennika — uruchom migrations/020_transport_tariff.sql' },
        { status: 404 }
      );
    }
    console.error('Error saving transport tariff:', error);
    return NextResponse.json({ error: 'Nie udało się zapisać cennika' }, { status: 500 });
  }
}
