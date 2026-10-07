import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { JWT_SECRET_BYTES as secret } from './jwtSecret';

// The token only identifies the user. What they may do is read fresh from the database on
// every request (lib/access/context.ts). `su` (superuser) is a hint for middleware.ts, which
// runs on the edge without database access, to route /admin; every admin API route still
// re-checks users.is_superuser itself.
export interface SessionPayload {
  email: string;
  userId: number;
  su: boolean;
  [key: string]: unknown;
}

export async function createToken(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(secret);
  return token;
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return null;
  return await verifyToken(token);
}
