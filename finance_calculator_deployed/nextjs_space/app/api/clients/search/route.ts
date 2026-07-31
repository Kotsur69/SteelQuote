import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { escapeLikePattern } from '@/lib/search';

// Podpowiedzi klientów pod pola "Firma" i "NIP" w kalkulatorze.
//
// Osobna trasa od /api/admin/clients, bo tamta jest requireRole(['admin']) i zwraca
// CAŁY katalog z agregatem liczby ofert. Ofertę wystawia junior i senior, a do
// podpowiedzi potrzeba kilku wierszy, nie całej tabeli.
//
// Tylko GET i tylko odczyt — dopisywaniem klientów zajmuje się zapis oferty
// (lib/clientDirectory.ts), nie ta trasa.

// Lista podpowiedzi ma się mieścić pod polem bez scrollowania.
const SUGGESTION_LIMIT = 8;

// Jednoznakowa fraza pasuje do połowy katalogu — podpowiedzi z niej są bezużyteczne,
// a lecą przy każdym naciśnięciu klawisza. Zaczynamy od dwóch znaków.
const MIN_QUERY_LENGTH = 2;

export async function GET(request: NextRequest) {
  const auth = await requireRole(['junior', 'senior', 'admin']);
  if ('error' in auth) return auth.error;

  try {
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    if (q.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ clients: [] });
    }

    // Fraza idzie parametrem ($1), nigdy przez sklejanie SQL-a.
    //
    // escapeLikePattern jest tu KONIECZNY, nie kosmetyczny: w ILIKE `_` znaczy
    // "dowolny jeden znak", a `%` "dowolny ciąg". Bez ucieczki wpisanie "SAP_42"
    // trafiłoby też w "SAP-42" i "SAPX42", czyli dokładnie w cudze SAP_ID, a "10%"
    // pasowałoby do wszystkiego z "10". Ten sam powód co przy wyszukiwarce ofert.
    const phrase = escapeLikePattern(q);

    // Jedna fraza przeszukuje firmę, NIP i SAP_ID naraz. Dzięki temu to samo pole
    // działa niezależnie od tego, czy handlowiec pamięta nazwę, NIP czy numer SAP —
    // a wpisanie NIP-u w polu "Firma" (częsty odruch) też coś znajdzie.
    //
    // Sortowanie: najpierw trafienia od POCZĄTKU nazwy firmy. Przy wpisaniu "sta"
    // "Stalexport" ma być nad "Huta Stalowa Wola" — inaczej podpowiedzi wyglądają
    // na losowe. NULLS LAST, bo company bywa puste w rekordach z backfillu 006.
    const result = await pool.query(
      `SELECT id, company, nip, address, sap_id
       FROM clients
       WHERE company ILIKE '%' || $1 || '%'
          OR nip     ILIKE '%' || $1 || '%'
          OR sap_id  ILIKE '%' || $1 || '%'
       ORDER BY (company ILIKE $1 || '%') DESC, company NULLS LAST, id
       LIMIT $2`,
      [phrase, SUGGESTION_LIMIT]
    );

    // Na front idzie camelCase i nigdy null — komponent wstawia te wartości prosto
    // do kontrolowanych inputów, a null przełączyłby input w tryb niekontrolowany.
    const clients = result.rows.map((row) => ({
      id: row.id as number,
      company: (row.company as string | null) ?? '',
      nip: (row.nip as string | null) ?? '',
      address: (row.address as string | null) ?? '',
      sapId: (row.sap_id as string | null) ?? '',
    }));

    return NextResponse.json({ clients });
  } catch (error) {
    console.error('Error searching clients:', error);
    return NextResponse.json({ error: 'Failed to search clients' }, { status: 500 });
  }
}
