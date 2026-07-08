import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { MIN_PASSWORD_LENGTH } from '@/lib/passwordPolicy';

const VALID_ROLES = ['junior', 'senior', 'admin'];

// GET - Lista wszystkich kont + liczba ofert per handlowiec (agregat po statusie).
export async function GET() {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.created_at,
              COUNT(o.id)::int AS offers_total,
              COUNT(o.id) FILTER (WHERE o.status = 'pending_review')::int AS offers_pending,
              COUNT(o.id) FILTER (WHERE o.status = 'sent')::int AS offers_sent
       FROM users u
       LEFT JOIN offers o ON o.user_id = u.id
       GROUP BY u.id
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
