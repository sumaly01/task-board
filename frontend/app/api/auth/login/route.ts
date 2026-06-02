import { NextRequest, NextResponse } from 'next/server';

// Why this route exists instead of calling the gateway directly from the browser:
// The browser can only set httpOnly cookies via a Set-Cookie response header from the server.
// If the client called POST /auth/login on the gateway directly, the gateway would return
// { accessToken, refreshToken } in the body — the client could only store that in localStorage,
// which is readable by any JavaScript and vulnerable to XSS.
// By routing through here, this server-side handler gets the token and sets it as an httpOnly
// cookie, which the browser stores and sends automatically but JavaScript can never read.
export async function POST(request: NextRequest) {
  const body = await request.json();

  const gatewayRes = await fetch(`${process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await gatewayRes.json();

  if (!gatewayRes.ok) {
    return NextResponse.json(data, { status: gatewayRes.status });
  }

  const { accessToken, refreshToken } = data as { accessToken: string; refreshToken: string };

  // JWT payload is base64url encoded JSON — not encrypted, just signed.
  // Any party can read it; the signature is what proves it wasn't tampered with.
  // We decode it server-side to extract userId for the client to use with Socket.io.
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()) as {
    userId: string;
    name: string;
    email: string;
    role: string;
  };

  const response = NextResponse.json({ userId: payload.userId, name: payload.name, email: payload.email, role: payload.role });

  // httpOnly: true means JavaScript in the browser cannot access this cookie at all.
  // The browser attaches it to every same-origin request automatically.
  response.cookies.set('token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 15, // 15 minutes — matches JWT expiry
    path: '/',
  });

  // Refresh token stored httpOnly — used by middleware to silently re-issue
  // an access token when it expires, so the user stays logged in for 7 days.
  response.cookies.set('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days — matches JWT refresh token expiry
    path: '/',
  });

  // userId and role are not secrets — they are public claims in the JWT payload.
  // We store them as readable cookies so client components can access them for:
  //   userId → Socket.io register event
  //   role   → useRole() hook to drive conditional rendering (ADMIN vs MEMBER UI)
  // httpOnly: false is intentional — these are identity hints, not auth credentials.
  response.cookies.set('userId', payload.userId, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  response.cookies.set('userName', payload.name, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  response.cookies.set('role', payload.role, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return response;
}
