# PRP 10 - Calendar View

## Feature Overview

A monthly calendar view that visualizes todos by their due date. Users can navigate between months, see Singapore public holidays highlighted, and click on a date to see the todos due that day. The calendar provides a temporal perspective to complement the default list view.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | See a monthly calendar with my todos plotted by due date | I can understand my workload spread across the month |
| US-02 | User | Navigate to previous and next months | I can see past and future task schedules |
| US-03 | User | See Singapore public holidays highlighted on the calendar | I can plan around official holidays |
| US-04 | User | Click on a date to see all todos due that day | I can get details for a specific day |
| US-05 | User | See how many todos are due on each date at a glance | I can quickly identify busy and free days |

---

## User Flow

### Viewing the Calendar
1. User clicks "Calendar" in the navigation
2. A monthly calendar grid is displayed showing the current month in SGT
3. Each day cell shows:
   - Date number
   - Small colored dots or todo count badges for todos due that day
   - Holiday name label (if a Singapore public holiday)
4. Today's date is highlighted with a distinct style

### Navigating Between Months
1. "←" and "→" buttons on either side of the month/year heading
2. Clicking navigates to previous/next month
3. Calendar updates without full page reload
4. A "Today" button returns to the current month

### Clicking a Date
1. User clicks on a date cell that has todos
2. A panel or modal opens showing: "Todos due on [Day, DD Month YYYY]"
3. Lists all todos due that day with priority badges and completion status
4. User can toggle todo completion directly from this panel
5. User can click a todo to navigate to its edit form

### Singapore Public Holidays
- Public holidays are hardcoded for the current year + next 2 years
- Holidays are shown with a distinct background color (e.g., light red/pink)
- Holiday name shown in small text in the day cell
- Holidays do not block todo assignment to those dates

---

## Technical Requirements

### Calendar Grid Generation

```typescript
// lib/calendar.ts
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  getMonth, getYear
} from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const SGT = 'Asia/Singapore';

export interface CalendarDay {
  date: Date;              // in SGT
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  holiday: SingaporeHoliday | null;
  todos: Todo[];
}

export function buildCalendarGrid(year: number, month: number, todos: Todo[]): CalendarDay[][] {
  const firstDay = new Date(year, month, 1);
  const start = startOfWeek(startOfMonth(firstDay), { weekStartsOn: 1 }); // week starts Monday
  const end = endOfWeek(endOfMonth(firstDay), { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start, end });

  const grid: CalendarDay[][] = [];
  let week: CalendarDay[] = [];

  for (const day of days) {
    const daySGT = toZonedTime(day, SGT);
    const todosOnDay = todos.filter((t) => {
      if (!t.dueDate) return false;
      return isSameDay(toZonedTime(new Date(t.dueDate), SGT), daySGT);
    });

    week.push({
      date: daySGT,
      isCurrentMonth: isSameMonth(daySGT, firstDay),
      isToday: isToday(daySGT),
      isWeekend: daySGT.getDay() === 0 || daySGT.getDay() === 6,
      holiday: getSingaporeHoliday(daySGT),
      todos: todosOnDay,
    });

    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
  }

  return grid;
}
```

### Singapore Public Holidays

```typescript
// lib/singapore-holidays.ts
export interface SingaporeHoliday {
  date: string; // 'YYYY-MM-DD' in SGT
  name: string;
}

// Hardcoded for 2025, 2026, 2027
// Source: https://www.mom.gov.sg/employment-practices/public-holidays
export const SINGAPORE_HOLIDAYS: SingaporeHoliday[] = [
  // 2025
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-29', name: 'Chinese New Year' },
  { date: '2025-01-30', name: 'Chinese New Year' },
  { date: '2025-03-31', name: 'Hari Raya Puasa' },
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-05-01', name: 'Labour Day' },
  { date: '2025-05-12', name: 'Vesak Day' },
  { date: '2025-06-06', name: 'Hari Raya Haji' },
  { date: '2025-08-09', name: 'National Day' },
  { date: '2025-10-20', name: 'Deepavali' },
  { date: '2025-12-25', name: 'Christmas Day' },
  // 2026
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-02-17', name: 'Chinese New Year' },
  { date: '2026-02-18', name: 'Chinese New Year' },
  { date: '2026-03-20', name: 'Hari Raya Puasa' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-05-31', name: 'Vesak Day' },
  { date: '2026-05-27', name: 'Hari Raya Haji' },
  { date: '2026-08-09', name: 'National Day' },
  { date: '2026-11-08', name: 'Deepavali' },
  { date: '2026-12-25', name: 'Christmas Day' },
];

export function getSingaporeHoliday(date: Date): SingaporeHoliday | null {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return SINGAPORE_HOLIDAYS.find((h) => h.date === dateStr) ?? null;
}
```

### Month Navigation State

```typescript
// State in CalendarPage component
const [viewYear, setViewYear] = useState<number>(() => {
  const nowSGT = toZonedTime(new Date(), SGT);
  return nowSGT.getFullYear();
});
const [viewMonth, setViewMonth] = useState<number>(() => {
  const nowSGT = toZonedTime(new Date(), SGT);
  return nowSGT.getMonth(); // 0-indexed
});

function prevMonth() {
  if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
  else setViewMonth(m => m - 1);
}

function nextMonth() {
  if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
  else setViewMonth(m => m + 1);
}
```

