/**
 * Password-protects the moderator area with HTTP Basic auth (the browser shows its own sign-in box).
 * Covers the /mod pages AND /api/mod, the route that forwards moderator actions with the
 * server-side moderator key: protecting only the pages would leave those actions open.
 *
 * Credentials come from MOD_USERNAME / MOD_PASSWORD (runtime env, never committed).
 * Without MOD_PASSWORD: open in development, locked in production (fail closed).
 * Next 16 calls this file proxy.ts (formerly middleware.ts).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function credentialsMatch(header: string | null, user: string, password: string): boolean {
  if (!header?.startsWith('Basic ')) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const colon = decoded.indexOf(':'); // The password itself may contain ':'
  if (colon < 0) return false;
  return safeEqual(decoded.slice(0, colon), user) && safeEqual(decoded.slice(colon + 1), password);
}

/** Compares without stopping at the first different character, so timing reveals less. */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const password = process.env.MOD_PASSWORD ?? '';
  const user = process.env.MOD_USERNAME || 'acaps';

  if (!password) {
    if (process.env.NODE_ENV !== 'production') return NextResponse.next();
    return new NextResponse('Moderator area is locked: MOD_PASSWORD is not set on the server.', { status: 503 });
  }
  if (credentialsMatch(request.headers.get('authorization'), user, password)) {
    return NextResponse.next();
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ACAPS moderator", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/mod', '/mod/:path*', '/api/mod/:path*'],
};
