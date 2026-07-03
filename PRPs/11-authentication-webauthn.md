# PRP 11 - Authentication (WebAuthn / Passkeys)

## Feature Overview

Passwordless authentication using the WebAuthn standard (passkeys). Users register using their device's biometric authenticator (Face ID, Touch ID, Windows Hello, etc.) and log in without a password. Sessions are managed with JWT stored in HTTP-only cookies. All routes except `/login` and `/register` are protected by middleware.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Register with my device biometrics | I don't need to create or remember a password |
| US-02 | User | Log in with my passkey | I can securely authenticate with a touch or glance |
| US-03 | User | Be automatically redirected to login if my session expires | I'm prompted to re-authenticate when needed |
| US-04 | User | Log out and end my session | My account is secure when I'm done |
| US-05 | Admin | Have all API routes protected by authentication | Unauthenticated requests cannot read or modify todos |

---

## User Flow

### Registration
1. User navigates to `/register`
2. User enters a username (display name)
3. Clicks "Register with Passkey"
4. Browser prompts for biometric / security key authentication
5. On success: credential is stored in the database; session JWT is issued
6. User is redirected to `/` (main todo list)

### Login
1. User navigates to `/login` (or is redirected there by middleware)
2. User enters their username
3. Clicks "Sign in with Passkey"
4. Browser prompts for biometric / security key authentication
5. On success: session JWT is issued and stored in HTTP-only cookie
6. User is redirected to the originally requested page (or `/`)

### Session Validation
1. Every request to a protected route goes through Next.js middleware
2. Middleware reads the `session` HTTP-only cookie
3. JWT is verified; if valid, request proceeds
4. If JWT is missing or expired: redirect to `/login?redirect=[original_path]`

### Logout
1. User clicks "Log out" in the header
2. `POST /api/auth/logout` clears the session cookie
3. User is redirected to `/login`

---

## Technical Requirements

### Dependencies

```json
{
  "@simplewebauthn/server": "^9.0.0",
  "@simplewebauthn/browser": "^9.0.0",
  "jose": "^5.0.0"
}
```

### Database Schema

```sql
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL
);

CREATE TABLE credentials (
  id                     TEXT PRIMARY KEY,         -- credential ID (base64url)
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key             TEXT NOT NULL,            -- base64url encoded
  counter                INTEGER NOT NULL DEFAULT 0,
  device_type            TEXT,                     -- 'platform' | 'cross-platform'
  backed_up              INTEGER NOT NULL DEFAULT 0,
  transports             TEXT,                     -- JSON array of transport strings
  created_at             TEXT NOT NULL
);

CREATE INDEX idx_credentials_user_id ON credentials(user_id);
```

### Environment Variables

```env
# .env.local
JWT_SECRET=<32+ character random secret>
WEBAUTHN_RP_ID=localhost          # domain for production (e.g., todo.example.com)
WEBAUTHN_RP_NAME=Todo App
WEBAUTHN_ORIGIN=http://localhost:3000  # must match browser origin
```

### WebAuthn Flow — Registration

#### Step 1: Generate Registration Options
```
POST /api/auth/register/options
Body: { username: string }
```

```typescript
// app/api/auth/register/options/route.ts
import { generateRegistrationOptions } from '@simplewebauthn/server';

export async function POST(request: Request) {
  const { username } = await request.json();

  if (!username?.trim()) {
    return Response.json({ error: 'Username is required' }, { status: 400 });
  }

  const db = getDb();

  // Create or find user
  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    const result = db
      .prepare('INSERT INTO users (username, created_at) VALUES (?, ?)')
      .run(username.trim(), new Date().toISOString());
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }

  const existingCredentials = db
    .prepare('SELECT id, transports FROM credentials WHERE user_id = ?')
    .all((user as any).id);

  const options = await generateRegistrationOptions({
    rpName: process.env.WEBAUTHN_RP_NAME!,
    rpID: process.env.WEBAUTHN_RP_ID!,
    userID: new TextEncoder().encode(String((user as any).id)),
    userName: username,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((c: any) => ({
      id: c.id,
      transports: JSON.parse(c.transports ?? '[]'),
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
  });

  // Store challenge in session (use a temporary cookie or server-side store)
  // For simplicity, use a signed cookie:
  const response = Response.json({ options, userId: (user as any).id });
  response.headers.set('Set-Cookie',
    `regChallenge=${options.challenge}; HttpOnly; SameSite=Strict; Path=/; Max-Age=300`
  );
  return response;
}
```

