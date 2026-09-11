import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import {
  currentQuarter,
  readCurrentQuarterPrices,
  readQuarterlyPricesForYear,
  STEEL_TYPES,
  type Quarter,
} from '@/lib/pglQuarterly';
import type { SteelType } from '@/lib/calculatorData';

export const dynamic = 'force-dynamic';

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;
const MAX_PRICE = 100000;

function parseYear(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < MIN_YEAR || n > MAX_YEAR) return currentQuarter().year;
  return n;
}

// GET - Siatka zaplanowanych cen PGL dla jednego roku (?year=, domyślnie bieżący). Tylko
// admin — spójne z tym, kto jedyny może te ceny zmieniać (PATCH /api/settings ma tę samą
// regułę dla ręcznych wartości PGL).
//
// `currentPrices` dotyczy zawsze REALNEGO bieżącego kwartału, niezależnie od tego, który rok
// admin ogląda — panel pokazuje w kolumnie "bieżący miesiąc", skąd bierze się cena działająca
// w tej chwili, i musi to wiedzieć nawet gdy przewinie siatkę na przyszły rok.
export async function GET(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseYear(searchParams.get('year'));
    const entries = await readQuarterlyPricesForYear(year);
    const currentPrices = await readCurrentQuarterPrices();
    const { year: nowYear, quarter: nowQuarter } = currentQuarter();

    return NextResponse.json({
      year,
      currentYear: nowYear,
      currentQuarter: nowQuarter,
      currentPrices,
      entries,
    });
  } catch (error) {
    // 42P01 = undefined_table. Migracja 021 jeszcze nie puszczona — nie wywracamy panelu,
    // oddajemy pustą siatkę (analogicznie do GET /api/settings/pgl-history przy braku migracji 013).
    if ((error as { code?: string })?.code === '42P01') {
      console.warn('Tabela pgl_quarterly_prices nie istnieje — uruchom migrations/021_create_pgl_quarterly_prices.sql.');
      const { year: nowYear, quarter: nowQuarter } = currentQuarter();
      return NextResponse.json({
        year: nowYear,
        currentYear: nowYear,
        currentQuarter: nowQuarter,
        currentPrices: {},
        entries: [],
      });
    }
    console.error('Error fetching PGL quarterly prices:', error);
    return NextResponse.json({ error: 'Failed to fetch PGL quarterly prices' }, { status: 500 });
  }
}

interface ValidatedCell {
  quarter: Quarter;
  steelType: SteelType;
  price: number;
}

/**
 * Walidacja siatki. Admin zawsze wysyła komplet 24 komórek (4 kwartały x 6 typów) dla
 * jednego roku; puste pole (null/'') = "nie planuję ceny na ten kwartał", więc te komórki
 * są tu odrzucane (nie trafiają do INSERT poniżej) zamiast błędu walidacji.
 */
function validateEntries(year: unknown, raw: unknown): { year: number; cells: ValidatedCell[] } | { error: string } {
  const parsedYear = typeof year === 'string' ? parseInt(year, 10) : year;
  if (typeof parsedYear !== 'number' || !Number.isFinite(parsedYear) || parsedYear < MIN_YEAR || parsedYear > MAX_YEAR) {
    return { error: `Rok: podaj liczbę w zakresie ${MIN_YEAR}-${MAX_YEAR}` };
  }
  if (!Array.isArray(raw)) {
    return { error: 'Brak siatki cen do zapisania.' };
  }

  const cells: ValidatedCell[] = [];
  for (const rawEntry of raw) {
    const entry = rawEntry as Record<string, unknown>;
    const quarter = typeof entry?.quarter === 'string' ? parseInt(entry.quarter, 10) : entry?.quarter;
    if (quarter !== 1 && quarter !== 2 && quarter !== 3 && quarter !== 4) {
      return { error: 'Nieprawidłowy kwartał — dozwolone 1-4.' };
    }
    const steelType = entry?.steelType;
    if (typeof steelType !== 'string' || !STEEL_TYPES.includes(steelType as SteelType)) {
      return { error: `Nieprawidłowy typ stali: ${String(steelType)}` };
    }

    // Puste pole -> pomijamy (nie planujemy tego kwartału dla tego typu).
    if (entry?.price === null || entry?.price === undefined || entry?.price === '') continue;

    const price = typeof entry.price === 'string' ? parseFloat(entry.price.replace(',', '.')) : entry.price;
    if (typeof price !== 'number' || !Number.isFinite(price)) {
      return { error: `${steelType} Q${quarter}: podaj liczbę` };
    }
    if (price < 0 || price > MAX_PRICE) {
      return { error: `${steelType} Q${quarter}: wartość musi być w zakresie 0-${MAX_PRICE}` };
    }

    cells.push({ quarter: quarter as Quarter, steelType: steelType as SteelType, price });
  }

  return { year: parsedYear, cells };
}

// app_settings kolumna dla każdego typu stali — fallback, gdy dany typ nie ma zaplanowanej
// ceny na bieżący kwartał (patrz applyQuarterlyPglOverride w lib/pglQuarterly.ts).
const BASE_COLUMN_BY_STEEL_TYPE: Record<SteelType, string> = {
  HRS: 'pgl_base_hrs',
  CR: 'pgl_base_cr',
  HDG: 'pgl_base_hdg',
  PICKLED: 'pgl_base_pickled',
  TEARDROP: 'pgl_base_teardrop',
  ZM: 'pgl_base_zm',
};

