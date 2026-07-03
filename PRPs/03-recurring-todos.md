# PRP 03 - Recurring Todos

## Feature Overview

Allows users to mark a todo as recurring on a daily, weekly, monthly, or yearly schedule. When a recurring todo is completed, the system automatically creates the next instance with an incremented due date, inheriting all metadata (priority, tags, description, subtasks) from the completed instance.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Mark a todo as recurring with a frequency | I don't have to manually re-create repeating tasks |
| US-02 | User | See which todos are recurring (visual indicator) | I know which tasks will auto-repeat |
| US-03 | User | Have the next instance appear automatically when I complete a recurring todo | My task list stays up to date without manual effort |
| US-04 | User | Disable recurrence on a todo | I can stop a task from repeating |
| US-05 | User | Edit the recurrence settings of a recurring todo | I can change the frequency if needed |

---

## User Flow

### Setting Up Recurrence
1. User opens the "Add Todo" or "Edit Todo" form
2. A "Repeat" toggle or section is visible
3. User enables recurrence and selects frequency: Daily / Weekly / Monthly / Yearly
4. User sets a start due date (required when recurrence is enabled)
5. User submits the form
6. Todo is created/updated with recurrence metadata

### Completing a Recurring Todo
1. User checks the checkbox on a recurring todo
2. Todo is marked as completed (visual feedback)
3. API call: `PATCH /api/todos/[id]` with `{ completed: true }`
4. Server logic detects `recurring = true` and calculates the next due date
5. A new todo is automatically created with:
   - Same title, description, priority, tags
   - `dueDate` incremented by the recurrence interval
   - `completed = false`
   - `recurringParentId` pointing to the original todo
6. The new todo appears in the list without page reload (returned in API response)

### Editing Recurrence
1. User opens edit form for a recurring todo
2. Recurrence settings are pre-populated
3. User changes frequency (e.g., daily → weekly)
4. Save: only future instances reflect the new frequency; completed instances unchanged

### Disabling Recurrence
1. User opens edit form, toggles off recurrence
2. Save: todo becomes non-recurring; no further auto-creation on complete

---

## Technical Requirements

### Database Schema

```sql
-- Add to todos table (or via migration)
ALTER TABLE todos ADD COLUMN recurring       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE todos ADD COLUMN recurrence_type TEXT;            -- 'daily' | 'weekly' | 'monthly' | 'yearly'
ALTER TABLE todos ADD COLUMN recurrence_parent_id INTEGER;    -- FK to parent todo (nullable)

-- Or include in original CREATE TABLE:
CREATE TABLE todos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  title                 TEXT NOT NULL,
  description           TEXT,
  completed             INTEGER NOT NULL DEFAULT 0,
  due_date              TEXT,
  priority              TEXT NOT NULL DEFAULT 'medium',
  recurring             INTEGER NOT NULL DEFAULT 0,
  recurrence_type       TEXT,
  recurrence_parent_id  INTEGER REFERENCES todos(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  completed_at          TEXT
);
```

### Due Date Calculation Logic

```typescript
// lib/recurrence.ts
import { addDays, addWeeks, addMonths, addYears } from 'date-fns';

export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export function calculateNextDueDate(
  currentDueDate: string,
  recurrenceType: RecurrenceType
): string {
  const date = new Date(currentDueDate);
  let next: Date;

  switch (recurrenceType) {
    case 'daily':
      next = addDays(date, 1);
      break;
    case 'weekly':
      next = addWeeks(date, 1);
      break;
    case 'monthly':
      next = addMonths(date, 1);
      break;
    case 'yearly':
      next = addYears(date, 1);
      break;
    default:
      throw new Error(`Unknown recurrence type: ${recurrenceType}`);
  }

  return next.toISOString();
}
```

### API Endpoint Changes

#### PATCH /api/todos/[id] — Extended Logic for Completion

When `{ completed: true }` is sent and the todo has `recurring = 1`:

1. Mark current todo as complete (set `completed = 1`, `completed_at = NOW()`)
2. Calculate next due date using `calculateNextDueDate(todo.dueDate, todo.recurrenceType)`
3. Create new todo inheriting: `title`, `description`, `priority`, `recurrence_type`, `recurring = 1`
4. Copy tags (insert into `todo_tags` junction table)
5. Copy subtasks (insert into `subtasks` with `todo_id` of new todo, `completed = 0`)
6. Return both the updated (completed) todo and the new (next instance) todo:

```json
{
  "todo": { /* completed todo */ },
  "nextTodo": { /* newly created next instance, null if not recurring */ }
}
```

