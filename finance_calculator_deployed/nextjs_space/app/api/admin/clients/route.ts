import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { syncPrimaryContact } from '@/lib/clientDirectory';

// GET - Lista klientów + liczba powiązanych ofert.
//
// Senior + admin (migracja 023): senior potrzebuje tej listy, żeby ustawić klientowi
// własny termin płatności (patrz PATCH niżej) — pełny odczyt jest tu nieszkodliwy,
// bo to te same dane, które senior i tak widzi przez podpowiedzi w kalkulatorze.
export async function GET() {
  const auth = await requireRole(['senior', 'admin']);
  if ('error' in auth) return auth.error;

  try {
    const result = await pool.query(
      `SELECT c.id, c.first_name, c.last_name, c.company, c.nip, c.address, c.sap_id,
              c.phone, c.email, c.payment_term_days, c.created_by, c.created_at, c.updated_at,
              COUNT(o.id)::int AS offers_count
       FROM clients c
       LEFT JOIN offers o ON o.client_id = c.id
       GROUP BY c.id
       ORDER BY c.company NULLS LAST, c.last_name NULLS LAST, c.id`
    );
    return NextResponse.json({ clients: result.rows });
  } catch (error) {
    console.error('Error fetching clients:', error);
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

// POST - Utwórz klienta. Wymaga choć jednego pola identyfikującego (firma/nazwisko).
export async function POST(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  try {
    const b = await request.json();
    const { first_name, last_name, company, nip, address, sap_id, phone, email } = b;

    if (!company && !last_name && !first_name) {
      return NextResponse.json(
        { error: 'Podaj przynajmniej firmę lub nazwisko klienta' },
        { status: 400 }
      );
    }

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const result = await db.query(
        `INSERT INTO clients (first_name, last_name, company, nip, address, sap_id, phone, email, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, first_name, last_name, company, nip, address, sap_id, phone, email, created_by, created_at, updated_at`,
        [
          first_name || null, last_name || null, company || null, nip || null,
          address || null, sap_id || null, phone || null, email || null, session.userId,
        ]
      );
      const client = result.rows[0];
      // Zapis klienta i synchronizacja kontaktu głównego do client_contacts razem
      // w jednej transakcji — patrz komentarz przy syncPrimaryContact.
      await syncPrimaryContact(
        db,
        client.id,
        { firstName: first_name || '', lastName: last_name || '', phone: phone || '', email: email || '' },
        session.userId
      );
      await db.query('COMMIT');
      return NextResponse.json({ client }, { status: 201 });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    console.error('Error creating client:', error);
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}

// PATCH - Edytuj klienta. Body: { id, ...pola }.
//
// Senior + admin (migracja 023), ale NIE symetrycznie: senior smie zmienić WYŁĄCZNIE
// payment_term_days (własny termin płatności klienta) — reszta danych (firma, NIP, adres,
// kontakt...) zostaje zastrzeżona dla admina, tak jak dotąd. Ograniczenie jest wymuszone
// tutaj, nie tylko ukryte w UI, bo to jest granica zaufania.
export async function PATCH(request: NextRequest) {
  const auth = await requireRole(['senior', 'admin']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  try {
    const b = await request.json();
    const { id } = b;
    if (!id) {
      return NextResponse.json({ error: 'Brak id klienta' }, { status: 400 });
    }

    const adminOnlyFields = ['first_name', 'last_name', 'company', 'nip', 'address', 'sap_id', 'phone', 'email'];
    if (session.role === 'senior' && adminOnlyFields.some((f) => b[f] !== undefined)) {
      return NextResponse.json(
        { error: 'Senior może zmienić wyłącznie termin płatności klienta' },
        { status: 403 }
      );
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (session.role === 'admin') {
      for (const f of adminOnlyFields) {
        if (b[f] !== undefined) {
          sets.push(`${f} = $${i++}`);
          values.push(b[f] || null);
        }
      }
    }

    // Termin płatności — jedyne pole dostępne obu rolom. Pusty string/null = wyczyść
    // nadpisanie (klient wraca do globalnego domyślnego z Ustawień). `b[f] || null` byłoby
    // tu błędem: 0 dni ("płatność natychmiastowa") to poprawna wartość, nie jej brak.
    if (b.payment_term_days !== undefined) {
      if (b.payment_term_days === null || b.payment_term_days === '') {
        sets.push(`payment_term_days = $${i++}`);
        values.push(null);
      } else {
        const parsed =
          typeof b.payment_term_days === 'string' ? parseFloat(b.payment_term_days) : b.payment_term_days;
        if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0 || parsed > 365) {
          return NextResponse.json(
            { error: 'Termin płatności: podaj liczbę dni 0-365 albo zostaw puste' },
            { status: 400 }
          );
        }
        sets.push(`payment_term_days = $${i++}`);
        values.push(Math.round(parsed));
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'Brak pól do zmiany' }, { status: 400 });
    }
    sets.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id);

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const result = await db.query(
        `UPDATE clients SET ${sets.join(', ')} WHERE id = $${i}
         RETURNING id, first_name, last_name, company, nip, address, sap_id, phone, email, payment_term_days, created_by, created_at, updated_at`,
        values
      );

      if (result.rows.length === 0) {
        await db.query('ROLLBACK');
        return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
      }

      const client = result.rows[0];
      // Synchronizacja bierze wartości PO UPDATE (RETURNING), nie tylko pola z tego
      // requestu — inaczej edycja samego telefonu zgubiłaby dopasowanie po imieniu
      // i nazwisku, które w tym PATCH mogły w ogóle nie zostać przesłane.
      await syncPrimaryContact(
        db,
        client.id,
        {
          firstName: client.first_name || '',
          lastName: client.last_name || '',
          phone: client.phone || '',
          email: client.email || '',
        },
        session.userId
      );
      await db.query('COMMIT');
      return NextResponse.json({ client });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    console.error('Error updating client:', error);
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
  }
}

// DELETE - Usuń klienta (?id=123). Powiązane oferty mają client_id ustawiony na NULL
// (FK ON DELETE SET NULL) i zachowują swoje historyczne kolumny client_*.
export async function DELETE(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const id = parseInt(request.nextUrl.searchParams.get('id') || '');
    if (!id) {
      return NextResponse.json({ error: 'Brak id klienta' }, { status: 400 });
    }

    const result = await pool.query('DELETE FROM clients WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting client:', error);
    return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
  }
}
