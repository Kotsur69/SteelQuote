import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession, type Role, type SessionPayload } from '@/lib/auth';

// Świeży stan konta z bazy — token żyje 24h, więc dezaktywacja/zmiana roli
// przez admina musi działać natychmiast, nie dopiero po wygaśnięciu tokenu.
export interface FreshSession extends SessionPayload {
  isActive: boolean;
}

// Zwraca błędową odpowiedź (401/403) albo świeżą sesję z aktualną rolą z bazy.
// Używać na początku route handlerów, które wymagają roli lub operacji wrażliwych
// (approve/reject/admin/send). Dla samych odczytów, gdzie 24h opóźnienie roli jest
// akceptowalne, można użyć lżejszego requireRoleFromToken.
export async function requireRole(
  allowedRoles: Role[]
): Promise<{ session: FreshSession } | { error: NextResponse }> {
  const tokenSession = await getSession();
  if (!tokenSession) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const result = await pool.query(
    'SELECT role, is_active FROM users WHERE id = $1',
    [tokenSession.userId]
  );

  if (result.rows.length === 0 || !result.rows[0].is_active) {
    return { error: NextResponse.json({ error: 'Konto nieaktywne' }, { status: 403 }) };
  }

  const role: Role = result.rows[0].role;
  if (!allowedRoles.includes(role)) {
    return { error: NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 }) };
  }

  return {
    session: {
      userId: tokenSession.userId,
      email: tokenSession.email,
      role,
      isActive: true,
    },
  };
}

// Lekki wariant bez zapytania do bazy — ufa roli z tokenu.
// Tylko dla odczytów niskiego ryzyka; NIE dla approve/reject/admin/send.
export function requireRoleFromToken(
  session: SessionPayload | null,
  allowedRoles: Role[]
): { ok: true } | { error: NextResponse } {
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!allowedRoles.includes(session.role)) {
    return { error: NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 }) };
  }
  return { ok: true };
}
