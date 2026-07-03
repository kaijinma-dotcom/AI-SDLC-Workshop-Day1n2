// app/api/auth/register-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession } from '@/lib/auth';

const RP_ID = process.env.RP_ID ?? 'localhost';
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { credential, userId } = body;

  if (!credential || !userId) {
    return NextResponse.json({ error: 'Missing credential or userId' }, { status: 400 });
  }

  // Retrieve stored challenge from cookie
  const challenge = request.cookies.get('webauthn_challenge')?.value;
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge expired or missing' }, { status: 400 });
  }

  const user = userDB.getById(Number(userId));
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Registration not verified' }, { status: 400 });
  }

  const { credential: cred } = verification.registrationInfo;

  // cred.id is already a base64url string; cred.publicKey is a Uint8Array
  authenticatorDB.create({
    user_id: user.id,
    credential_id: cred.id,
    credential_public_key: isoBase64URL.fromBuffer(cred.publicKey),
    counter: cred.counter ?? 0,
    transports: credential.response?.transports?.join(',') ?? null,
  });

  await createSession({ userId: user.id, username: user.username });

  const response = NextResponse.json({ verified: true });
  // Clear challenge cookie
  response.cookies.delete('webauthn_challenge');
  return response;
}
