# PRP 11 - WebAuthn/Passkeys Authentication

## Feature Overview

Passwordless authentication using WebAuthn/Passkeys. Users register with a username and their device's biometric authenticator (fingerprint, Face ID) or a security key. Sessions are managed as HTTP-only JWT cookies with a 7-day expiry. The middleware protects `/` and `/calendar` routes. No passwords are ever stored.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Register with a username and biometric | I can create an account without a password |
| US-02 | User | Log in with my passkey | I can access my todos securely |
| US-03 | User | Stay logged in for 7 days | I don't have to re-authenticate constantly |
| US-04 | User | Log out | I can end my session on shared devices |
| US-05 | Dev | Have all authenticated routes protected | Unauthenticated users cannot access todos |

---

## User Flow

### Registration
1. User visits `/login`
2. Enters desired username in text input
3. Clicks **"Register"** button
4. Browser prompts for biometric/security key interaction
5. On success: JWT session cookie set; redirected to `/`
6. On failure: error message shown

### Login
1. User visits `/login` (or is redirected there)
2. Enters their username
3. Clicks **"Login"** button
4. Browser prompts for biometric/security key interaction
5. On success: JWT session cookie set; redirected to `/`
6. On failure: error message shown (wrong user / auth failed)

### Logout
1. User clicks **"Logout"** button (top-right corner)
2. Session cookie cleared via `POST /api/auth/logout`
3. Redirected to `/login`

### Protected Route Access
1. User visits `/` or `/calendar` without a session
2. Middleware detects missing/invalid JWT
3. Redirected to `/login`

---

## Technical Requirements

### Dependencies

```json
{
  "@simplewebauthn/server": "^10.x",
  "@simplewebauthn/browser": "^10.x",
  "jose": "^5.x"
}
```

### Database Schema

```sql
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE authenticators (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id       TEXT NOT NULL UNIQUE,   -- base64url encoded
  credential_public_key TEXT NOT NULL,        -- base64url encoded COSE key
  counter             INTEGER NOT NULL DEFAULT 0,
  transports          TEXT,                   -- JSON array of strings
  created_at          TEXT NOT NULL
);

CREATE INDEX idx_authenticators_user_id ON authenticators(user_id);
CREATE INDEX idx_authenticators_credential_id ON authenticators(credential_id);

-- Temporary challenge storage (cleaned up after use)
CREATE TABLE webauthn_challenges (
  user_id    INTEGER NOT NULL,
  challenge  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id)
);
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register-options` | Generate WebAuthn registration challenge |
| POST | `/api/auth/register-verify` | Verify registration response & create session |
| POST | `/api/auth/login-options` | Generate WebAuthn authentication challenge |
| POST | `/api/auth/login-verify` | Verify login response & create session |
| POST | `/api/auth/logout` | Clear session cookie |
| GET | `/api/auth/session` | Get current session info |

#### POST /api/auth/register-options

```typescript
// Request: { "username": "alice" }
// Creates user if not exists, saves challenge to DB
// Response: PublicKeyCredentialCreationOptionsJSON from @simplewebauthn/server
export async function POST(request: NextRequest) {
  const { username } = await request.json();
  if (!username?.trim()) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  let user = userDB.getByUsername(username.trim());
  if (!user) {
    user = userDB.create({ username: username.trim() });
  }

  const options = await generateRegistrationOptions({
    rpName: 'Todo App',
    rpID: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
    userID: isoUint8Array.fromUTF8String(user.id.toString()),
    userName: user.username,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  challengeDB.upsert({ user_id: user.id, challenge: options.challenge });
  return NextResponse.json(options);
}
```

#### POST /api/auth/register-verify

