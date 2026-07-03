# PRP 10 - Calendar View

## Feature Overview

A dedicated monthly calendar page at `/calendar` that visualizes todos on their due dates. Todos are color-coded by priority. Singapore public holidays are displayed. Users can navigate between months. The calendar is a separate page protected by authentication middleware, sharing the same data layer as the main todo list.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | View a monthly calendar with my todos | I can see my workload at a glance |
| US-02 | User | See todos color-coded by priority on their due dates | I can quickly spot urgent days |
| US-03 | User | Navigate between months (prev / next) | I can review past and future schedules |
| US-04 | User | See Singapore public holidays on the calendar | I can plan around public holidays |
| US-05 | User | Jump back to the current month | I don't get lost navigating many months |

---

## User Flow

### Accessing Calendar
1. Click **"Calendar"** button (purple) in top navigation on main page
2. Page navigates to `/calendar`
3. Current month displayed by default

### Navigating Months
1. Click **◀** (previous month) or **▶** (next month)
2. Calendar grid updates; todo dots/counts update
3. Click **"Today"** button to jump to current month

### Viewing Todos on Calendar
1. Todos with due dates appear on their respective date cells
2. Color-coded by priority: red (high), yellow (medium), blue (low)
3. Multiple todos on the same day stack or show a count badge
4. Clicking a date (optional) shows a list of todos for that day

### Holiday Display
1. Singapore public holidays appear on the calendar
2. Special visual treatment (e.g., gold background, holiday name label)
3. Helps users identify non-working days

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE holidays (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  date    TEXT NOT NULL UNIQUE,   -- YYYY-MM-DD in Singapore timezone
  name    TEXT NOT NULL,
  year    INTEGER NOT NULL
);

CREATE INDEX idx_holidays_date ON holidays(date);
CREATE INDEX idx_holidays_year ON holidays(year);
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/todos` | Reused — returns todos with due dates for calendar rendering |
| GET | `/api/holidays` | Returns public holidays for a given year |

#### GET /api/holidays

```typescript
// app/api/holidays/route.ts
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const year = request.nextUrl.searchParams.get('year') ?? new Date().getFullYear().toString();
  const holidays = holidayDB.getByYear(Number(year));
  return NextResponse.json({ holidays });
}
```

Response:
```json
{
  "holidays": [
    { "id": 1, "date": "2025-01-01", "name": "New Year's Day", "year": 2025 },
    { "id": 2, "date": "2025-01-29", "name": "Chinese New Year", "year": 2025 }
  ]
}
```

### Database Operations (lib/db.ts)

```typescript
export const holidayDB = {
  getByYear: (year: number): Holiday[] =>
    db.prepare('SELECT * FROM holidays WHERE year = ? ORDER BY date').all(year) as Holiday[],

  getByDateRange: (from: string, to: string): Holiday[] =>
    db.prepare('SELECT * FROM holidays WHERE date >= ? AND date <= ? ORDER BY date').all(from, to) as Holiday[],

  upsert: (data: { date: string; name: string; year: number }): void => {
    db.prepare(
      'INSERT OR REPLACE INTO holidays (date, name, year) VALUES (?, ?, ?)'
    ).run(data.date, data.name, data.year);
  },
};
```

### TypeScript Types

```typescript
// lib/db.ts
export interface Holiday {
  id: number;
  date: string;       // YYYY-MM-DD in SGT
  name: string;
  year: number;
}

// Calendar cell data
export interface CalendarDay {
  date: Date;
  dateStr: string;      // YYYY-MM-DD
  isCurrentMonth: boolean;
  isToday: boolean;
  todos: Todo[];
  holiday: Holiday | null;
}
```

### Calendar Grid Generation

```typescript
// lib/calendar.ts
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const SGT = 'Asia/Singapore';

