// lib/hooks/useNotifications.ts
// Client-side polling hook — checks for due reminders every 60 seconds
// and fires browser notifications. Uses last_notification_sent to prevent
// duplicates across tabs and page reloads.

import { useEffect, useRef, useCallback } from 'react';
import { formatSingaporeDate } from '@/lib/timezone';
import type { Todo } from '@/lib/db';

export function useNotifications(enabled: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkReminders = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    let todos: Todo[] = [];
    try {
      const res = await fetch('/api/notifications/check');
      if (!res.ok) return;
      const data = await res.json();
      todos = data.todos ?? [];
    } catch {
      return;
    }

    for (const todo of todos) {
      // Show browser notification
      try {
        new Notification(todo.title, {
          body: todo.due_date
            ? `Due at ${formatSingaporeDate(todo.due_date, {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}`
            : 'Reminder',
          icon: '/favicon.ico',
        });
      } catch {
        // Notifications API can throw in some environments — ignore silently
      }

      // Mark as notified to prevent duplicates
      try {
        await fetch(`/api/todos/${todo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ last_notification_sent: new Date().toISOString() }),
        });
      } catch {
        // Best-effort; if this fails the notification may re-fire next poll
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Immediate check on mount
    checkReminders();

    intervalRef.current = setInterval(checkReminders, 60_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, checkReminders]);
}

/**
 * Request browser notification permission.
 * Returns the resulting permission state.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}