```typescript
// Request: RegistrationResponseJSON from @simplewebauthn/browser
// Verifies response, stores authenticator, creates JWT session
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { username } = body;

  const user = userDB.getByUsername(username);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const expectedChallenge = challengeDB.getByUserId(user.id)?.challenge;
  if (!expectedChallenge) return NextResponse.json({ error: 'No challenge found' }, { status: 400 });

  const verification = await verifyRegistrationResponse({
    response: body.response,
    expectedChallenge,
    expectedOrigin: process.env.NEXT_PUBLIC_ORIGIN ?? 'http://localhost:3000',
    expectedRPID: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
  });

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  authenticatorDB.create({
    user_id: user.id,
    credential_id: isoBase64URL.fromBuffer(credential.id),
    credential_public_key: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter ?? 0,
    transports: JSON.stringify(body.response.response.transports ?? []),
  });

  challengeDB.delete(user.id);
  const token = await createJWT({ userId: user.id, username: user.username });
  const response = NextResponse.json({ success: true });
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
  return response;
}
```

#### POST /api/auth/login-options

```typescript
// Request: { "username": "alice" }
// Returns authentication options with allowed credentials
export async function POST(request: NextRequest) {
  const { username } = await request.json();
  const user = userDB.getByUsername(username?.trim());
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const authenticators = authenticatorDB.getByUserId(user.id);
  const options = await generateAuthenticationOptions({
    rpID: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
    userVerification: 'preferred',
    allowCredentials: authenticators.map(a => ({
      id: isoBase64URL.toBuffer(a.credential_id),
      transports: JSON.parse(a.transports ?? '[]'),
    })),
  });

  challengeDB.upsert({ user_id: user.id, challenge: options.challenge });
  return NextResponse.json(options);
}
```

#### POST /api/auth/login-verify

```typescript
// Request: AuthenticationResponseJSON + username
export async function POST(request: NextRequest) {
  const body = await request.json();
  const user = userDB.getByUsername(body.username);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const expectedChallenge = challengeDB.getByUserId(user.id)?.challenge;
  if (!expectedChallenge) return NextResponse.json({ error: 'No challenge found' }, { status: 400 });

  const credentialId = body.response.id;
  const authenticator = authenticatorDB.getByCredentialId(credentialId);
  if (!authenticator) return NextResponse.json({ error: 'Authenticator not found' }, { status: 404 });

  const verification = await verifyAuthenticationResponse({
    response: body.response,
    expectedChallenge,
    expectedOrigin: process.env.NEXT_PUBLIC_ORIGIN ?? 'http://localhost:3000',
    expectedRPID: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
    credential: {
      id: isoBase64URL.toBuffer(authenticator.credential_id),
      publicKey: isoBase64URL.toBuffer(authenticator.credential_public_key),
      counter: authenticator.counter ?? 0,
      transports: JSON.parse(authenticator.transports ?? '[]'),
    },
  });

  if (!verification.verified) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  authenticatorDB.updateCounter(authenticator.id, verification.authenticationInfo.newCounter);
  challengeDB.delete(user.id);

  const token = await createJWT({ userId: user.id, username: user.username });
  const response = NextResponse.json({ success: true });
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return response;
}
```

#### POST /api/auth/logout

```typescript
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('session');
  return response;
}
```

### JWT Session (lib/auth.ts)

```typescript
// lib/auth.ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
);

export interface Session {
  userId: number;
  username: string;
}

export async function createJWT(payload: Session): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as Session;
  } catch {
    return null;
  }
}
```

### Middleware (middleware.ts)

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
);

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', request.url));
  try {
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/', '/calendar'],
};
```

### Environment Variables

```bash
# .env.local
NEXT_PUBLIC_RP_ID=localhost                     # domain for WebAuthn (no port, no protocol)
NEXT_PUBLIC_ORIGIN=http://localhost:3000        # full origin URL
JWT_SECRET=your-256-bit-secret-here            # minimum 32 characters
```

---

## UI Components

### Login Page (`app/login/page.tsx`)
```tsx
// 'use client' component
// Username text input
// "Register" button → calls register-options then register-verify
// "Login" button → calls login-options then login-verify
// Uses @simplewebauthn/browser: startRegistration / startAuthentication
// Error state display
```

### Logout Button (on main page)
```tsx
// Top-right corner
// "Logout" text or icon button
// Calls POST /api/auth/logout then redirects to /login
```

### Client-Side Auth Flow

```typescript
// In app/login/page.tsx
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

