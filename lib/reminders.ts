// lib/reminders.ts
// Lead-time options and helpers for the reminder/notification system.

export interface LeadTimeOption {
  value: number | null; // minutes before due date; null = "None"
  label: string;
  badge: string; // abbreviated text for the 🔔 badge
}

export const LEAD_TIME_OPTIONS: LeadTimeOption[] = [
  { value: null,  label: 'None',              badge: '' },
  { value: 15,    label: '15 minutes before', badge: '15m' },
  { value: 30,    label: '30 minutes before', badge: '30m' },
  { value: 60,    label: '1 hour before',     badge: '1h' },
  { value: 120,   label: '2 hours before',    badge: '2h' },
  { value: 1440,  label: '1 day before',      badge: '1d' },
  { value: 2880,  label: '2 days before',     badge: '2d' },
  { value: 10080, label: '1 week before',     badge: '1w' },
];

/**
 * Returns the Date when a reminder should fire.
 * reminderAt = dueDate - reminderMinutes
 */
export function getReminderAt(dueDate: string, reminderMinutes: number): Date {
  const due = new Date(dueDate);
  return new Date(due.getTime() - reminderMinutes * 60 * 1000);
}

/**
 * Returns the badge text for a given reminder_minutes value.
 * e.g. 60 → "1h"
 */
export function getReminderBadge(reminderMinutes: number): string {
  return LEAD_TIME_OPTIONS.find((o) => o.value === reminderMinutes)?.badge ?? `${reminderMinutes}m`;
}
