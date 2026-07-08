export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { requireRole } from '@/lib/rbac';
import { MIN_PASSWORD_LENGTH } from '@/lib/passwordPolicy';

export async function POST(req: Request) {
  try {
    // BEZPIECZENSTWO: rejestracja NIE jest publiczna. Konta zakladaja wylacznie
    // administratorzy (przez panel admina albo ten endpoint). Bez tego kazdy moglby
    // samodzielnie utworzyc konto na publicznym adresie aplikacji.
    const auth = await requireRole(['admin']);
    if ('error' in auth) return auth.error;

    const body = await req?.json?.();
    const { email, password, name } = body ?? {};
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
    }
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }
    const hashed = await bcrypt.hash(password, 10);
    const fullName = name ?? email?.split?.('@')?.[0] ?? 'User';
    const result = await pool.query(
      `INSERT INTO users (email, password, full_name, role, is_active)
       VALUES ($1, $2, $3, 'junior', true)
       RETURNING id, email, full_name`,
      [email, hashed, fullName]
    );
    const user = result.rows[0];
    return NextResponse.json({ id: user.id, email: user.email, name: user.full_name });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
  }
}
