import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

// Panel admina — zakładka "Kontakty": pełny CRUD nad client_contacts (edycja/usuwanie),
// w odróżnieniu od /api/clients/contacts (GET podpowiedzi + POST zapisu przez handlowca,
// który tylko uzupełnia luki i nigdy nie nadpisuje). Tu admin nadpisuje pola wprost —
// to narzędzie do poprawek, nie kolejny "miękki" zapis.

// GET - Lista wszystkich kontaktów, z nazwą firmy (tylko admin).
export async function GET() {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const result = await pool.query(
      `SELECT cc.id, cc.client_id, cc.first_name, cc.last_name, cc.phone, cc.email,
              cc.created_at, cc.updated_at, c.company
       FROM client_contacts cc
       JOIN clients c ON c.id = cc.client_id
       ORDER BY c.company NULLS LAST, cc.last_name NULLS LAST, cc.first_name NULLS LAST, cc.id`
    );
    return NextResponse.json({ contacts: result.rows });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }
}

// PATCH - Edytuj kontakt. Body: { id, first_name, last_name, phone, email }.
// Nadpisuje pola wprost (nie gap-fill) — to świadoma korekta admina.
export async function PATCH(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const b = await request.json();
    const { id } = b;
    if (!id) {
      return NextResponse.json({ error: 'Brak id kontaktu' }, { status: 400 });
    }

    const fields = ['first_name', 'last_name', 'phone', 'email'];
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const f of fields) {
      if (b[f] !== undefined) {
        sets.push(`${f} = $${i++}`);
        values.push(b[f] || null);
      }
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: 'Brak pól do zmiany' }, { status: 400 });
    }
    sets.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id);
    try {
      const result = await pool.query(
        `UPDATE client_contacts SET ${sets.join(', ')} WHERE id = $${i}
         RETURNING id, client_id, first_name, last_name, phone, email, created_at, updated_at`,
        values
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Nie znaleziono kontaktu' }, { status: 404 });
      }
      return NextResponse.json({ contact: result.rows[0] });
    } catch (dbError) {
      // Kolizja z unikalnym indeksem (client_id + imię + nazwisko) — patrz migracja 010.
      if ((dbError as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'Osoba o tym imieniu i nazwisku już istnieje dla tej firmy' },
          { status: 409 }
        );
      }
      throw dbError;
    }
  } catch (error) {
    console.error('Error updating contact:', error);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }
}

// DELETE - Usuń kontakt (?id=123).
export async function DELETE(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const id = parseInt(request.nextUrl.searchParams.get('id') || '');
    if (!id) {
      return NextResponse.json({ error: 'Brak id kontaktu' }, { status: 400 });
    }

    const result = await pool.query('DELETE FROM client_contacts WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nie znaleziono kontaktu' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
  }
}
