# PRP 03 - Recurring Todos

## Feature Overview

Allows users to mark a todo as recurring on a daily, weekly, monthly, or yearly schedule. When a recurring todo is completed, the system automatically creates the next instance with an incremented due date, inheriting all metadata (priority, tags, reminder) from the completed instance.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Mark a todo as recurring with a frequency | I don't have to manually re-create repeating tasks |
| US-02 | User | See which todos are recurring | I know which tasks will auto-repeat |
| US-03 | User | Have the next instance appear automatically when I complete a recurring todo | My task list stays up to date |
| US-04 | User | Disable recurrence on a todo | I can stop a task from repeating |
| US-05 | User | Edit the recurrence settings | I can change the frequency if needed |

---

## User Flow

### Setting Up Recurrence
1. User opens "Add Todo" or "Edit Todo" form
2. Checks the **"Repeat"** checkbox
3. A recurrence pattern dropdown appears: Daily / Weekly / Monthly / Yearly
4. User selects frequency
5. **Due date is required** — form shows validation error without one
6. User submits; todo saved with `is_recurring = 1` and `recurrence_pattern` set

### Completing a Recurring Todo
1. User clicks checkbox on a recurring todo
2. API call: `PUT /api/todos/[id]` with `{ completed: true }`
3. Server detects `is_recurring = 1`, calculates next due date
4. Atomically marks current todo complete AND creates next instance
5. Next instance inherits: title, priority, recurrence settings, reminder, tags
6. Both updated todo and new todo returned in response
7. New instance appears in list immediately (no page reload)

### Disabling Recurrence
1. User clicks "Edit" on a recurring todo
2. Unchecks the "Repeat" checkbox
3. Clicks "Update"
4. `is_recurring = 0`, `recurrence_pattern = NULL`
5. No new instance created on next completion

---

## Technical Requirements

### Database Schema

```sql
-- Columns on todos table (see PRP 01 for full schema)
is_recurring       INTEGER NOT NULL DEFAULT 0,         -- 0 = false, 1 = true
recurrence_pattern TEXT                                -- 'daily'|'weekly'|'monthly'|'yearly'
```

### Due Date Calculation Logic

```typescript
// lib/recurrence.ts
import { addDays, addWeeks, addMonths, addYears } from 'date-fns';
import { getSingaporeNow } from '@/lib/timezone';

export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern
): string {
  const date = new Date(currentDueDate);
  switch (pattern) {
    case 'daily':   return addDays(date, 1).toISOString();
    case 'weekly':  return addWeeks(date, 1).toISOString();
    case 'monthly': return addMonths(date, 1).toISOString();
    case 'yearly':  return addYears(date, 1).toISOString();
    default:
      throw new Error(`Unknown recurrence pattern: ${pattern}`);
  }
}
```

### API — Completion with Recurrence (`PUT /api/todos/[id]`)

When `{ completed: true }` is sent and `todo.is_recurring = 1`:

```typescript
// app/api/todos/[id]/route.ts (PUT handler excerpt)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const now = getSingaporeNow().toISOString();

  const todo = todoDB.getById(Number(id), session.userId);
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = todoDB.update(Number(id), { ...body, updated_at: now });

  let nextTodo = null;
  if (body.completed && todo.is_recurring && todo.recurrence_pattern && todo.due_date) {
    const nextDueDate = calculateNextDueDate(todo.due_date, todo.recurrence_pattern);
    nextTodo = todoDB.create({
      user_id: session.userId,
      title: todo.title,
      priority: todo.priority,
      is_recurring: 1,
      recurrence_pattern: todo.recurrence_pattern,
      reminder_minutes: todo.reminder_minutes ?? null,
      due_date: nextDueDate,
      completed: 0,
    });
    // Copy tags to next instance
    const tags = tagDB.getByTodoId(todo.id);
    tags.forEach(tag => tagDB.addToTodo(nextTodo.id, tag.id));
  }

  return NextResponse.json({ todo: updated, nextTodo });
}
```

### Metadata Inheritance Rules

| Field | Inherited? | Notes |
|-------|-----------|-------|
| title | Yes | Exact copy |
| priority | Yes | Exact copy |
| is_recurring | Yes | Always `1` |
| recurrence_pattern | Yes | Exact copy |
| reminder_minutes | Yes | Exact copy (use `?? null`) |
| tags | Yes | Junction table rows copied |
| due_date | Calculated | Next occurrence date |
| completed | No | Always `0` |
| completed_at | No | Always `null` |

### TypeScript Types

```typescript
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

// Part of Todo interface in lib/db.ts
is_recurring: boolean;
recurrence_pattern: RecurrencePattern | null;
```

---

## UI Components

### Recurrence Toggle + Pattern Select (in todo form and edit modal)
```tsx
// Checkbox: "Repeat"
// When checked, shows pattern <select>: Daily | Weekly | Monthly | Yearly
// Requires due_date — shows inline warning "Recurring todos require a due date" if not set
```

### Recurrence Badge (on todo card)
```tsx
// Purple badge with 🔄 icon + pattern text
// Example: "🔄 weekly"
// Tooltip on hover: "Repeats weekly"
// Adapts colors in dark mode
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Recurring todo with no due date | Validation error: "Recurring todos require a due date" |
| Completing recurring todo mid-chain | Next instance uses completed todo's due date, not today |
| Monthly recurrence on the 31st | `date-fns addMonths` handles gracefully (rolls to last day) |
| Network failure during next-instance creation | Whole PUT is atomic; todo stays incomplete on error |
| Disable recurrence via edit | Sets `is_recurring = 0`, `recurrence_pattern = NULL`; no new instance created |
| User edits next instance directly | Does not affect the completed parent |

---

## Acceptance Criteria

- [ ] "Repeat" checkbox visible in create and edit forms
- [ ] Recurrence requires a due date — validation error shown without one
- [ ] Frequency options: Daily, Weekly, Monthly, Yearly
- [ ] Recurring todos display 🔄 badge with pattern (e.g., "🔄 weekly")
- [ ] Completing a recurring todo creates next instance in same API response
- [ ] Next instance has correct incremented due date
- [ ] Next instance inherits title, priority, recurrence settings, reminder, and tags
- [ ] Next instance appears in list without page reload
- [ ] Recurrence can be disabled via edit form
- [ ] Non-recurring todos unaffected

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/03-recurring.spec.ts
test('create daily recurring todo requires due date');
test('recurring todo shows 🔄 badge with pattern');
test('completing recurring todo creates next instance');
test('next instance due date is +1 day for daily');
test('next instance due date is +1 week for weekly');
test('next instance inherits priority');
test('disable recurrence via edit form removes badge');
```

### Unit Tests

```typescript
// tests/unit/recurrence.test.ts
test('calculateNextDueDate: daily adds 1 day');
test('calculateNextDueDate: weekly adds 7 days');
test('calculateNextDueDate: monthly adds 1 month');
test('calculateNextDueDate: monthly on 31st rolls to last day');
test('calculateNextDueDate: yearly adds 1 year');
test('calculateNextDueDate: throws on unknown pattern');
```

---

## Out of Scope

- Custom recurrence intervals (e.g., every 3 days)
- Day-of-week selection for weekly recurrence
- End date / number of occurrences
- Editing "all future instances" vs. "this instance only"
- Recurring todos without a due date
