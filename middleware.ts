import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, validateSessionToken } from '@/lib/auth/session';

/**
 * Shared Next.js middleware enforcing session validity (401) exactly once,
 * covering every route under /records and /api/records — see PRD 7.1.
 * Runs in the Node.js runtime because it queries Prisma.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/records') || pathname.startsWith('/api/records')) {
    // Explicit test seam to force 401 without a real request lifecycle.
    const isUnauthenticated = request.headers.get('x-unauthenticated') === 'true';

    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (isUnauthenticated || !token) {
      return deny(request);
    }

    // Server-side DB verification — never trust a cookie value alone.
    const session = await validateSessionToken(token);
    if (!session) {
      return deny(request);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-current-user-id', session.userId);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

function deny(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/records', '/records/:path*', '/api/records', '/api/records/:path*'],
  runtime: 'nodejs',
};