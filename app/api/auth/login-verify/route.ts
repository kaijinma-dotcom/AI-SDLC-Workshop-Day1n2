// app/api/auth/login-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
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

  const challenge = request.cookies.get('webauthn_challenge')?.value;
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge expired or missing' }, { status: 400 });
  }

  const user = userDB.getById(Number(userId));
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const authenticator = authenticatorDB.getByCredentialId(credential.id);
  if (!authenticator || authenticator.user_id !== user.id) {
    return NextResponse.json({ error: 'Authenticator not found' }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: authenticator.credential_id,
        publicKey: isoBase64URL.toBuffer(authenticator.credential_public_key),
        counter: authenticator.counter ?? 0,
        transports: (authenticator.transports?.split(',') as AuthenticatorTransport[]) ?? [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Authentication not verified' }, { status: 400 });
  }

  // Update counter to prevent replay attacks
  authenticatorDB.updateCounter(
    authenticator.credential_id,
    verification.authenticationInfo.newCounter ?? 0
  );

  await createSession({ userId: user.id, username: user.username });

  const response = NextResponse.json({ verified: true });
  response.cookies.delete('webauthn_challenge');
  return response;
}