### TypeScript Types

```typescript
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  // ...existing fields from PRP 01...
  recurring: boolean;
  recurrenceType: RecurrenceType | null;
  recurrenceParentId: number | null;
}

export type CreateTodoInput = {
  // ...existing fields...
  recurring?: boolean;
  recurrenceType?: RecurrenceType;
};
```

### Metadata Inheritance Rules

| Field | Inherited? | Notes |
|-------|-----------|-------|
| title | Yes | Exact copy |
| description | Yes | Exact copy |
| priority | Yes | Exact copy |
| tags | Yes | Junction table rows copied |
| subtasks | Yes | Copied with `completed = false` |
| dueDate | Calculated | Next occurrence date |
| completed | No | Always `false` for new instance |
| completedAt | No | Always `null` for new instance |
| recurrenceParentId | Set | Points to original todo's ID |

---

## UI Components

### RecurrenceToggle
```tsx
// Toggle + frequency selector within TodoForm
// Props: enabled: boolean, type: RecurrenceType | null
//        onChange: (enabled: boolean, type: RecurrenceType | null) => void
// Renders: toggle switch, and when enabled a select: Daily | Weekly | Monthly | Yearly
```

### RecurringBadge
```tsx
// Small icon/badge shown on recurring todo cards (e.g., refresh/loop icon)
// Props: recurrenceType: RecurrenceType
// Shows tooltip on hover: "Repeats daily / weekly / monthly / yearly"
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Recurring todo with no due date | Recurrence requires a due date — validation error if enabled without one |
| Completing a recurring todo mid-chain | Next instance created from completed todo's due date, not from "today" |
| Recurrence parent deleted | `recurrence_parent_id` SET NULL (FK cascade) |
| Monthly recurrence on the 31st | If next month has no 31st, use last day of month (date-fns `addMonths` handles this) |
| User edits next instance directly | Editing next instance does not affect the completed parent |
| Disable recurrence on a todo | Sets `recurring = 0`, `recurrence_type = NULL`; no new instance on next complete |
| Network failure during next-instance creation | Whole PATCH is rolled back; todo stays incomplete |

---

## Acceptance Criteria

- [ ] Recurrence section is visible in the create/edit todo form
- [ ] Recurrence requires a due date — form shows validation error without one
- [ ] Frequency options: Daily, Weekly, Monthly, Yearly
- [ ] Recurring todos display a visual recurring indicator (icon/badge)
- [ ] Completing a recurring todo immediately creates the next instance
- [ ] Next instance has the correct incremented due date
- [ ] Next instance inherits title, description, priority, tags, and subtasks (all subtasks reset to incomplete)
- [ ] Next instance is linked via `recurrenceParentId`
- [ ] Next instance appears in the list without page reload
- [ ] Recurrence can be disabled via the edit form
- [ ] Non-recurring todos are unaffected by this feature
- [ ] API returns both completed todo and next instance in a single response

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/recurring-todos.spec.ts

test('create daily recurring todo', async ({ page }) => { /* ... */ });
test('completing recurring todo creates next instance', async ({ page }) => { /* ... */ });
test('next instance has due date +1 day for daily', async ({ page }) => { /* ... */ });
test('next instance has due date +1 week for weekly', async ({ page }) => { /* ... */ });
test('next instance inherits priority and description', async ({ page }) => { /* ... */ });
test('recurring indicator is visible on todo card', async ({ page }) => { /* ... */ });
test('disable recurrence via edit form', async ({ page }) => { /* ... */ });
test('completing non-recurring todo does not create next instance', async ({ page }) => { /* ... */ });
test('recurrence validation: requires due date', async ({ page }) => { /* ... */ });
```

### Unit Tests

```typescript
// tests/unit/recurrence.test.ts
test('calculateNextDueDate: daily adds 1 day');
test('calculateNextDueDate: weekly adds 7 days');
test('calculateNextDueDate: monthly adds 1 month');
test('calculateNextDueDate: monthly on 31st rolls to last day of next month');
test('calculateNextDueDate: yearly adds 1 year');
test('calculateNextDueDate: throws on unknown type');
```

---

## Out of Scope

- Custom recurrence intervals (e.g., every 3 days)
- Day-of-week selection for weekly recurrence (e.g., "every Monday")
- End date / number of occurrences for recurrence
- Recurring todos without a due date
- Editing "all future instances" vs. "this instance only"

---

## Success Metrics

- Next instance created in same API round trip as completion (< 500 ms)
- 100% metadata inherited (verified by unit tests)
- Zero orphaned next-instances when parent creation fails (transactional)