// PUT - podmiana całej siatki zaplanowanych cen PGL dla jednego roku. Tylko admin.
//
// Zapis jest CAŁOŚCIOWY (DELETE + INSERT w jednej transakcji, per rok) — ten sam wzorzec co
// PUT /api/settings/tariff: admin edytuje siatkę jako całość, a nie pojedyncze komórki, więc
// diffowanie po stronie serwera tylko dodałoby złożoność bez realnej korzyści.
//
// Body: { year: number, entries: [{ quarter, steelType, price: number|null }, ...] }
export async function PUT(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  try {
    const body = await request.json();
    const parsed = validateEntries(body?.year, body?.entries);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // Gdy admin edytuje siatkę BIEŻĄCEGO roku, komórka bieżącego kwartału decyduje o cenie
    // faktycznie używanej "teraz" (patrz applyQuarterlyPglOverride) — dokładnie tak samo jak
    // ręczna wartość pgl_base_* w PATCH /api/settings. Taka zmiana musi więc trafić do tego
    // samego logu pgl_price_history, inaczej zmiana ceny "znika" z historii mimo że realnie
    // zaszła (dla typów z aktywnym harmonogramem pole ręczne jest w panelu read-only, więc
    // jedyny sposób na zmianę ceny "teraz" to właśnie ta komórka).
    const { year: curYear, quarter: curQuarter } = currentQuarter();
    const logsCurrentQuarter = parsed.year === curYear;

    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      const oldEffectiveByType: Partial<Record<SteelType, number>> = {};
      if (logsCurrentQuarter) {
        const baseRow = await db.query(
          `SELECT ${STEEL_TYPES.map((t) => BASE_COLUMN_BY_STEEL_TYPE[t]).join(', ')} FROM app_settings WHERE id = 1`
        );
        const oldQuarterly = await db.query(
          `SELECT steel_type, price FROM pgl_quarterly_prices WHERE year = $1 AND quarter = $2`,
          [curYear, curQuarter]
        );
        const oldQuarterlyByType: Partial<Record<SteelType, number>> = {};
        for (const row of oldQuarterly.rows) {
          oldQuarterlyByType[row.steel_type as SteelType] = Number(row.price);
        }
        for (const type of STEEL_TYPES) {
          const manual = baseRow.rows[0]?.[BASE_COLUMN_BY_STEEL_TYPE[type]];
          oldEffectiveByType[type] =
            oldQuarterlyByType[type] ?? (manual === undefined ? undefined : Number(manual));
        }
      }

      await db.query('DELETE FROM pgl_quarterly_prices WHERE year = $1', [parsed.year]);

      for (const cell of parsed.cells) {
        await db.query(
          `INSERT INTO pgl_quarterly_prices (year, quarter, steel_type, price, updated_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [parsed.year, cell.quarter, cell.steelType, cell.price, session.userId]
        );
      }

      if (logsCurrentQuarter) {
        const newQuarterlyByType: Partial<Record<SteelType, number>> = {};
        for (const cell of parsed.cells) {
          if (cell.quarter === curQuarter) newQuarterlyByType[cell.steelType] = cell.price;
        }
        for (const type of STEEL_TYPES) {
          const oldValue = oldEffectiveByType[type];
          // Gdy typ traci zaplanowaną cenę na ten kwartał, newQuarterlyByType nie ma wpisu i
          // wracamy do tej samej ręcznej wartości, którą oldEffectiveByType już uwzględniał
          // jako fallback — to poprawne "brak zmiany", nie bug.
          const newValue = newQuarterlyByType[type] ?? oldEffectiveByType[type];
          if (oldValue === undefined || newValue === undefined || oldValue === newValue) continue;
          try {
            await db.query('SAVEPOINT pgl_history_insert');
            await db.query(
              `INSERT INTO pgl_price_history (steel_type, old_price, new_price, changed_by)
               VALUES ($1, $2, $3, $4)`,
              [type, oldValue, newValue, session.userId]
            );
          } catch (historyError) {
            // 42P01 = undefined_table. Migracja 013 jeszcze nie puszczona — nie wywracamy
            // zapisu harmonogramu, tylko pomijamy log (patrz GET /api/settings/pgl-history).
            if ((historyError as { code?: string })?.code !== '42P01') throw historyError;
            await db.query('ROLLBACK TO SAVEPOINT pgl_history_insert');
            console.warn('Tabela pgl_price_history nie istnieje — uruchom migrations/013_create_pgl_price_history.sql.');
          }
        }
      }

      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }

    const entries = await readQuarterlyPricesForYear(parsed.year);
    return NextResponse.json({ year: parsed.year, entries });
  } catch (error) {
    if ((error as { code?: string })?.code === '42P01') {
      return NextResponse.json(
        { error: 'Brak tabeli harmonogramu PGL — uruchom migrations/021_create_pgl_quarterly_prices.sql' },
        { status: 404 }
      );
    }
    console.error('Error saving PGL quarterly prices:', error);
    return NextResponse.json({ error: 'Nie udało się zapisać harmonogramu cen PGL' }, { status: 500 });
  }
}
