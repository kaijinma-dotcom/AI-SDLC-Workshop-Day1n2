'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildCalendarGrid } from '@/lib/calendar';
import type { CalendarDay, Holiday, Todo } from '@/lib/db';
import { getSingaporeNow, toSingaporeISO } from '@/lib/timezone';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high':
      return 'bg-red-500';
    case 'medium':
      return 'bg-yellow-500';
    case 'low':
      return 'bg-blue-500';
    default:
      return 'bg-gray-400';
  }
}

interface DayCellProps {
  day: CalendarDay;
}

function DayCell({ day }: DayCellProps) {
  const maxVisible = 3;
  const overflow = day.todos.length - maxVisible;

  return (
    <div
      className={`min-h-[100px] rounded-lg border border-gray-200 p-1 dark:border-gray-700 ${
        !day.isCurrentMonth
          ? 'bg-gray-50 opacity-40 dark:bg-gray-900'
          : 'bg-white dark:bg-gray-800'
      } ${day.holiday ? 'bg-amber-50 dark:bg-amber-900/20' : ''} ${
        day.isToday ? 'ring-2 ring-blue-500' : ''
      }`}
    >
      <div className="mb-1 flex items-start justify-between">
        <span
          className={`text-sm font-medium ${
            day.isToday
              ? 'font-bold text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300'
          }`}
        >
          {day.date.getDate()}
        </span>
      </div>

      {day.holiday && (
        <div
          className="mb-1 truncate text-xs text-amber-700 dark:text-amber-400"
          title={day.holiday.name}
        >
          🎉 {day.holiday.name}
        </div>
      )}

      {day.todos.slice(0, maxVisible).map((todo) => (
        <div
          key={todo.id}
          className={`mb-0.5 flex items-center gap-1 truncate rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300 ${
            todo.completed ? 'opacity-50' : ''
          }`}
          title={todo.title}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${getPriorityColor(todo.priority)}`}
          />
          <span className={`truncate ${todo.completed ? 'line-through' : ''}`}>
            {todo.title}
          </span>
        </div>
      ))}

      {overflow > 0 && (
        <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
          +{overflow} more
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const now = toSingaporeISO(getSingaporeNow());
  const [year, setYear] = useState(Number(now.slice(0, 4)));
  const [month, setMonth] = useState(Number(now.slice(5, 7)));

  const fetchData = useCallback(
    async (selectedYear: number) => {
      setLoading(true);

      try {
        const [todosRes, holidaysRes] = await Promise.all([
          fetch('/api/todos'),
          fetch(`/api/holidays?year=${selectedYear}`),
        ]);

        if (todosRes.status === 401 || holidaysRes.status === 401) {
          router.push('/login');
          return;
        }

        const todosData = await todosRes.json();
        const holidaysData = await holidaysRes.json();

        setTodos(todosData.todos ?? []);
        setHolidays(holidaysData.holidays ?? []);
      } catch (error) {
        console.error('Failed to load calendar data', error);
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    void fetchData(year);
  }, [fetchData, year, month]);

  function prevMonth() {
    if (month === 1) {
      setYear((currentYear) => currentYear - 1);
      setMonth(12);
      return;
    }

    setMonth((currentMonth) => currentMonth - 1);
  }

  function nextMonth() {
    if (month === 12) {
      setYear((currentYear) => currentYear + 1);
      setMonth(1);
      return;
    }

    setMonth((currentMonth) => currentMonth + 1);
  }

  function goToToday() {
    const today = toSingaporeISO(getSingaporeNow());
    setYear(Number(today.slice(0, 4)));
    setMonth(Number(today.slice(5, 7)));
  }

  const weeks = buildCalendarGrid(year, month, todos, holidays);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            ← Back to List
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="rounded-lg bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            ◀
          </button>
          <button
            onClick={goToToday}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Today
          </button>
          <button
            onClick={nextMonth}
            className="rounded-lg bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            ▶
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> High
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" /> Medium
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Low
        </span>
        <span className="flex items-center gap-1">
          <span className="text-amber-600">🎉</span> Holiday
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          Loading…
        </div>
      ) : (
        <div>
          <div className="mb-2 grid grid-cols-7">
            {DAY_NAMES.map((dayName) => (
              <div
                key={dayName}
                className="py-1 text-center text-xs font-semibold text-gray-500 dark:text-gray-400"
              >
                {dayName}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1">
                {week.map((day) => (
                  <DayCell key={day.dateStr} day={day} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
