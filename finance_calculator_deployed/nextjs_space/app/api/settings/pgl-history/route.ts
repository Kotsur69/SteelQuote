import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

export interface PglPriceHistoryEntry {
  id: number;
  steelType: 'HRS' | 'CR' | 'HDG' | 'PICKLED' | 'TEARDROP' | 'ZM';
  oldPrice: number;
  newPrice: number;
  changedByName: string | null;
  changedByEmail: string | null;
  changedAt: string;
}

// GET - Historia zmian cen bazowych PGL (HRS/CR/HDG). Tylko admin — spójne z tym, kto
// jedyny może te ceny w ogóle zmieniać (PATCH /api/settings, migracja 013).
// Query: ?limit= (domyślnie 200, maks. 1000).
export async function GET(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const parsedLimit = parseInt(searchParams.get('limit') || '', 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 1000)
      : 200;

    const result = await pool.query(
      `SELECT h.id, h.steel_type, h.old_price, h.new_price, h.changed_at,
              u.full_name AS changed_by_name, u.email AS changed_by_email
       FROM pgl_price_history h
       LEFT JOIN users u ON u.id = h.changed_by
       ORDER BY h.changed_at DESC
       LIMIT $1`,
      [limit]
    );

    const history: PglPriceHistoryEntry[] = result.rows.map((row) => ({
      id: row.id,
      steelType: row.steel_type,
      oldPrice: Number(row.old_price),
      newPrice: Number(row.new_price),
      changedByName: row.changed_by_name,
      changedByEmail: row.changed_by_email,
      changedAt: row.changed_at,
    }));

    return NextResponse.json({ history });
  } catch (error) {
    // 42P01 = undefined_table. Migracja 013 jeszcze nie puszczona — nie wywracamy panelu,
    // oddajemy pustą historię (analogicznie do GET /api/settings przy braku migracji 007).
    if ((error as { code?: string })?.code === '42P01') {
      console.warn('Tabela pgl_price_history nie istnieje — uruchom migrations/013_create_pgl_price_history.sql.');
      return NextResponse.json({ history: [] });
    }
    console.error('Error fetching PGL price history:', error);
    return NextResponse.json({ error: 'Failed to fetch PGL price history' }, { status: 500 });
  }
}
