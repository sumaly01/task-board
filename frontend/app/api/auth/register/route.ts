import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const gatewayRes = await fetch(`${process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await gatewayRes.json();
  return NextResponse.json(data, { status: gatewayRes.status });
}
