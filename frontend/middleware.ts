import { NextRequest, NextResponse } from 'next/server';

// Edge runtime does not have Node.js Buffer — use atob for base64url decoding instead.
// JWT payload is base64url encoded (- instead of +, _ instead of /).
function decodeJwtPayload(token: string): { userId: string } {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64)) as { userId: string };
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

// How Next.js middleware intercepts requests:
// The Edge runtime executes this function BEFORE any page or API route runs.
// When a URL matches the `config.matcher`, Next.js invokes middleware first.
// It checks the cookie and either:
//   - Calls NextResponse.next()       → the request continues normally to the page
//   - Calls NextResponse.redirect()   → the request is redirected with no page code executing
//
// Silent refresh flow:
//   access token gone + refresh token present → call gateway → set new cookies → continue
//   This means the user stays logged in for up to 7 days (the refresh token TTL)
//   without ever seeing the login page, even though the access token only lasts 15 minutes.
export async function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const refreshToken = request.cookies.get('refreshToken')?.value;
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');

  // Access token present — fast path, no network call needed
  if (token) {
    if (isAuthPage) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // No access token. Try a silent refresh if the refresh token is still valid.
  if (refreshToken && !isAuthPage) {
    try {
      const gatewayUrl = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL;
      const refreshRes = await fetch(`${gatewayUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (refreshRes.ok) {
        const { accessToken, refreshToken: newRefreshToken } = await refreshRes.json() as {
          accessToken: string;
          refreshToken: string;
        };

        const { userId } = decodeJwtPayload(accessToken);

        // Allow the original request to proceed and attach the fresh cookies.
        // The page will render normally — the user never sees the login redirect.
        const response = NextResponse.next();
        response.cookies.set('token', accessToken, { ...COOKIE_OPTS, maxAge: 60 * 15 });
        response.cookies.set('refreshToken', newRefreshToken, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 });
        response.cookies.set('userId', userId, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        });
        return response;
      }
    } catch {
      // Gateway unreachable — fall through to login redirect
    }
  }

  // No valid tokens at all → redirect to login
  if (!isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Exclude Next.js internals, API routes, and static files from middleware.
  // API routes handle their own auth; static assets don't need protection.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