export function buildCalendarGrid(year: number, month: number, todos: Todo[], holidays: Holiday[]): CalendarDay[][] {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const holidayMap = new Map(holidays.map(h => [h.date, h]));

  // Group todos by date string
  const todoMap = new Map<string, Todo[]>();
  todos.forEach(todo => {
    if (!todo.due_date) return;
    const dateStr = format(toZonedTime(new Date(todo.due_date), SGT), 'yyyy-MM-dd');
    const existing = todoMap.get(dateStr) ?? [];
    todoMap.set(dateStr, [...existing, todo]);
  });

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7).map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      return {
        date,
        dateStr,
        isCurrentMonth: isSameMonth(date, monthStart),
        isToday: isToday(date),
        todos: todoMap.get(dateStr) ?? [],
        holiday: holidayMap.get(dateStr) ?? null,
      };
    });
    weeks.push(week);
  }
  return weeks;
}
```

### Calendar Page Route

```typescript
// app/calendar/page.tsx  ('use client')
// Protected by middleware.ts (same as '/' route)
// Fetches: GET /api/todos + GET /api/holidays?year=YYYY
// Renders: month grid, navigation buttons, todo dots, holiday labels
```

### Middleware Protection

```typescript
// middleware.ts
export const config = {
  matcher: ['/', '/calendar'],
};

export function middleware(request: NextRequest) {
  // Redirect unauthenticated users to /login
}
```

### Holiday Seeding Script

```typescript
// scripts/seed-holidays.ts
// Seeds Singapore public holidays for the current and next year
// Run via: npx tsx scripts/seed-holidays.ts
// Data source: MOM Singapore public holidays API or hardcoded list

const SG_HOLIDAYS_2025 = [
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-29', name: "Chinese New Year" },
  { date: '2025-01-30', name: "Chinese New Year (Day 2)" },
  { date: '2025-03-31', name: "Hari Raya Puasa" },
  { date: '2025-04-18', name: "Good Friday" },
  { date: '2025-05-01', name: "Labour Day" },
  { date: '2025-05-12', name: "Vesak Day" },
  { date: '2025-06-07', name: "Hari Raya Haji" },
  { date: '2025-08-09', name: "National Day" },
  { date: '2025-10-20', name: "Deepavali" },
  { date: '2025-12-25', name: "Christmas Day" },
];
```

---

## UI Components

### Calendar Page (`app/calendar/page.tsx`)
```tsx
// Header: month/year title + ◀ Prev | Today | Next ▶ navigation
// Calendar grid: 7 columns (Sun-Sat), week rows
// Each day cell shows:
//   - Day number (bold if today, muted if other month)
//   - Holiday name (small gold text, if applicable)
//   - Todo dots/chips (color by priority, stacked if multiple)
//   - Overflow indicator: "+N more" if > 3 todos
// "Back to List" or home navigation button
```

### Calendar Day Cell
```tsx
// Today: highlighted border or background
// Other month: muted opacity
// Holiday: light gold background, holiday name in small text
// Todo dots: small colored circles or truncated title chips
//   Red = high, Yellow = medium, Blue = low
```

### "Calendar" Navigation Button (on main page)
```tsx
// Purple button in top navigation
// href="/calendar"
// Always visible on main page
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No todos in a month | Calendar shows empty cells; no error |
| Multiple todos on same day | Stack up to 3 visible; "+N more" indicator for overflow |
| Todo without due date | Not shown on calendar (only todos with due_date appear) |
| Holiday data not seeded | Calendar shows normally without holiday labels |
| Navigating to far future month | Fetches same todos list (already loaded); just renders different month view |
| Completed todos | Shown with muted style or strikethrough on calendar |

---

## Acceptance Criteria

- [ ] Calendar page accessible at `/calendar`
- [ ] "Calendar" button in top navigation on main page
- [ ] Current month displayed by default
- [ ] Correct grid layout: Sunday–Saturday, all weeks of the month
- [ ] Today's date visually highlighted
- [ ] Todos appear on their due dates, color-coded by priority
- [ ] ◀ and ▶ navigation buttons change month
- [ ] "Today" button returns to current month
- [ ] Singapore public holidays displayed with name
- [ ] Days from previous/next month shown in muted style
- [ ] Protected by authentication middleware (redirect to login if unauthenticated)

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/10-calendar.spec.ts
test('navigate to calendar page via Calendar button');
test('current month shown by default');
test('todos with due dates appear on correct date cells');
test('todo color matches priority (high=red, medium=yellow, low=blue)');
test('previous month button navigates back');
test('next month button navigates forward');
test('Today button returns to current month');
test('public holiday name visible on correct date');
```

---

## Out of Scope

- Week or day view (month view only)
- Clicking a date to show todo detail
- Drag-and-drop rescheduling on calendar
- Editing todos from the calendar
- Custom week start day (Sunday assumed)
- Calendar sharing or export
