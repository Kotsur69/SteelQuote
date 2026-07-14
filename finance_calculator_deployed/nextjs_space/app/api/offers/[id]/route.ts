import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET single offer.
// Właściciel widzi swoją zawsze. Senior może dodatkowo otworzyć cudzą ofertę w
// pending_review (żeby ją zrecenzować / edytować / wygenerować PDF). Admin przegląda przez /api/admin.
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = parseInt(id);

    // Admin otwiera KAŻDĄ ofertę, niezależnie od statusu (nadzór nad całością).
    // Senior tylko cudzą oczekującą na recenzję. Właściciel zawsze swoją.
    const isAdmin = session.role === 'admin';
    const isSenior = session.role === 'senior';
    const result = await pool.query(
      `SELECT o.id, o.offer_name, o.display_name, o.offer_data, o.status, o.user_id,
              o.created_at, o.updated_at, o.reviewed_by, o.reviewed_at,
              o.rejection_reason, o.sent_at,
              u.full_name AS owner_name, u.email AS owner_email
       FROM offers o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = $1
         AND (o.user_id = $2 OR $3 OR ($4 AND o.status = 'pending_review'))`,
      [offerId, session.userId, isAdmin, isSenior]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    return NextResponse.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error fetching offer:', error);
    return NextResponse.json({ error: 'Failed to fetch offer' }, { status: 500 });
  }
}

// PUT - Update offer.
// Właściciel może edytować własną (nie sent).
// Senior może też edytować cudzą ofertę w pending_review (poprawka przed zatwierdzeniem).
// Oferta w statusie 'sent' jest read-only.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = parseInt(id);
    const { offer_name, offer_data } = await request.json();

    // Nazwa opcjonalna - wyczyszczenie jej przywraca nazwę zastępczą "offer_<ID>"
    // (display_name to kolumna generowana, przelicza się sama przy UPDATE).
    if (!offer_data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const name = typeof offer_name === 'string' && offer_name.trim() ? offer_name.trim() : null;

    // Admin edytuje KAŻDĄ ofertę w dowolnym statusie. Senior tylko cudzą w pending_review
    // (poprawka przed zatwierdzeniem). Oferta 'sent' zostaje read-only dla WSZYSTKICH,
    // łącznie z adminem — to, co poszło do klienta, musi zostać w historii bez zmian.
    const isAdmin = session.role === 'admin';
    const isSenior = session.role === 'senior';
    const result = await pool.query(
      `UPDATE offers
       SET offer_name = $1, offer_data = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND status <> 'sent'
         AND (user_id = $4 OR $5 OR ($6 AND status = 'pending_review'))
       RETURNING id, offer_name, display_name, offer_data, status, created_at, updated_at`,
      [name, JSON.stringify(offer_data), offerId, session.userId, isAdmin, isSenior]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query(
        `SELECT status FROM offers WHERE id = $1`,
        [offerId]
      );
      if (existing.rows.length > 0 && existing.rows[0].status === 'sent') {
        return NextResponse.json(
          { error: 'Oferta została wysłana do klienta i jest tylko do odczytu' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    return NextResponse.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error updating offer:', error);
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 });
  }
}

// DELETE - Delete offer (tylko właściciel, junior/senior).
// Oferty wysłane ('sent') są read-only i nie podlegają usunięciu — zachowujemy historię.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = parseInt(id);

    const result = await pool.query(
      `DELETE FROM offers WHERE id = $1 AND user_id = $2 AND status <> 'sent' RETURNING id`,
      [offerId, session.userId]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query(
        `SELECT status FROM offers WHERE id = $1 AND user_id = $2`,
        [offerId, session.userId]
      );
      if (existing.rows.length > 0 && existing.rows[0].status === 'sent') {
        return NextResponse.json(
          { error: 'Oferta wysłana do klienta nie może zostać usunięta' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting offer:', error);
    return NextResponse.json({ error: 'Failed to delete offer' }, { status: 500 });
  }
}
