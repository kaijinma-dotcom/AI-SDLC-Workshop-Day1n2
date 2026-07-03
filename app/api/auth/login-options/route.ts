// app/api/auth/login-options/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';

const RP_ID = process.env.RP_ID ?? 'localhost';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const username = (body?.username ?? '').trim();

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const user = userDB.getByUsername(username);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const authenticators = authenticatorDB.getByUserId(user.id);
  if (authenticators.length === 0) {
    return NextResponse.json(
      { error: 'No credentials registered for this user' },
      { status: 400 }
    );
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: authenticators.map((auth) => ({
      id: auth.credential_id,
      transports: (auth.transports?.split(',') as AuthenticatorTransport[]) ?? [],
    })),
    userVerification: 'preferred',
  });

  const response = NextResponse.json({ options, userId: user.id });
  response.cookies.set('webauthn_challenge', options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  });
  return response;
}