async function handleRegister() {
  const optRes = await fetch('/api/auth/register-options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  const options = await optRes.json();

  const response = await startRegistration({ optionsJSON: options });

  const verifyRes = await fetch('/api/auth/register-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, response }),
  });
  if (verifyRes.ok) router.push('/');
  else setError('Registration failed');
}

async function handleLogin() {
  const optRes = await fetch('/api/auth/login-options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  const options = await optRes.json();

  const response = await startAuthentication({ optionsJSON: options });

  const verifyRes = await fetch('/api/auth/login-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, response }),
  });
  if (verifyRes.ok) router.push('/');
  else setError('Login failed. Please try again.');
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Username already has passkey (register again) | Adds additional authenticator to same user |
| Unknown username on login | 404: "User not found" |
| Challenge expired or missing | 400: "No challenge found"; user must restart flow |
| User cancels biometric prompt | `startRegistration`/`startAuthentication` throws; catch and show user-friendly message |
| Invalid/expired JWT in cookie | Middleware catches jwtVerify error; redirects to /login |
| `counter` field undefined | Always use `authenticator.counter ?? 0` to handle null/undefined safely |
| Credentials encoded incorrectly | Use `isoBase64URL` from `@simplewebauthn/server/helpers` for all credential_id conversions |
| Production deployment (non-localhost) | Set `NEXT_PUBLIC_RP_ID` to actual domain (e.g., `example.com`) |

---

## Security Requirements

- [ ] JWT_SECRET must be at minimum 32 characters; never hardcoded
- [ ] Session cookie is `httpOnly: true` to prevent XSS access
- [ ] Session cookie is `secure: true` in production
- [ ] Session cookie uses `sameSite: 'lax'` to prevent CSRF
- [ ] Challenges are single-use (deleted after verify)
- [ ] Counter verified on login to detect cloned authenticators
- [ ] RPID and Origin validated on both registration and authentication
- [ ] No passwords stored anywhere

---

## Acceptance Criteria

- [ ] `/login` page accessible without authentication
- [ ] User can register with username and biometric
- [ ] User can log in with registered passkey
- [ ] Successful auth sets HTTP-only session cookie with 7-day expiry
- [ ] Middleware redirects unauthenticated users to `/login`
- [ ] Middleware protects both `/` and `/calendar` routes
- [ ] "Logout" button clears session and redirects to `/login`
- [ ] `GET /api/auth/session` returns current user info (userId, username)
- [ ] WebAuthn uses virtual authenticator in Playwright tests

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/01-authentication.spec.ts
// Uses virtual WebAuthn authenticator (Chromium CDP flags)
test('register new user and redirect to main page');
test('login with existing passkey');
test('logout clears session and redirects to login');
test('protected route / redirects to /login when unauthenticated');
test('protected route /calendar redirects to /login when unauthenticated');
```

### Playwright Config for Virtual Authenticator

```typescript
// playwright.config.ts
use: {
  timezoneId: 'Asia/Singapore',
  launchOptions: {
    args: [
      '--enable-features=WebAuthenticationVirtualAuthenticators',
    ],
  },
},
```

### Unit Tests

```typescript
// tests/unit/auth.test.ts
test('createJWT produces a valid token');
test('getSession returns null for missing token');
test('getSession returns null for expired token');
test('getSession returns session for valid token');
```

---

## Out of Scope

- Multiple passkeys per user (supported by schema, not explicitly shown in UI)
- Passkey management page (delete/rename passkeys)
- OAuth/social login
- Magic link email authentication
- Multi-factor authentication beyond WebAuthn
- Account deletion
