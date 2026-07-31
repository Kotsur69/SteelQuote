import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { escapeLikePattern } from '@/lib/search';
import { findClientId } from '@/lib/clientDirectory';

// Podpowiedzi osób kontaktowych pod polem "Imię" w kalkulatorze.
//
// Kontakty są WSPÓLNE dla całego działu: osobę wpisaną raz przy ofercie ma zobaczyć
// każdy następny handlowiec tej samej firmy. Dlatego niczego tu nie filtrujemy po
// user_id — inaczej wróciłby stan sprzed migracji 010, gdzie kontakt istniał tylko
// w blobie jednej oferty i nie widział go nikt poza jej autorem.
//
// Tylko GET i tylko odczyt — kontakty dopisuje zapis oferty (lib/clientDirectory.ts).

// Firma ma kilka osób, nie kilkadziesiąt. Limit jest zabezpieczeniem przed rekordem
// patologicznym, a nie realnym ograniczeniem listy.
const SUGGESTION_LIMIT = 8;

export async function GET(request: NextRequest) {
  const auth = await requireRole(['junior', 'senior', 'admin']);
  if ('error' in auth) return auth.error;

  try {
    const params = request.nextUrl.searchParams;
    const company = (params.get('company') || '').trim();
    const nip = (params.get('nip') || '').trim();
    const q = (params.get('q') || '').trim();

    // Kontakt bez firmy nie ma sensu — nie wiadomo, czyją listę pokazać.
    if (company === '' && nip === '') {
      return NextResponse.json({ contacts: [] });
    }

    // TA SAMA reguła dopasowania co przy zapisie oferty (NIP, potem nazwa firmy).
    // Gdyby się rozjechały, handlowiec dostawałby podpowiedzi z jednego rekordu,
    // a zapis dokładał kontakt do drugiego.
    const clientId = await findClientId(pool, company, nip);
    if (clientId === null) {
      return NextResponse.json({ contacts: [] });
    }

    // BRAK progu długości frazy — inaczej niż w wyszukiwarce firm. Tam fraza przeszukuje
    // cały katalog i jeden znak pasuje do połowy bazy; tutaj lista jest z góry zawężona
    // do jednej firmy, a wymaganiem jest właśnie pokazanie osób OD RAZU po kliknięciu
    // w pole, bez pisania czegokolwiek.
    const values: unknown[] = [clientId];
    let filter = '';

    if (q !== '') {
      // escapeLikePattern z tego samego powodu co w wyszukiwarce firm: w ILIKE `_`
      // to dowolny znak, a `%` dowolny ciąg. Bez ucieczki "Kowalsk_" trafiałoby
      // w "Kowalska" i "Kowalski" naraz.
      values.push(escapeLikePattern(q));
      filter = `AND (
        first_name ILIKE '%' || $2 || '%'
        OR last_name ILIKE '%' || $2 || '%'
        OR email     ILIKE '%' || $2 || '%'
      )`;
    }

    values.push(SUGGESTION_LIMIT);
    const limitPlaceholder = `$${values.length}`;

    const result = await pool.query(
      `SELECT id, first_name, last_name, phone, email
       FROM client_contacts
       WHERE client_id = $1
       ${filter}
       ORDER BY last_name NULLS LAST, first_name NULLS LAST, id
       LIMIT ${limitPlaceholder}`,
      values
    );

    // camelCase i nigdy null — te wartości lądują prosto w kontrolowanych inputach.
    const contacts = result.rows.map((row) => ({
      id: row.id as number,
      firstName: (row.first_name as string | null) ?? '',
      lastName: (row.last_name as string | null) ?? '',
      phone: (row.phone as string | null) ?? '',
      email: (row.email as string | null) ?? '',
    }));

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error('Error searching client contacts:', error);
    return NextResponse.json({ error: 'Failed to search contacts' }, { status: 500 });
  }
}
