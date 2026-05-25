import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(_request: NextRequest) {
  const token = cookies().get('token')?.value;

  // Best-effort call to the gateway to blacklist the jti in Redis.
  // If the gateway is unreachable we still clear the cookies — the user
  // is logged out on the client regardless, and the token will expire naturally.
  if (token) {
    try {
      await fetch(`${process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // non-fatal — proceed with cookie cleanup
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('token');
  response.cookies.delete('refreshToken');
  response.cookies.delete('userId');
  return response;
}
