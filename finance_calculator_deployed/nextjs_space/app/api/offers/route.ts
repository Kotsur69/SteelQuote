import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { escapeLikePattern } from '@/lib/search';
import { upsertClientFromOffer } from '@/lib/clientDirectory';
import { normalizeClientInfo } from '@/lib/pdfGenerator';

const OFFER_COLUMNS = `o.id, o.offer_name, o.display_name, o.offer_data, o.status, o.user_id,
  o.created_at, o.updated_at, o.reviewed_by, o.reviewed_at, o.rejection_reason, o.sent_at,
  o.root_offer_id, o.version_number,
  u.full_name AS owner_name, u.email AS owner_email`;

// Wyszukiwarka: jedno pole `q` przeszukuje nazwę własną handlowca, nazwę zastępczą
// ("offer_30") ORAZ surowe ID. display_name jest kolumną generowaną, więc pokrywa dwa
// pierwsze przypadki jednym ILIKE. o.id::text (a nie o.id = $n) pozwala porównać ID z
// dowolnym tekstem bez wywalania zapytania na niepoprawnej liczbie.
const SEARCH_CLAUSE = `(o.display_name ILIKE '%' || $2 || '%' OR o.id::text = $2)`;

// GET offers widoczne dla bieżącego użytkownika:
//   junior  -> tylko własne
//   senior  -> własne + wszystkie cudze w pending_review (do recenzji)
//   admin   -> tylko własne (admin nie tworzy ofert; przegląd całości jest w /api/admin/offers)
// Zwraca też rolę bieżącego użytkownika, żeby front nie musiał osobno pytać /api/auth/me.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const visibility =
      session.role === 'senior'
        ? `(o.user_id = $1 OR o.status = 'pending_review')`
        : `o.user_id = $1`;

    // Fraza jest zawsze parametrem ($2) - nigdy nie wkleja sie jej do SQL-a.
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    const params: unknown[] = [session.userId];
    let where = visibility;
    if (q) {
      params.push(escapeLikePattern(q));
      where = `${visibility} AND ${SEARCH_CLAUSE}`;
    }

    const result = await pool.query(
      `SELECT ${OFFER_COLUMNS}
       FROM offers o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE ${where}
       ORDER BY o.created_at DESC`,
      params
    );

    return NextResponse.json({ offers: result.rows, role: session.role, userId: session.userId });
  } catch (error) {
    console.error('Error fetching offers:', error);
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}

// POST - Create new offer (junior i senior; admin nie tworzy ofert).
// Nowa oferta startuje w statusie 'draft' (DEFAULT w bazie).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { offer_name, offer_data } = await request.json();

    // Nazwa jest opcjonalna. Pusta => zapisujemy NULL, a baza (kolumna generowana
    // display_name) sama nada "offer_<ID>" w tym samym INSERCIE.
    if (!offer_data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const name = typeof offer_name === 'string' && offer_name.trim() ? offer_name.trim() : null;

    // Dane klienta z oferty trafiają też do katalogu `clients`, żeby wyszukiwarka
    // firmy/NIP-u w kalkulatorze uczyła się nowych klientów (patrz lib/clientDirectory.ts).
    // Klient i oferta zapisują się w JEDNEJ transakcji — nieudany INSERT oferty nie ma
    // zostawiać w katalogu firmy bez ani jednej oferty.
    const clientInfo = normalizeClientInfo((offer_data as Record<string, unknown>).clientInfo);

    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      const clientId = await upsertClientFromOffer(db, clientInfo, session.userId);

      const result = await db.query(
        `INSERT INTO offers (user_id, offer_name, offer_data, client_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, offer_name, display_name, offer_data, status, created_at, updated_at`,
        [session.userId, name, JSON.stringify(offer_data), clientId]
      );

      await db.query('COMMIT');
      return NextResponse.json({ offer: result.rows[0] }, { status: 201 });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    console.error('Error creating offer:', error);
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 });
  }
}
