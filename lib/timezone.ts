// lib/timezone.ts
// All date/time operations MUST use Singapore timezone (Asia/Singapore, UTC+8)

const SINGAPORE_TZ = 'Asia/Singapore';

/**
 * Get the current time in Singapore timezone.
 * ALWAYS use this instead of new Date().
 */
export function getSingaporeNow(): Date {
  // new Date() returns the correct UTC moment; formatting is TZ-aware.
  return new Date();
}

/**
 * Format a Date (or ISO string) as a human-readable string in SGT.
 */
export function formatSingaporeDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-SG', { timeZone: SINGAPORE_TZ, ...options });
}

/**
 * Format a Date as ISO 8601 string with SGT offset (+08:00).
 */
export function toSingaporeISO(date: Date): string {
  // Offset SGT = UTC + 8 hours
  const offset = 8 * 60; // minutes
  const localMs = date.getTime() + offset * 60 * 1000;
  const localDate = new Date(localMs);
  return localDate.toISOString().replace('Z', '+08:00');
}

/**
 * Returns a Date representing the start of today in SGT (midnight SGT as UTC moment).
 */
export function getSingaporeStartOfDay(): Date {
  const now = getSingaporeNow();
  const sgt = new Date(
    now.toLocaleString('en-US', { timeZone: SINGAPORE_TZ })
  );
  sgt.setHours(0, 0, 0, 0);
  // Convert back to UTC
  const offsetMs = 8 * 60 * 60 * 1000;
  return new Date(sgt.getTime() - offsetMs);
}
