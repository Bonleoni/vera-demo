import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || 'admin';
  const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || 'vera2026';

  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    const authValue = authHeader.replace('Basic ', '');
    const [user, pass] = Buffer.from(authValue, 'base64')
      .toString('utf-8')
      .split(':');

    if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="VERA Demo Access"',
    },
  });
}

export const config = {
  matcher: '/:path*',
};
