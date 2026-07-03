import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarGrid } from './calendar';
import type { Holiday, Todo } from './db';

function createTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 1,
    user_id: 1,
    title: 'Calendar task',
    completed: false,
    due_date: '2026-07-04T00:30:00+08:00',
    priority: 'medium',
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

test('buildCalendarGrid returns full Sunday-Saturday week rows', () => {
  const weeks = buildCalendarGrid(2026, 7, [], []);

  assert.equal(weeks.length, 5);
  assert.ok(weeks.every((week) => week.length === 7));
  assert.equal(weeks[0][0].dateStr, '2026-06-28');
  assert.equal(weeks[4][6].dateStr, '2026-08-01');
});

test('buildCalendarGrid groups todos by Singapore local date', () => {
  const todo = createTodo({ due_date: '2026-07-03T16:30:00.000Z' });
  const weeks = buildCalendarGrid(2026, 7, [todo], []);
  const julyFourth = weeks.flat().find((day) => day.dateStr === '2026-07-04');
  const julyThird = weeks.flat().find((day) => day.dateStr === '2026-07-03');

  assert.equal(julyFourth?.todos.length, 1);
  assert.equal(julyFourth?.todos[0]?.title, 'Calendar task');
  assert.equal(julyThird?.todos.length, 0);
});

test('buildCalendarGrid ignores todos without due date and attaches holidays', () => {
  const holiday: Holiday = {
    id: 99,
    date: '2026-07-14',
    name: 'Test Holiday',
    year: 2026,
  };
  const weeks = buildCalendarGrid(
    2026,
    7,
    [createTodo({ due_date: null })],
    [holiday]
  );
  const holidayDay = weeks.flat().find((day) => day.dateStr === '2026-07-14');
  const outsideMonthDay = weeks.flat().find((day) => day.dateStr === '2026-06-28');

  assert.equal(holidayDay?.holiday?.name, 'Test Holiday');
  assert.equal(holidayDay?.todos.length, 0);
  assert.equal(outsideMonthDay?.isCurrentMonth, false);
});
