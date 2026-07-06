import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const { pathname } = request.nextUrl;

  // Protected routes
  if (pathname.startsWith('/calculator') || pathname.startsWith('/offers')) {
    if (!token) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'default-secret');
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Redirect logged in users from login page to calculator
  if (pathname === '/' && token) {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'default-secret');
      await jwtVerify(token, secret);
      return NextResponse.redirect(new URL('/calculator', request.url));
    } catch {
      // Token invalid, continue to login page
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/calculator/:path*', '/offers/:path*'],
};
