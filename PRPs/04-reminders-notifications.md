# PRP 04 - Reminders & Notifications

## Feature Overview

A browser-based notification system that reminds users of upcoming todos. Users can configure a reminder lead time (from 15 minutes to 1 week before a todo's due date). The system uses a client-side polling mechanism to check for due reminders, requests the Web Notifications API permission, and prevents duplicate notifications from firing.

All time calculations use Singapore timezone (Asia/Singapore / UTC+8).

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Enable a reminder for a specific todo | I don't forget upcoming deadlines |
| US-02 | User | Choose how far in advance I'm reminded | I can control how much notice I get |
| US-03 | User | Receive a browser notification when a reminder fires | I'm alerted even if I'm not looking at the page |
| US-04 | User | Not receive duplicate notifications for the same reminder | I'm not spammed by repeated alerts |
| US-05 | User | See which todos have reminders configured | I can manage my notification preferences |

---

## User Flow

### Enabling a Reminder
1. User opens the "Add Todo" or "Edit Todo" form
2. A "Reminder" toggle/section is visible
3. User enables the reminder
4. A dropdown appears with lead time options: 15 min, 30 min, 1 hour, 2 hours, 1 day, 2 days, 1 week
5. User selects a lead time
6. On save, the reminder target time is calculated: `dueDate - leadTime` (in SGT)
7. The todo is saved with reminder metadata

### Browser Permission Flow
1. On first reminder creation (or on page load if reminders exist), request Notifications permission
2. If user denies: show a banner "Notifications are blocked. Enable them in browser settings to receive reminders."
3. If user grants: proceed silently

### Reminder Firing (Polling Mechanism)
1. On page load, start a polling interval (every 60 seconds)
2. Each tick: `GET /api/todos/reminders/due` — returns reminders whose `reminderAt <= NOW()` and `fired = false` and `completed = false`
3. For each due reminder:
   a. Show browser notification: title = todo title, body = "Due at [time in SGT]"
   b. Call `PATCH /api/todos/[id]/reminder` with `{ fired: true }` to mark as notified
4. Stop polling when user navigates away (cleanup on unmount)

### Dismissing / Managing Reminders
1. User can disable a reminder via the edit form (toggle off)
2. Reminder metadata is cleared; no further notifications

---

## Technical Requirements

### Database Schema

```sql
-- Add reminder columns to todos table
ALTER TABLE todos ADD COLUMN reminder_enabled  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE todos ADD COLUMN reminder_lead_time TEXT;   -- '15m' | '30m' | '1h' | '2h' | '1d' | '2d' | '1w'
ALTER TABLE todos ADD COLUMN reminder_at       TEXT;    -- ISO 8601 UTC timestamp when notification should fire
ALTER TABLE todos ADD COLUMN reminder_fired    INTEGER NOT NULL DEFAULT 0;
```

### Lead Time Options

```typescript
// lib/reminders.ts
export type ReminderLeadTime = '15m' | '30m' | '1h' | '2h' | '1d' | '2d' | '1w';

export const LEAD_TIME_CONFIG: Record<ReminderLeadTime, { label: string; minutes: number }> = {
  '15m': { label: '15 minutes before', minutes: 15 },
  '30m': { label: '30 minutes before', minutes: 30 },
  '1h':  { label: '1 hour before',     minutes: 60 },
  '2h':  { label: '2 hours before',    minutes: 120 },
  '1d':  { label: '1 day before',      minutes: 1440 },
  '2d':  { label: '2 days before',     minutes: 2880 },
  '1w':  { label: '1 week before',     minutes: 10080 },
};

export function calculateReminderAt(dueDate: string, leadTime: ReminderLeadTime): string {
  const due = new Date(dueDate);
  const { minutes } = LEAD_TIME_CONFIG[leadTime];
  return new Date(due.getTime() - minutes * 60 * 1000).toISOString();
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/todos/reminders/due` | Returns unfired, non-completed todos with `reminderAt <= NOW()` |
| PATCH | `/api/todos/[id]/reminder` | Mark reminder as fired |

#### GET /api/todos/reminders/due

```typescript
// app/api/todos/reminders/due/route.ts
// Query: SELECT * FROM todos WHERE reminder_enabled = 1 AND reminder_fired = 0
//          AND completed = 0 AND reminder_at <= datetime('now')
export async function GET() {
  const db = getDb();
  const now = new Date().toISOString();
  const reminders = db
    .prepare(
      `SELECT * FROM todos
       WHERE reminder_enabled = 1
         AND reminder_fired = 0
         AND completed = 0
         AND reminder_at <= ?`
    )
    .all(now);
  return Response.json({ reminders });
}
```

#### PATCH /api/todos/[id]/reminder

Request body: `{ "fired": true }`
Response: `200 OK` with updated todo.

### Client-Side Polling

```typescript
// hooks/useReminderPolling.ts
import { useEffect, useRef } from 'react';
import { formatSGT } from '@/lib/timezone';

export function useReminderPolling(enabled: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    async function checkReminders() {
      const res = await fetch('/api/todos/reminders/due');
      const { reminders } = await res.json();

      for (const reminder of reminders) {
        // Show notification
        if (Notification.permission === 'granted') {
          new Notification(reminder.title, {
            body: `Due at ${formatSGT(reminder.due_date, 'h:mm a, d MMM yyyy')}`,
            icon: '/favicon.ico',
          });
        }
        // Mark as fired
        await fetch(`/api/todos/${reminder.id}/reminder`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fired: true }),
        });
      }
    }

    checkReminders(); // immediate check on mount
    intervalRef.current = setInterval(checkReminders, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled]);
}
```

### Notification Permission Request

```typescript
// lib/notifications.ts
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}
```

### TypeScript Types

```typescript
export type ReminderLeadTime = '15m' | '30m' | '1h' | '2h' | '1d' | '2d' | '1w';

export interface Todo {
  // ...existing fields...
  reminderEnabled: boolean;
  reminderLeadTime: ReminderLeadTime | null;
  reminderAt: string | null;      // UTC ISO 8601
  reminderFired: boolean;
}
```

### Singapore Timezone Calculations

Reminder display times are always shown in SGT:

```typescript
// Example: due at 2025-11-15T09:00:00+08:00 with 1-day reminder
// reminderAt = 2025-11-14T01:00:00Z (= 2025-11-14T09:00:00+08:00)
// Notification body: "Due at 9:00 AM, 15 Nov 2025"
```

---

## UI Components

### ReminderSection (within TodoForm)
```tsx
// Toggle + lead time selector
// Props: enabled: boolean, leadTime: ReminderLeadTime | null
//        onChange: (enabled: boolean, leadTime: ReminderLeadTime | null) => void
// Shows lead time select only when enabled = true
// Requires dueDate to be set — shows warning if not
```

### NotificationPermissionBanner
```tsx
// Shown when Notification.permission === 'denied'
// Message: "Reminders are blocked. Enable notifications in your browser settings."
// Has a dismiss button (persisted in localStorage)
```

### ReminderBadge
```tsx
// Small bell icon shown on todo cards with active reminders
// Props: reminderLeadTime: ReminderLeadTime, reminderAt: string
// Tooltip: "Reminder: 1 day before due"
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Todo has no due date but reminder is enabled | Validation error: "Reminder requires a due date" |
| Due date is in the past | Reminder at would also be past — show warning; allow save but reminder fires immediately or is skipped |
| User denies notification permission | Show banner; polling still runs but notifications are suppressed |
| Browser tab is closed during polling | Polling stops; missed reminders shown on next page load |
| Reminder fires but todo already completed externally | `completed = 0` check prevents firing |
| Multiple tabs open | Each tab polls independently — `reminder_fired = 1` prevents duplicate notifications |
| Lead time > time until due date | `reminderAt` would be in the past — warning shown; reminder may fire immediately |
| `Notification` API not supported | Feature degraded gracefully; no crash, no notifications |

---

## Acceptance Criteria

- [ ] Reminder toggle appears in the todo form
- [ ] Lead time dropdown shows all 7 options (15m to 1w)
- [ ] Reminder requires a due date — validation error shown if not set
- [ ] `reminderAt` is calculated correctly as `dueDate - leadTime`
- [ ] All times displayed in Singapore timezone
- [ ] Browser notification fires within 60 seconds of `reminderAt`
- [ ] Notification title matches todo title
- [ ] Notification body shows due time in SGT format
- [ ] `reminderFired` is set to true after notification fires
- [ ] Duplicate notifications are prevented across tabs and page reloads
- [ ] Permission denied banner is shown when notifications are blocked
- [ ] Reminder can be disabled via edit form
- [ ] Bell icon badge is visible on todos with active reminders

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/reminders.spec.ts

test('enable reminder with 1-day lead time', async ({ page }) => { /* ... */ });
test('reminder requires due date - validation error shown', async ({ page }) => { /* ... */ });
test('reminder bell badge visible on todo card', async ({ page }) => { /* ... */ });
test('disable reminder via edit form removes badge', async ({ page }) => { /* ... */ });
// Note: Notification firing requires mocking Notification API and time
```

### Unit Tests

```typescript
// tests/unit/reminders.test.ts
test('calculateReminderAt: 15 minutes before');
test('calculateReminderAt: 1 day before');
test('calculateReminderAt: 1 week before');
test('calculateReminderAt: result is in UTC ISO format');
```

---

## Out of Scope

- Push notifications (server-sent)
- Email or SMS reminders
- Recurring reminder snooze functionality
- Per-user notification preferences (beyond per-todo settings)
- Sound/vibration customization

---

## Success Metrics

- Notification fires within 60 seconds of `reminderAt`
- Zero duplicate notifications in multi-tab scenario
- `reminderAt` calculation is accurate to the second
- Graceful degradation when Notification API is unavailable
