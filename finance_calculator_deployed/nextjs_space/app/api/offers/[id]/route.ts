import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { upsertClientFromOffer } from '@/lib/clientDirectory';
import { normalizeClientInfo } from '@/lib/pdfGenerator';
import { DEFAULT_SETTINGS, settingsRowToAppSettings } from '@/lib/currency';
import { offerNeedsReview, type ReviewableItem } from '@/lib/offerReview';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Porownanie bez wzgledu na kolejnosc kluczy - offer_data wraca z Postgresa (jsonb) jako
// zwykly obiekt JS, ale JSONB nie gwarantuje tej samej kolejnosci kluczy co przy zapisie,
// wiec JSON.stringify(a) === JSON.stringify(b) daloby falszywe "zmienione" przy identycznych
// danych.
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((k) => Object.prototype.hasOwnProperty.call(bObj, k) && deepEqual(aObj[k], bObj[k]))
  );
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
              o.rejection_reason, o.sent_at, o.root_offer_id, o.version_number,
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
//
// Wersjonowanie: gdy przesłane dane (nazwa lub offer_data) RÓŻNIĄ się od tego, co jest
// w bazie, zapis NIE nadpisuje wiersza w miejscu — wstawia nowy wiersz-wersję
// (root_offer_id/version_number), a oryginał zostaje nietknięty i nadal widoczny na
// liście ofert. Zapis bez żadnej zmiany (np. samo ponowne kliknięcie "Zapisz") dalej
// robi zwykły UPDATE, żeby nie mnożyć identycznych wersji.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireRole(['junior', 'senior', 'admin']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const offerId = parseInt(id);
    const { offer_name, offer_data } = await request.json();

    // Nazwa opcjonalna - wyczyszczenie jej przywraca nazwę zastępczą "offer_<ID>"
    // (display_name to kolumna generowana, przelicza się sama przy UPDATE/INSERT).
    if (!offer_data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const name = typeof offer_name === 'string' && offer_name.trim() ? offer_name.trim() : null;

    // Admin edytuje KAŻDĄ ofertę w dowolnym statusie. Senior tylko cudzą w pending_review
    // (poprawka przed zatwierdzeniem). Oferta 'sent' zostaje read-only dla WSZYSTKICH,
    // łącznie z adminem — to, co poszło do klienta, musi zostać w historii bez zmian.
    const isAdmin = session.role === 'admin';
    const isSenior = session.role === 'senior';

    // Jak w POST /api/offers: dane klienta lądują też w katalogu `clients`, w tej
    // samej transakcji co zapis oferty.
    const clientInfo = normalizeClientInfo((offer_data as Record<string, unknown>).clientInfo);

    const db = await pool.connect();
    let result;
    let notFoundReason: 'sent' | 'missing' | null = null;
    try {
      await db.query('BEGIN');

      // Wiersz blokujemy od razu (FOR UPDATE) — te same dane czytamy niżej do
      // porównania i do wyliczenia numeru kolejnej wersji, więc nie chcemy, żeby
      // równoległy zapis tej samej oferty wsunął się między odczyt a insert.
      const existingResult = await db.query(
        `SELECT id, user_id, status, offer_name, offer_data, root_offer_id, version_number
         FROM offers WHERE id = $1
         AND (user_id = $2 OR $3 OR ($4 AND status = 'pending_review'))
         FOR UPDATE`,
        [offerId, session.userId, isAdmin, isSenior]
      );

      if (existingResult.rows.length === 0) {
        await db.query('ROLLBACK');
        const check = await pool.query(`SELECT status FROM offers WHERE id = $1`, [offerId]);
        notFoundReason = check.rows.length > 0 && check.rows[0].status === 'sent' ? 'sent' : 'missing';
      } else {
        const existing = existingResult.rows[0];

        if (existing.status === 'sent') {
          await db.query('ROLLBACK');
          notFoundReason = 'sent';
        } else {
          const clientId = await upsertClientFromOffer(db, clientInfo, session.userId);
          const unchanged = existing.offer_name === name && deepEqual(existing.offer_data, offer_data);

          if (unchanged) {
            result = await db.query(
              `UPDATE offers
               SET offer_name = $1, offer_data = $2, client_id = $3, updated_at = CURRENT_TIMESTAMP
               WHERE id = $4
               RETURNING id, offer_name, display_name, offer_data, status, created_at, updated_at,
                         root_offer_id, version_number`,
              [name, JSON.stringify(offer_data), clientId, offerId]
            );
          } else {
            // Korzen rodziny: jesli edytowany wiersz to juz wersja, korzeniem zostaje
            // jego wlasny root_offer_id (nie tworzymy lancucha korzeni).
            const rootId = existing.root_offer_id ?? existing.id;
            // Postgres nie pozwala łączyć FOR UPDATE z funkcją agregującą (MAX) —
            // blokujemy więc same wiersze rodziny, a maksimum liczymy w JS.
            const versionResult = await db.query(
              `SELECT version_number FROM offers WHERE id = $1 OR root_offer_id = $1 FOR UPDATE`,
              [rootId]
            );
            const nextVersion =
              Math.max(0, ...versionResult.rows.map((r) => Number(r.version_number))) + 1;

            // Wlasciciel i status wersji = wlasciciel i status edytowanego wiersza,
            // NIE sesji zapisujacej - senior poprawiajacy cudza pending_review ofere
            // nie ma "przejmowac" jej na siebie, a nowa wersja ma trafic do dalszego
            // etapu tego samego obiegu (recenzja), nie wracac do szkicu.
            //
            // Wyjatek: jesli edytowany wiersz byl JUZ zatwierdzony (approved), a nowe
            // dane znow wymagaja zatwierdzenia (patrz lib/offerReview.ts), zatwierdzenie
            // przestaje byc aktualne - nowa wersja wraca do pending_review zamiast
            // dziedziczyc "approved" po danych, ktore juz nie obowiazuja.
            let versionStatus = existing.status;
            if (existing.status === 'approved') {
              const settingsResult = await db.query(
                `SELECT eur_pln_rate, pgl_base_hrs, pgl_base_cr, pgl_base_hdg, transport_base, min_margin_pct
                 FROM app_settings WHERE id = 1`
              );
              const settings = settingsResult.rows.length > 0
                ? settingsRowToAppSettings(settingsResult.rows[0])
                : DEFAULT_SETTINGS;
              if (offerNeedsReview((offer_data as { zestawienie?: ReviewableItem[] })?.zestawienie, settings)) {
                versionStatus = 'pending_review';
              }
            }

            result = await db.query(
              `INSERT INTO offers (user_id, offer_name, offer_data, client_id, status, root_offer_id, version_number)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id, offer_name, display_name, offer_data, status, created_at, updated_at,
                         root_offer_id, version_number`,
              [existing.user_id, name, JSON.stringify(offer_data), clientId, versionStatus, rootId, nextVersion]
            );
          }

          await db.query('COMMIT');
        }
      }
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }

    if (notFoundReason === 'sent') {
      return NextResponse.json(
        { error: 'Oferta została wysłana do klienta i jest tylko do odczytu' },
        { status: 409 }
      );
    }
    if (notFoundReason === 'missing' || !result) {
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
