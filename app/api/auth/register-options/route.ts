// app/api/auth/register-options/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';

const RP_NAME = 'Todo App';
const RP_ID = process.env.RP_ID ?? 'localhost';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const username = (body?.username ?? '').trim();

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  // Get or create user
  let user = userDB.getByUsername(username);
  if (!user) {
    user = userDB.create(username);
  }

  // Get existing authenticators to exclude
  const existingAuthenticators = authenticatorDB.getByUserId(user.id);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(String(user.id)),
    userName: user.username,
    attestationType: 'none',
    excludeCredentials: existingAuthenticators.map((auth) => ({
      id: auth.credential_id,
      transports: (auth.transports?.split(',') as AuthenticatorTransport[]) ?? [],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // Store challenge in a temporary cookie for verification
  const response = NextResponse.json({ options, userId: user.id });
  response.cookies.set('webauthn_challenge', options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300, // 5 minutes
    path: '/',
  });
  return response;
}
