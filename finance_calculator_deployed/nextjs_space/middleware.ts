import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { JWT_SECRET_BYTES as secret } from './lib/jwtSecret';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const { pathname } = request.nextUrl;

  // Panel seniora — tylko rola 'senior'.
  if (pathname.startsWith('/senior')) {
    if (!token) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.role !== 'senior') {
        return NextResponse.redirect(new URL('/calculator', request.url));
      }
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Panel admina — tylko rola 'admin'.
  if (pathname.startsWith('/admin')) {
    if (!token) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.role !== 'admin') {
        return NextResponse.redirect(new URL('/calculator', request.url));
      }
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Protected routes
  if (pathname.startsWith('/calculator') || pathname.startsWith('/offers')) {
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
  matcher: ['/', '/calculator/:path*', '/offers/:path*', '/senior/:path*', '/admin/:path*'],
};
