import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { DEFAULT_SETTINGS, settingsRowToAppSettings } from '@/lib/currency';
import { offerNeedsReview } from '@/lib/offerReview';
import { normalizeClientInfo, hasRequiredCompanyDetails } from '@/lib/pdfGenerator';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Wyślij ofertę do klienta -> sent (staje się read-only).
// Senior: własna oferta w draft LUB approved (może wysłać bez weryfikacji) ORAZ
//   cudza oferta approved (np. ta, którą sam zrecenzował).
// Admin: dowolna oferta approved (admin nie posiada własnych ofert).
// Junior: własna oferta w approved (po zatwierdzeniu) ALBO w draft, jeśli oferta NIE
//   wymaga zatwierdzenia (patrz lib/offerReview.ts - każda pozycja ma marżę i PGL
//   bazowe w normie). W przeciwnym razie musi przejść przez submit -> pending_review
//   -> approve jak dotychczas.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = parseInt(id);

    // An offer can be saved without client data, but it must not leave the building without
    // it: company name + NIP are the minimum that identifies who the quote is for. Same rule
    // and same helper the calculator form uses to gate the contact section, and the clients
    // contacts route uses on write. Checked here for every role before the status-specific
    // UPDATE below; a missing row falls through and the existing 409 handles it.
    const guard = await pool.query(`SELECT offer_data FROM offers WHERE id = $1`, [offerId]);
    if (
      guard.rows.length > 0 &&
      !hasRequiredCompanyDetails(
        normalizeClientInfo((guard.rows[0].offer_data as Record<string, unknown> | null)?.clientInfo)
      )
    ) {
      return NextResponse.json(
        { error: 'Nie można wysłać oferty bez danych firmy klienta (nazwa firmy i NIP).' },
        { status: 422 }
      );
    }

    let result;
    if (session.role === 'admin') {
      // Admin: dowolna cudza oferta approved ORAZ własna draft/approved (jak senior).
      // Bez drugiego warunku admin nie mógł wysłać oferty, którą sam przed chwilą stworzył.
      result = await pool.query(
        `UPDATE offers
         SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND ((user_id = $2 AND status = ANY(ARRAY['draft','approved']::text[]))
                OR (user_id IS DISTINCT FROM $2 AND status = 'approved'))
         RETURNING id, status, sent_at`,
        [offerId, session.userId]
      );
    } else if (session.role === 'senior') {
      // Senior: własna oferta draft/approved, LUB cudza approved (zrecenzowana).
      result = await pool.query(
        `UPDATE offers
         SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND ((user_id = $2 AND status = ANY(ARRAY['draft','approved']::text[]))
                OR (user_id IS DISTINCT FROM $2 AND status = 'approved'))
         RETURNING id, status, sent_at`,
        [offerId, session.userId]
      );
    } else {
      // Junior: własna oferta approved, ZAWSZE ok. Własna oferta draft - ok TYLKO gdy
      // nie wymaga zatwierdzenia (przeliczane tu, na serwerze - klient jest tylko UX).
      const ownedResult = await pool.query(
        `SELECT id, status, offer_data FROM offers WHERE id = $1 AND user_id = $2`,
        [offerId, session.userId]
      );

      const owned = ownedResult.rows[0];
      let canSendDirect = owned?.status === 'approved';

      if (owned && !canSendDirect && owned.status === 'draft') {
        const settingsResult = await pool.query(
          `SELECT eur_pln_rate, pgl_base_hrs, pgl_base_cr, pgl_base_hdg, transport_base, min_margin_pct
           FROM app_settings WHERE id = 1`
        );
        const settings = settingsResult.rows.length > 0
          ? settingsRowToAppSettings(settingsResult.rows[0])
          : DEFAULT_SETTINGS;
        canSendDirect = !offerNeedsReview(owned.offer_data?.zestawienie, settings);
      }

      // status = $3 (a nie tylko id/user_id) domyka okno między odczytem a zapisem -
      // jeśli oferta zmieniła status w międzyczasie, decyzja canSendDirect powyżej jest
      // nieaktualna i UPDATE ma nic nie trafić, zamiast wysłać ofertę w nieznanym stanie.
      result = canSendDirect
        ? await pool.query(
            `UPDATE offers
             SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2 AND status = $3
             RETURNING id, status, sent_at`,
            [offerId, session.userId, owned.status]
          )
        : { rows: [] as { id: number; status: string; sent_at: string }[] };
    }

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Nie można wysłać tej oferty do klienta w obecnym statusie' },
        { status: 409 }
      );
    }

    return NextResponse.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error sending offer:', error);
    return NextResponse.json({ error: 'Failed to send offer' }, { status: 500 });
  }
}
