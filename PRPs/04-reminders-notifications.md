# PRP 04 - Reminders & Notifications

## Feature Overview

A browser-based notification system that reminds users of upcoming todos. Users configure a reminder lead time (15 minutes to 1 week before a todo's due date). The system uses client-side polling every 60 seconds, requests Web Notifications API permission, and prevents duplicate notifications using `last_notification_sent` tracking.

All time calculations use Singapore timezone (Asia/Singapore / UTC+8).

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Enable a reminder for a specific todo | I don't forget upcoming deadlines |
| US-02 | User | Choose how far in advance I'm reminded | I can control how much notice I get |
| US-03 | User | Receive a browser notification when a reminder fires | I'm alerted even if not looking at the page |
| US-04 | User | Not receive duplicate notifications | I'm not spammed by repeated alerts |
| US-05 | User | See which todos have reminders | I can manage my notification preferences |

---

## User Flow

### Enabling Notifications (Global)
1. User clicks **"🔔 Enable Notifications"** button (orange, top-right)
2. Browser prompts for notification permission
3. If granted: button turns green → "🔔 Notifications On"
4. If denied: banner shown: "Reminders are blocked. Enable notifications in browser settings."

### Setting a Reminder on a Todo
1. Open "Add Todo" or "Edit Todo" form
2. **Reminder dropdown** is visible (disabled if no due date set)
3. Select lead time: 15 min / 30 min / 1 hour / 2 hours / 1 day / 2 days / 1 week
4. Save todo; `reminder_minutes` stored in DB

### Reminder Firing (Polling Mechanism)
1. On page load, polling starts (60-second interval)
2. Each tick: `GET /api/notifications/check` — returns todos where reminder time has passed, not yet notified, not completed
3. For each due reminder:
   - Show browser notification: title = todo title, body = "Due at [SGT time]"
   - Call API to mark `last_notification_sent = NOW()` to prevent duplicates
4. Polling stops on page unmount (cleanup)

### Removing a Reminder
1. User opens edit modal
2. Changes Reminder dropdown to "None"
3. Saves; `reminder_minutes = null` cleared in DB

---

## Technical Requirements

### Database Schema

```sql
-- Columns on todos table (see PRP 01 for full schema)
reminder_minutes       INTEGER,    -- minutes before due date (15, 30, 60, 120, 1440, 2880, 10080)
last_notification_sent TEXT        -- ISO 8601 UTC; prevents duplicate notifications
```

### Lead Time Options

```typescript
// lib/reminders.ts
export type ReminderLeadTime = '15m' | '30m' | '1h' | '2h' | '1d' | '2d' | '1w';

export const LEAD_TIME_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null,  label: 'None' },
  { value: 15,    label: '15 minutes before' },
  { value: 30,    label: '30 minutes before' },
  { value: 60,    label: '1 hour before' },
  { value: 120,   label: '2 hours before' },
  { value: 1440,  label: '1 day before' },
  { value: 2880,  label: '2 days before' },
  { value: 10080, label: '1 week before' },
];

export function getReminderAt(dueDate: string, reminderMinutes: number): Date {
  const due = new Date(dueDate);
  return new Date(due.getTime() - reminderMinutes * 60 * 1000);
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications/check` | Returns todos with due reminders (not yet sent, not completed) |

#### GET /api/notifications/check

```typescript
// app/api/notifications/check/route.ts
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const now = new Date().toISOString();
  // Returns todos where reminder is due and hasn't been sent yet
  const todos = todoDB.getDueReminders(session.userId, now);
  return NextResponse.json({ todos });
}
```

```sql
-- todoDB.getDueReminders query
SELECT * FROM todos
WHERE user_id = ?
  AND completed = 0
  AND reminder_minutes IS NOT NULL
  AND due_date IS NOT NULL
  AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= datetime(?)
  AND (last_notification_sent IS NULL
       OR last_notification_sent < datetime(due_date, '-' || reminder_minutes || ' minutes'))
```

After showing notifications, client calls `PUT /api/todos/[id]` with `{ last_notification_sent: now }`.

### Client-Side Polling Hook

```typescript
// lib/hooks/useNotifications.ts
import { useEffect, useRef, useCallback } from 'react';
import { formatSingaporeDate } from '@/lib/timezone';

export function useNotifications(enabled: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkReminders = useCallback(async () => {
    if (Notification.permission !== 'granted') return;
    const res = await fetch('/api/notifications/check');
    if (!res.ok) return;
    const { todos } = await res.json();
    for (const todo of todos) {
      new Notification(todo.title, {
        body: `Due at ${formatSingaporeDate(todo.due_date, 'h:mm a, d MMM yyyy')}`,
        icon: '/favicon.ico',
      });
      await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_notification_sent: new Date().toISOString() }),
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    checkReminders();
    intervalRef.current = setInterval(checkReminders, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [enabled, checkReminders]);
}
```

### Notification Permission Helper

```typescript
// lib/notifications.ts
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}
```

### TypeScript Types

```typescript
// Part of Todo interface in lib/db.ts
reminder_minutes: number | null;       // e.g., 60 for "1 hour before"
last_notification_sent: string | null; // ISO 8601 UTC
```

### Singapore Timezone for Notification Body

```typescript
// Notification body example:
// Todo due at 2025-11-15T09:00:00+08:00 with 1-day reminder:
// reminderAt = 2025-11-14T09:00:00+08:00
// Notification body: "Due at 9:00 AM, 15 Nov 2025"
```

---

## UI Components

### "Enable Notifications" Button (top of page)
```tsx
// Orange when permission not granted: "🔔 Enable Notifications"
// Green when granted: "🔔 Notifications On"
// Calls requestNotificationPermission() on click
```

### Reminder Dropdown (in todo form and edit modal)
```tsx
// <select> with LEAD_TIME_OPTIONS
// Disabled when no due_date is set; shows tooltip: "Set a due date first"
// Default: "None"
```

### Reminder Badge (on todo card)
```tsx
// Small 🔔 badge shown when reminder_minutes is set
// Text: abbreviated time (e.g., "🔔 1h", "🔔 1d", "🔔 1w")
// Positioned next to recurrence badge
```

### Notification Permission Banner
```tsx
// Shown when Notification.permission === 'denied'
// Message: "Reminders are blocked. Enable notifications in your browser settings."
// Dismissible (stores dismissal in localStorage)
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Todo has no due date but reminder selected | Reminder dropdown disabled; cannot save with reminder but no due date |
| Browser doesn't support Notifications API | Feature degrades gracefully; no crash; notifications silently skipped |
| User denies notification permission | Banner shown; polling still runs but notifications suppressed |
| Multiple tabs open | `last_notification_sent` check prevents duplicate notifications across tabs |
| Tab closed during polling | Polling stops; on next load, missed reminders checked immediately |
| Reminder at is in the past (due to late page load) | Fires immediately on first poll check |
| Todo completed before reminder fires | `completed = 0` check prevents notification |

---

## Acceptance Criteria

- [ ] "🔔 Enable Notifications" button visible on page (orange → green after granting)
- [ ] Reminder dropdown appears in create/edit forms
- [ ] Reminder dropdown disabled when no due date is set
- [ ] All 7 lead time options available (None, 15m, 30m, 1h, 2h, 1d, 2d, 1w)
- [ ] Reminder badge (🔔 + abbreviated time) visible on todos with active reminders
- [ ] Browser notification fires within 60 seconds of reminder time
- [ ] Notification title = todo title; body = "Due at [time in SGT]"
- [ ] `last_notification_sent` set after notification; duplicate notifications prevented
- [ ] Permission denied banner shown when notifications blocked
- [ ] Reminder removed by selecting "None" in edit form
- [ ] All times displayed in Singapore timezone

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/04-reminders.spec.ts
test('reminder dropdown disabled without due date');
test('reminder badge 🔔 visible after setting reminder');
test('reminder badge shows correct abbreviated time');
test('removing reminder clears badge');
test('notification permission button changes state after grant');
```

### Unit Tests

```typescript
// tests/unit/reminders.test.ts
test('getReminderAt: 15 minutes before due date');
test('getReminderAt: 1 day before due date');
test('getReminderAt: 1 week before due date');
test('getReminderAt: result is before due date');
test('LEAD_TIME_OPTIONS contains all 7 options plus None');
```

---

## Out of Scope

- Push notifications (server-sent events / service workers)
- Email or SMS reminders
- Snooze functionality
- Sound/vibration customization
- Per-user global notification preferences (beyond per-todo settings)
