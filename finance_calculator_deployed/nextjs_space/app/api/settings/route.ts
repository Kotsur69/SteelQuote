import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { DEFAULT_SETTINGS, settingsRowToAppSettings, type AppSettings } from '@/lib/currency';

// GET - Globalne ustawienia. Dostępne dla KAŻDEJ zalogowanej roli: junior i senior
// potrzebują kursu, żeby w ogóle wyświetlić cenę w PLN, a PGL/transport są ich
// domyślnymi wartościami startowymi. Zapis jest osobno chroniony (PATCH = tylko admin).
//
// Te wartości dotyczą WYŁĄCZNIE nowej kalkulacji. Zapisana oferta trzyma własne kopie
// pglBase/transport oraz własny zamrożony kurs w offer_data.
export async function GET() {
  const auth = await requireRole(['junior', 'senior', 'admin']);
  if ('error' in auth) return auth.error;

  try {
    const result = await pool.query(
      'SELECT eur_pln_rate, pgl_base_hrs, pgl_base_cr, pgl_base_hdg, pgl_base_pickled, pgl_base_teardrop, pgl_base_zm, transport_base, min_margin_pct FROM app_settings WHERE id = 1'
    );
    // Brak wiersza = migracja 007 nie została puszczona. Nie wywracamy kalkulatora —
    // oddajemy wartości domyślne (identyczne z seedem migracji).
    if (result.rows.length === 0) {
      return NextResponse.json({ settings: DEFAULT_SETTINGS });
    }
    return NextResponse.json({ settings: settingsRowToAppSettings(result.rows[0]) });
  } catch (error) {
    // 42P01 = undefined_table. Zdarza się, gdy kod jest wdrożony, a migracja 007 jeszcze
    // nie puszczona. Kalkulator ma wtedy działać na wartościach domyślnych, a nie sypać
    // 500 przy każdym wejściu — PATCH i tak zwróci czytelny błąd o brakującej migracji.
    if ((error as { code?: string })?.code === '42P01') {
      console.warn('Tabela app_settings nie istnieje — uruchom migrations/007_create_settings_table.sql. Używam wartości domyślnych.');
      return NextResponse.json({ settings: DEFAULT_SETTINGS });
    }
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// Walidacja pojedynczego pola. Zwraca liczbę albo komunikat błędu.
function parseNumber(
  value: unknown,
  label: string,
  { min, max }: { min: number; max: number }
): { value: number } | { error: string } {
  const n = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return { error: `${label}: podaj liczbę` };
  }
  if (n < min || n > max) {
    return { error: `${label}: wartość musi być w zakresie ${min}-${max}` };
  }
  return { value: n };
}

// PGL-owe kolumny, dla których zmiana wartości jest logowana do pgl_price_history
// (migracja 013) — eurPlnRate/transportBase nie mają odpowiednika steel_type, więc null.
type SteelType = 'HRS' | 'CR' | 'HDG' | 'PICKLED' | 'TEARDROP' | 'ZM';

// PATCH - Zmiana ustawień. Tylko admin.
// Body: { eurPlnRate?, pglBaseHrs?, pglBaseCr?, pglBaseHdg?, transportBase? } - wysyłamy
// tylko to, co się zmienia.
//
// Walidacja jest tu krytyczna: literówka w kursie (43 zamiast 4,3) zawyżyłaby KAŻDĄ
// nową wycenę w PLN dziesięciokrotnie. Baza ma te same CHECK-i jako druga linia obrony.
export async function PATCH(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  try {
    const body = await request.json();

    const spec: {
      key: keyof AppSettings;
      column: string;
      label: string;
      min: number;
      max: number;
      steelType: SteelType | null;
    }[] = [
      { key: 'eurPlnRate', column: 'eur_pln_rate', label: 'Kurs EUR/PLN', min: 0.0001, max: 100, steelType: null },
      { key: 'pglBaseHrs', column: 'pgl_base_hrs', label: 'PGL bazowe HRS', min: 0, max: 100000, steelType: 'HRS' },
      { key: 'pglBaseCr', column: 'pgl_base_cr', label: 'PGL bazowe CR', min: 0, max: 100000, steelType: 'CR' },
      { key: 'pglBaseHdg', column: 'pgl_base_hdg', label: 'PGL bazowe HDG', min: 0, max: 100000, steelType: 'HDG' },
      { key: 'pglBasePickled', column: 'pgl_base_pickled', label: 'PGL bazowe PICKLED', min: 0, max: 100000, steelType: 'PICKLED' },
      { key: 'pglBaseTeardrop', column: 'pgl_base_teardrop', label: 'PGL bazowe TEARDROP', min: 0, max: 100000, steelType: 'TEARDROP' },
      { key: 'pglBaseZm', column: 'pgl_base_zm', label: 'PGL bazowe ZM', min: 0, max: 100000, steelType: 'ZM' },
      { key: 'transportBase', column: 'transport_base', label: 'Transport bazowy', min: 0, max: 100000, steelType: null },
      { key: 'minMarginPct', column: 'min_margin_pct', label: 'Minimalna marża', min: 0, max: 100, steelType: null },
    ];

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const touchedPgl: { column: string; steelType: SteelType; value: number }[] = [];

    for (const field of spec) {
      if (body[field.key] === undefined) continue;
      const parsed = parseNumber(body[field.key], field.label, { min: field.min, max: field.max });
      if ('error' in parsed) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      sets.push(`${field.column} = $${i++}`);
      values.push(parsed.value);
      if (field.steelType) {
        touchedPgl.push({ column: field.column, steelType: field.steelType, value: parsed.value });
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'Brak pól do zmiany' }, { status: 400 });
    }

    sets.push(`updated_by = $${i++}`);
    values.push(session.userId);
    sets.push('updated_at = CURRENT_TIMESTAMP');

    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      // Stare wartości PGL PRZED zapisem, zablokowane FOR UPDATE — inaczej równoległy PATCH
      // mógłby wstawić log historii z już nieaktualnym "starym" stanem (patrz migracja 013).
      const before = await db.query(
        'SELECT pgl_base_hrs, pgl_base_cr, pgl_base_hdg, pgl_base_pickled, pgl_base_teardrop, pgl_base_zm FROM app_settings WHERE id = 1 FOR UPDATE'
      );

      if (before.rows.length === 0) {
        await db.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Brak wiersza ustawień - uruchom migrację 007_create_settings_table.sql' },
          { status: 404 }
        );
      }

      const oldByColumn: Record<string, number> = {
        pgl_base_hrs: Number(before.rows[0].pgl_base_hrs),
        pgl_base_cr: Number(before.rows[0].pgl_base_cr),
        pgl_base_hdg: Number(before.rows[0].pgl_base_hdg),
        pgl_base_pickled: Number(before.rows[0].pgl_base_pickled),
        pgl_base_teardrop: Number(before.rows[0].pgl_base_teardrop),
        pgl_base_zm: Number(before.rows[0].pgl_base_zm),
      };

      const result = await db.query(
        `UPDATE app_settings SET ${sets.join(', ')} WHERE id = 1
         RETURNING eur_pln_rate, pgl_base_hrs, pgl_base_cr, pgl_base_hdg, pgl_base_pickled, pgl_base_teardrop, pgl_base_zm, transport_base, min_margin_pct`,
        values
      );

      // Log historii tylko dla pól, które faktycznie zmieniły wartość — bez no-op wpisów,
      // gdy admin klika "zapisz" bez realnej zmiany danego pola.
      for (const field of touchedPgl) {
        const oldValue = oldByColumn[field.column];
        if (oldValue === field.value) continue;
        await db.query(
          `INSERT INTO pgl_price_history (steel_type, old_price, new_price, changed_by)
           VALUES ($1, $2, $3, $4)`,
          [field.steelType, oldValue, field.value, session.userId]
        );
      }

      await db.query('COMMIT');
      return NextResponse.json({ settings: settingsRowToAppSettings(result.rows[0]) });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
