export const SESSION_COOKIE = 'session';

const DEV_JWT_SECRET = 'todo-app-dev-secret-change-in-production-32chars';

export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (secret && secret.length >= 32) {
    return new TextEncoder().encode(secret);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to at least 32 characters.');
  }

  return new TextEncoder().encode(secret ?? DEV_JWT_SECRET);
}