#### Step 2: Verify Registration
```
POST /api/auth/register/verify
Body: { userId, registrationResponse }
```

```typescript
import { verifyRegistrationResponse } from '@simplewebauthn/server';

export async function POST(request: Request) {
  const { userId, registrationResponse } = await request.json();

  // Read challenge from cookie
  const cookies = parseCookies(request.headers.get('cookie') ?? '');
  const expectedChallenge = cookies.regChallenge;

  const verification = await verifyRegistrationResponse({
    response: registrationResponse,
    expectedChallenge,
    expectedOrigin: process.env.WEBAUTHN_ORIGIN!,
    expectedRPID: process.env.WEBAUTHN_RP_ID!,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return Response.json({ error: 'Registration failed' }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  const db = getDb();
  db.prepare(
    `INSERT INTO credentials
       (id, user_id, public_key, counter, device_type, backed_up, transports, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    credential.id,
    userId,
    Buffer.from(credential.publicKey).toString('base64url'),
    credential.counter,
    credentialDeviceType,
    credentialBackedUp ? 1 : 0,
    JSON.stringify(credential.transports ?? []),
    new Date().toISOString()
  );

  // Issue session JWT
  const token = await issueJWT(userId);
  const res = Response.json({ success: true });
  res.headers.set('Set-Cookie',
    `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
  );
  res.headers.append('Set-Cookie',
    `regChallenge=; HttpOnly; Max-Age=0; Path=/`
  );
  return res;
}
```

### WebAuthn Flow — Authentication

#### Step 1: Generate Authentication Options
```
POST /api/auth/login/options
Body: { username: string }
```

```typescript
import { generateAuthenticationOptions } from '@simplewebauthn/server';

export async function POST(request: Request) {
  const { username } = await request.json();

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  const credentials = db
    .prepare('SELECT * FROM credentials WHERE user_id = ?')
    .all((user as any).id);

  const options = await generateAuthenticationOptions({
    rpID: process.env.WEBAUTHN_RP_ID!,
    userVerification: 'required',
    allowCredentials: credentials.map((c: any) => ({
      id: c.id,
      transports: JSON.parse(c.transports ?? '[]'),
    })),
  });

  const res = Response.json({ options, userId: (user as any).id });
  res.headers.set('Set-Cookie',
    `authChallenge=${options.challenge}; HttpOnly; SameSite=Strict; Path=/; Max-Age=300`
  );
  return res;
}
```

#### Step 2: Verify Authentication
```
POST /api/auth/login/verify
Body: { userId, authenticationResponse }
```

```typescript
import { verifyAuthenticationResponse } from '@simplewebauthn/server';

export async function POST(request: Request) {
  const { userId, authenticationResponse } = await request.json();

  const cookies = parseCookies(request.headers.get('cookie') ?? '');
  const expectedChallenge = cookies.authChallenge;

  const db = getDb();
  const credential = db
    .prepare('SELECT * FROM credentials WHERE id = ? AND user_id = ?')
    .get(authenticationResponse.id, userId);

  if (!credential) {
    return Response.json({ error: 'Credential not found' }, { status: 400 });
  }

  const credentialPublicKey = Buffer.from((credential as any).public_key, 'base64url');

  const verification = await verifyAuthenticationResponse({
    response: authenticationResponse,
    expectedChallenge,
    expectedOrigin: process.env.WEBAUTHN_ORIGIN!,
    expectedRPID: process.env.WEBAUTHN_RP_ID!,
    credential: {
      id: (credential as any).id,
      publicKey: credentialPublicKey,
      counter: (credential as any).counter,
      transports: JSON.parse((credential as any).transports ?? '[]'),
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    return Response.json({ error: 'Authentication failed' }, { status: 401 });
  }

  // Update counter
  db.prepare('UPDATE credentials SET counter = ? WHERE id = ?')
    .run(verification.authenticationInfo.newCounter, (credential as any).id);

  const token = await issueJWT(userId);
  const res = Response.json({ success: true });
  res.headers.set('Set-Cookie',
    `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
  );
  res.headers.append('Set-Cookie',
    `authChallenge=; HttpOnly; Max-Age=0; Path=/`
  );
  return res;
}
```

### JWT Utilities

```typescript
// lib/jwt.ts
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function issueJWT(userId: number): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

