import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { CalendarDay, Holiday, Todo } from './db';
import { getSingaporeNow, toSingaporeISO } from './timezone';

const SGT = 'Asia/Singapore';

export function buildCalendarGrid(
  year: number,
  month: number,
  todos: Todo[],
  holidays: Holiday[]
): CalendarDay[][] {
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const holidayMap = new Map(holidays.map((holiday) => [holiday.date, holiday]));

  const todoMap = new Map<string, Todo[]>();
  for (const todo of todos) {
    if (!todo.due_date) continue;

    const dateStr = format(
      toZonedTime(new Date(todo.due_date), SGT),
      'yyyy-MM-dd'
    );
    const existing = todoMap.get(dateStr) ?? [];
    todoMap.set(dateStr, [...existing, todo]);
  }

  const todayStr = toSingaporeISO(getSingaporeNow()).slice(0, 10);

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(
      days.slice(i, i + 7).map((date) => {
        const dateStr = format(date, 'yyyy-MM-dd');

        return {
          date,
          dateStr,
          isCurrentMonth: isSameMonth(date, monthStart),
          isToday: dateStr === todayStr,
          todos: todoMap.get(dateStr) ?? [],
          holiday: holidayMap.get(dateStr) ?? null,
        };
      })
    );
  }

  return weeks;
}
