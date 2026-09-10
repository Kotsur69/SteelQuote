import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { MIN_PASSWORD_LENGTH } from '@/lib/passwordPolicy';

const VALID_ROLES = ['junior', 'senior', 'admin'];

// A single-level CASE that only casts JSONB text to numeric when it actually looks numeric
// (a JSON number or numeric string). Anything else - "", null, "n/a" - becomes SQL NULL and
// drops out of SUM(), so one bad line item in offer_data cannot abort the whole aggregate.
// The regex guard must wrap its own cast directly (not share an AND with it): Postgres does
// not promise to short-circuit AND before evaluating the cast.
const safeNum = (expr: string) =>
  `CASE WHEN (${expr}) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${expr})::numeric END`;

// GET - Lista wszystkich kont + metryki per handlowiec.
//
// Three separate per-user aggregates, joined one row each to `users`, so they never multiply
// together:
//   * workflow  - offer counts by internal status. Counts EVERY row incl. version rows
//                 (migration 015), unchanged from before so the "Liczba ofert" column stays
//                 exactly as it was.
//   * perf      - win/loss + tonnage + weighted margin. Built from `latest` (one row per
//                 offer family, newest version) - summing version rows would multi-count the
//                 tonnage. Tonnage and margin live inside offer_data.zestawienie[], so the
//                 JSONB array is unnested per offer first.
export async function GET() {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const result = await pool.query(
      `WITH latest AS (
         SELECT DISTINCT ON (COALESCE(o.root_offer_id, o.id))
                o.id, o.user_id, o.client_decision, o.created_at, o.offer_data
         FROM offers o
         ORDER BY COALESCE(o.root_offer_id, o.id), o.version_number DESC, o.id DESC
       ),
       items AS (
         SELECT l.id, l.user_id, l.client_decision, l.created_at,
                ${safeNum("it->>'tons'")}              AS tons_num,
                ${safeNum("it->'inputs'->>'marginPct'")} AS margin_num
         FROM latest l
         LEFT JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(l.offer_data->'zestawienie') = 'array'
                THEN l.offer_data->'zestawienie' ELSE '[]'::jsonb END
         ) AS it ON true
       ),
       per_offer AS (
         SELECT id, user_id, client_decision, created_at,
                COALESCE(SUM(tons_num), 0) AS tons,
                -- Tonnage-weighted margin: only line items that carry BOTH a margin and a
                -- positive tonnage contribute, matching lib/analyticsAggregate.ts.
                COALESCE(SUM(margin_num * tons_num)
                  FILTER (WHERE margin_num IS NOT NULL AND tons_num > 0), 0) AS margin_weighted,
                COALESCE(SUM(tons_num)
                  FILTER (WHERE margin_num IS NOT NULL AND tons_num > 0), 0) AS margin_tons
         FROM items
         GROUP BY id, user_id, client_decision, created_at
       ),
       perf AS (
         SELECT user_id,
                to_char(MIN(created_at), 'YYYY-MM-DD') AS first_quote_date,
                to_char(MAX(created_at), 'YYYY-MM-DD') AS last_quote_date,
                COUNT(*) FILTER (WHERE client_decision = 'won')::int  AS offers_won,
                COUNT(*) FILTER (WHERE client_decision = 'lost')::int AS offers_lost,
                COUNT(*) FILTER (WHERE client_decision = 'pending')::int AS offers_decision_pending,
                COALESCE(SUM(tons), 0)::float AS tons_offered,
                COALESCE(SUM(tons) FILTER (WHERE client_decision = 'won'), 0)::float  AS tons_won,
                COALESCE(SUM(tons) FILTER (WHERE client_decision = 'lost'), 0)::float AS tons_lost,
                COALESCE(SUM(tons) FILTER (WHERE client_decision = 'pending'), 0)::float AS tons_pending,
                CASE WHEN SUM(margin_tons) > 0
                     THEN (SUM(margin_weighted) / SUM(margin_tons))::float
                     ELSE NULL END AS avg_margin_pct
         FROM per_offer
         GROUP BY user_id
       ),
       workflow AS (
         SELECT user_id,
                COUNT(*)::int AS offers_total,
                COUNT(*) FILTER (WHERE status = 'pending_review')::int AS offers_pending,
                COUNT(*) FILTER (WHERE status = 'sent')::int AS offers_sent
         FROM offers
         GROUP BY user_id
       )
       SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.created_at,
              to_char(u.created_at, 'YYYY-MM-DD') AS account_created_date,
              COALESCE(w.offers_total, 0)   AS offers_total,
              COALESCE(w.offers_pending, 0) AS offers_pending,
              COALESCE(w.offers_sent, 0)    AS offers_sent,
              p.first_quote_date, p.last_quote_date,
              COALESCE(p.offers_won, 0)               AS offers_won,
              COALESCE(p.offers_lost, 0)              AS offers_lost,
              COALESCE(p.offers_decision_pending, 0)  AS offers_decision_pending,
              COALESCE(p.tons_offered, 0)  AS tons_offered,
              COALESCE(p.tons_won, 0)      AS tons_won,
              COALESCE(p.tons_lost, 0)     AS tons_lost,
              COALESCE(p.tons_pending, 0)  AS tons_pending,
              p.avg_margin_pct
       FROM users u
       LEFT JOIN workflow w ON w.user_id = u.id
       LEFT JOIN perf p ON p.user_id = u.id
       ORDER BY u.is_active DESC, u.role, u.email`
    );
    return NextResponse.json({ users: result.rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

// POST - Utwórz konto handlowca. Body: { email, password, full_name, role }.
export async function POST(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const { email, password, full_name, role } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email i hasło są wymagane' }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Hasło musi mieć min. ${MIN_PASSWORD_LENGTH} znaków` }, { status: 400 });
    }
    const userRole = role || 'junior';
    if (!VALID_ROLES.includes(userRole)) {
      return NextResponse.json({ error: 'Nieprawidłowa rola' }, { status: 400 });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Konto z tym e-mailem już istnieje' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, email, full_name, role, is_active, created_at`,
      [email, hashed, full_name || null, userRole]
    );

    return NextResponse.json({ user: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

// PATCH - Zmień konto. Body: { id, role?, is_active?, full_name?, password? }.
// Admin nie może zdegradować ani zdezaktywować własnego konta (ochrona przed lockoutem).
export async function PATCH(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  try {
    const { id, role, is_active, full_name, password } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'Brak id użytkownika' }, { status: 400 });
    }

    if (id === session.userId && (role !== undefined && role !== 'admin')) {
      return NextResponse.json(
        { error: 'Nie możesz zmienić własnej roli administratora' },
        { status: 400 }
      );
    }
    if (id === session.userId && is_active === false) {
      return NextResponse.json(
        { error: 'Nie możesz dezaktywować własnego konta' },
        { status: 400 }
      );
    }
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Nieprawidłowa rola' }, { status: 400 });
    }

    // Dynamiczny zestaw pól do aktualizacji.
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (role !== undefined) { sets.push(`role = $${i++}`); values.push(role); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); values.push(is_active); }
    if (full_name !== undefined) { sets.push(`full_name = $${i++}`); values.push(full_name || null); }
    if (password) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json({ error: `Hasło musi mieć min. ${MIN_PASSWORD_LENGTH} znaków` }, { status: 400 });
      }
      sets.push(`password = $${i++}`);
      values.push(await bcrypt.hash(password, 10));
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: 'Brak pól do zmiany' }, { status: 400 });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, email, full_name, role, is_active, created_at`,
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nie znaleziono użytkownika' }, { status: 404 });
    }
    return NextResponse.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// DELETE - "Usuń" konto = soft delete (is_active=false). ?id=123.
// Historia ofert zostaje. Admin nie może zdezaktywować samego siebie.
export async function DELETE(request: NextRequest) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  try {
    const id = parseInt(request.nextUrl.searchParams.get('id') || '');
    if (!id) {
      return NextResponse.json({ error: 'Brak id użytkownika' }, { status: 400 });
    }
    if (id === session.userId) {
      return NextResponse.json(
        { error: 'Nie możesz dezaktywować własnego konta' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE users SET is_active = false WHERE id = $1
       RETURNING id, email, full_name, role, is_active`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nie znaleziono użytkownika' }, { status: 404 });
    }
    return NextResponse.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error deactivating user:', error);
    return NextResponse.json({ error: 'Failed to deactivate user' }, { status: 500 });
  }
}