export async function verifyJWT(token: string): Promise<{ userId: number }> {
  const { payload } = await jwtVerify(token, secret);
  return { userId: payload.userId as number };
}
```

### Route Protection Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/jwt';

const PUBLIC_PATHS = ['/login', '/register', '/api/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('session')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await verifyJWT(token);
    return NextResponse.next();
  } catch {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('session');
    return response;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### Logout

```typescript
// app/api/auth/logout/route.ts
export async function POST() {
  const res = Response.json({ success: true });
  res.headers.set('Set-Cookie',
    'session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
  );
  return res;
}
```

---

## UI Components

### RegisterPage (`app/register/page.tsx`)
```tsx
// Username input + "Register with Passkey" button
// Uses @simplewebauthn/browser: startRegistration()
// On success: redirects to /
// On failure: shows error message
```

### LoginPage (`app/login/page.tsx`)
```tsx
// Username input + "Sign in with Passkey" button
// Uses @simplewebauthn/browser: startAuthentication()
// On success: redirects to ?redirect param or /
// On failure: shows error message
```

### LogoutButton
```tsx
// Button in app header
// Calls POST /api/auth/logout
// On success: redirects to /login
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User registers same username twice | Second registration adds a new credential for the same user; does not error |
| Credential ID already exists | INSERT will fail; return 409 Conflict |
| JWT secret not set in env | App crashes at startup — fail fast with clear error message |
| WebAuthn not supported in browser | Detect `window.PublicKeyCredential`; show fallback message if not supported |
| Challenge cookie missing on verify | Return 400: "Registration session expired, please try again" |
| Expired JWT | Middleware clears cookie and redirects to /login |
| User accesses /login with active valid session | Redirect to / (already logged in) |
| Counter verification fails (potential cloning attack) | Return 401; log security event |
| API route called without session (unauthenticated) | Return 401 JSON, not a redirect (to avoid breaking API clients) |

---

## Acceptance Criteria

- [ ] `/register` page allows registering with a username and passkey
- [ ] `/login` page allows signing in with an existing passkey
- [ ] Successful registration/login sets an HTTP-only `session` cookie
- [ ] JWT expires after 24 hours
- [ ] All routes except `/login`, `/register`, and `/api/auth/*` are protected
- [ ] Unauthenticated requests to pages redirect to `/login?redirect=[path]`
- [ ] Unauthenticated requests to API routes return `401 JSON`, not redirect
- [ ] Logging out clears the session cookie and redirects to `/login`
- [ ] After login, user is redirected to the originally requested page
- [ ] WebAuthn credential counter is updated after each authentication
- [ ] Challenge cookies are short-lived (5 minutes) and HTTP-only
- [ ] `JWT_SECRET` of less than 32 characters causes a startup error or warning
- [ ] Browser without WebAuthn support sees a clear error message

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/auth.spec.ts

test('register new user with passkey', async ({ page, context }) => {
  // Requires Playwright's WebAuthn virtual authenticator
  await context.addVirtualAuthenticator({ protocol: 'ctap2', transport: 'internal' });
  /* ... */
});
test('login with registered passkey', async ({ page, context }) => { /* ... */ });
test('unauthenticated user redirected to login', async ({ page }) => { /* ... */ });
test('login redirect preserves original URL', async ({ page }) => { /* ... */ });
test('logout clears session', async ({ page }) => { /* ... */ });
test('expired session redirects to login', async ({ page }) => { /* ... */ });
test('API returns 401 for unauthenticated requests', async ({ page }) => { /* ... */ });
```

### Unit Tests

```typescript
// tests/unit/jwt.test.ts
test('issueJWT: creates a signed JWT with userId claim');
test('verifyJWT: returns userId from valid token');
test('verifyJWT: throws on expired token');
test('verifyJWT: throws on tampered token');
```

---

## Out of Scope

- Multi-user support (this app is single-user or small team)
- OAuth / social login (Google, GitHub)
- Password-based fallback authentication
- Magic link / email authentication
- Role-based access control (RBAC)
- Account deletion / credential revocation UI

---

## Security Notes

- JWT is stored in HTTP-only, Secure, SameSite=Strict cookie to prevent XSS theft
- Challenge cookies have a 5-minute TTL and are cleared after verification
- Credential counter is verified to detect cloned authenticators
- `rpID` must match the exact domain in production to prevent phishing
- All WebAuthn operations use `userVerification: 'required'` (biometric/PIN required)

---

## Success Metrics

- Registration and login complete in < 2 seconds (excluding biometric prompt)
- Zero credentials stored in plaintext (public key only, never private key)
- Middleware adds < 5 ms latency per request
- All auth flows covered by E2E tests using Playwright's virtual authenticator