### API Considerations

No new API endpoints needed. The calendar uses the existing `GET /api/todos` to fetch all todos and filters/groups them client-side.

For performance with large datasets, optionally add:
- `GET /api/todos?month=YYYY-MM` — returns only todos with a due date in the specified month ± 1 week (for calendar overflow)

### TypeScript Types

```typescript
// types/calendar.ts
export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  holiday: SingaporeHoliday | null;
  todos: Todo[];
}

export interface SingaporeHoliday {
  date: string;
  name: string;
}
```

---

## UI Components

### CalendarView (Page Component)
```tsx
// Main calendar page
// State: viewYear, viewMonth, selectedDate, todos
// Fetches all todos on mount; builds grid client-side
// Renders: CalendarHeader, CalendarGrid, DayDetailPanel
```

### CalendarHeader
```tsx
// Shows: "← November 2025 →" with "Today" button
// Props: year: number, month: number, onPrev, onNext, onToday
```

### CalendarGrid
```tsx
// 7-column grid (Mon–Sun)
// Day-of-week headers: Mon Tue Wed Thu Fri Sat Sun
// Props: grid: CalendarDay[][], onDayClick: (day: CalendarDay) => void
```

### CalendarDayCell
```tsx
// Individual day cell in the grid
// Shows: date number, todo dots/count, holiday name
// Props: day: CalendarDay, isSelected: boolean, onClick: () => void
// Styles:
//   - Current month: normal background
//   - Other month: muted/greyed
//   - Today: distinct highlight (e.g., indigo circle around number)
//   - Holiday: light red/pink background, holiday name in small red text
//   - Selected: border or deeper highlight
// Todo indicators: up to 3 colored dots (one per priority color), then "+N more"
```

### DayDetailPanel
```tsx
// Slide-in panel or modal showing todos for selected date
// Props: date: Date, todos: Todo[], onClose, onToggle, onEdit
// Shows: "Tuesday, 15 November 2025" heading
// Lists todos with PriorityBadge, completion checkbox, title
// If holiday: shows holiday name banner at top
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Month has no todos with due dates | All day cells are empty; no errors |
| Todo due on a Sunday | Displayed in Sunday column; no special treatment |
| Todo due on a public holiday | Shown normally; holiday highlight does not affect todo display |
| Selected date has no todos | DayDetailPanel shows "No todos due on this day" |
| Navigating to year with no holidays data | No holiday labels shown; graceful fallback |
| Todo without due date | Not shown on calendar; remains in list view only |
| Month spans 4 or 6 weeks | Calendar grid adapts (4, 5, or 6 rows) |
| Today is shown on a different month | "Today" button returns to today's month |

---

## Acceptance Criteria

- [ ] Calendar displays a monthly grid (Mon–Sun columns)
- [ ] Day-of-week headers shown (Mon to Sun)
- [ ] Today's date is highlighted distinctly
- [ ] Todos with due dates appear on their correct date cells
- [ ] Up to 3 priority-colored dots shown per day; "+N more" for overflow
- [ ] Singapore public holidays are highlighted and labeled
- [ ] Clicking a date opens a detail panel showing that day's todos
- [ ] Detail panel shows todo title, priority, completion status
- [ ] User can toggle todo completion from the detail panel
- [ ] "←" and "→" navigate months correctly
- [ ] "Today" button returns to the current month
- [ ] Days outside the current month are shown in muted/grey style
- [ ] No API error when viewing a month with no todos
- [ ] All date comparisons use Singapore timezone

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/calendar.spec.ts

test('calendar shows current month by default', async ({ page }) => { /* ... */ });
test('navigate to next month', async ({ page }) => { /* ... */ });
test('navigate to previous month', async ({ page }) => { /* ... */ });
test('Today button returns to current month', async ({ page }) => { /* ... */ });
test('todo with due date appears on correct day cell', async ({ page }) => { /* ... */ });
test('click date with todos opens detail panel', async ({ page }) => { /* ... */ });
test('toggle todo completion from detail panel', async ({ page }) => { /* ... */ });
test('public holiday highlighted on calendar', async ({ page }) => { /* ... */ });
test('empty day shows no todos in detail panel', async ({ page }) => { /* ... */ });
```

### Unit Tests

```typescript
// tests/unit/calendar.test.ts
test('buildCalendarGrid: returns 4–6 weeks of days');
test('buildCalendarGrid: first column is Monday');
test('buildCalendarGrid: marks today correctly');
test('buildCalendarGrid: marks isCurrentMonth correctly for overflow days');
test('buildCalendarGrid: assigns todos to correct day');
test('getSingaporeHoliday: returns correct holiday for known date');
test('getSingaporeHoliday: returns null for non-holiday');
```

---

## Out of Scope

- Week or day view
- Drag-and-drop to change due dates on calendar
- Adding new todos directly from the calendar
- iCal / Google Calendar sync
- Multi-year holiday data (beyond hardcoded 2 years ahead)

---

## Success Metrics

- Calendar renders within 300 ms of page load
- Month navigation is instant (< 50 ms, client-side re-render)
- All Singapore 2025–2026 public holidays correctly displayed
- All date assignments accurate to SGT timezone
