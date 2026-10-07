import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { JWT_SECRET_BYTES as secret } from './lib/jwtSecret';

// Methods that change state. Cookies are SameSite=Lax; on top of that a state-changing API
// call must come from this origin (CSRF defence in depth).
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function crossOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false; // same-origin fetches from older browsers / server-to-server
  try {
    return new URL(origin).host !== request.headers.get('host');
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    if (MUTATING.has(request.method) && crossOrigin(request)) {
      return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Admin panel - superuser only. The edge runtime has no database, so this reads the `su`
  // hint from the token; every /api/admin route re-checks users.is_superuser fresh.
  if (pathname.startsWith('/admin')) {
    if (!token) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.su !== true) {
        return NextResponse.redirect(new URL('/calculator', request.url));
      }
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Protected routes - any signed-in user. WHAT they see is decided server-side from their
  // flow memberships (lib/access): the review panel (/senior) lists only offers awaiting the
  // user's own level, analytics and offer lists apply the visibility matrix.
  if (
    pathname.startsWith('/senior') ||
    pathname.startsWith('/calculator') ||
    pathname.startsWith('/offers') ||
    pathname.startsWith('/analytics')
  ) {
    if (!token) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    try {
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Redirect logged in users from login page to calculator
  if (pathname === '/' && token) {
    try {
      await jwtVerify(token, secret);
      return NextResponse.redirect(new URL('/calculator', request.url));
    } catch {
      // Token invalid, continue to login page
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/calculator/:path*',
    '/offers/:path*',
    '/analytics/:path*',
    '/senior/:path*',
    '/admin/:path*',
    '/api/:path*',
  ],
};
