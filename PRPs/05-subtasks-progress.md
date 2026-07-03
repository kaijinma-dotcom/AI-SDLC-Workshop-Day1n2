# PRP 05 - Subtasks & Progress Tracking

## Feature Overview

Allows users to break a todo into a checklist of subtasks. Each subtask has a title and a completion state. A visual progress bar on the todo card shows the percentage of completed subtasks. Subtasks have an explicit position for ordering, and deleting a parent todo cascades to all its subtasks.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Add subtasks to a todo | I can break down complex tasks into smaller steps |
| US-02 | User | Check off individual subtasks | I can track partial completion |
| US-03 | User | See a progress bar showing how many subtasks are done | I can gauge how close I am to finishing |
| US-04 | User | Reorder subtasks | I can prioritize steps within a task |
| US-05 | User | Delete a subtask | I can remove steps that are no longer needed |
| US-06 | User | See subtask count on the todo card | I know how many steps are involved at a glance |

---

## User Flow

### Adding Subtasks
1. User opens the create or edit todo form
2. A "Subtasks" section is visible at the bottom of the form
3. User clicks "+ Add subtask" and types the subtask title
4. Pressing Enter or clicking "Add" creates the subtask and focuses the next input
5. Multiple subtasks can be added before saving

### Checking Off Subtasks
1. On the todo detail view or within an expanded todo card, subtasks are listed as checkboxes
2. User clicks a checkbox to toggle a subtask's completion
3. Optimistic UI: checkbox toggles immediately
4. API: `PATCH /api/todos/[todoId]/subtasks/[subtaskId]` with `{ completed: true/false }`
5. Progress bar updates to reflect new completion percentage

### Progress Bar
- Formula: `(completedSubtasks / totalSubtasks) * 100`
- Shown on the todo card when `totalSubtasks > 0`
- Color: green when 100%, blue/indigo otherwise
- Text label: "X / Y subtasks"

### Reordering Subtasks
1. Subtasks have drag handles (or up/down arrow buttons)
2. On reorder: `PUT /api/todos/[todoId]/subtasks/reorder` with ordered array of subtask IDs
3. The `position` field of each subtask is updated accordingly

### Deleting a Subtask
1. User clicks the delete icon next to a subtask
2. No confirmation needed (subtask deletion is low-risk)
3. Subtask is removed from the list; progress bar recalculates

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE subtasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id    INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  completed  INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_subtasks_todo_id ON subtasks(todo_id);
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/todos/[todoId]/subtasks` | List all subtasks for a todo |
| POST | `/api/todos/[todoId]/subtasks` | Create a new subtask |
| PATCH | `/api/todos/[todoId]/subtasks/[id]` | Toggle completion or update title |
| PUT | `/api/todos/[todoId]/subtasks/reorder` | Reorder subtasks |
| DELETE | `/api/todos/[todoId]/subtasks/[id]` | Delete a subtask |

#### GET /api/todos/[todoId]/subtasks

Response:
```json
{
  "subtasks": [
    {
      "id": 1,
      "todoId": 42,
      "title": "Write unit tests",
      "completed": false,
      "position": 0,
      "createdAt": "2025-11-11T10:00:00Z",
      "updatedAt": "2025-11-11T10:00:00Z"
    }
  ]
}
```

Ordered by `position ASC`.

#### POST /api/todos/[todoId]/subtasks

Request body:
```json
{ "title": "Write unit tests" }
```

Position is set to `MAX(position) + 1` for the given `todo_id`.
Response: `201 Created` with new subtask.

#### PATCH /api/todos/[todoId]/subtasks/[id]

Request body:
```json
{ "completed": true }
// or
{ "title": "Updated title" }
```

Response: `200 OK` with updated subtask.

#### PUT /api/todos/[todoId]/subtasks/reorder

Request body:
```json
{ "orderedIds": [3, 1, 2] }
```

Updates `position` of each subtask based on array index.
Response: `200 OK` with `{ success: true }`.

#### DELETE /api/todos/[todoId]/subtasks/[id]

Response: `204 No Content`.
Positions are NOT renumbered on delete (gaps are acceptable; ordering is by position value).

### Progress Calculation

```typescript
// lib/subtasks.ts
export interface SubtaskProgress {
  total: number;
  completed: number;
  percentage: number; // 0–100, rounded to nearest integer
}

export function calculateProgress(subtasks: Subtask[]): SubtaskProgress {
  const total = subtasks.length;
  const completed = subtasks.filter((s) => s.completed).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percentage };
}
```

### TypeScript Types

```typescript
// types/subtask.ts
export interface Subtask {
  id: number;
  todoId: number;
  title: string;
  completed: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateSubtaskInput = { title: string };
export type UpdateSubtaskInput = Partial<Pick<Subtask, 'title' | 'completed'>>;

// Extend Todo type
export interface TodoWithSubtasks extends Todo {
  subtasks: Subtask[];
}
```

### Cascade Delete Behavior

`REFERENCES todos(id) ON DELETE CASCADE` ensures that when a parent todo is deleted, all its subtasks are automatically removed by SQLite. No application-level cascade code needed.

### Validation Rules

| Field | Rules |
|-------|-------|
| title | Required, 1–500 characters, trimmed |
| completed | Boolean only |
| position | Non-negative integer |
| orderedIds | Array of integers, all must belong to the given `todo_id` |

---

## UI Components

### SubtaskList
```tsx
// Renders the list of subtasks for a todo
// Props: subtasks: Subtask[], todoId: number
//        onToggle, onDelete, onReorder, onAdd
interface SubtaskListProps {
  subtasks: Subtask[];
  todoId: number;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  onAdd: (title: string) => void;
}
```

### SubtaskItem
```tsx
// Individual subtask row: checkbox, title, drag handle, delete button
// Completed subtask: strikethrough title, muted color
interface SubtaskItemProps {
  subtask: Subtask;
  onToggle: (completed: boolean) => void;
  onDelete: () => void;
}
```

### SubtaskProgressBar
```tsx
// Visual progress bar + "X / Y subtasks" label
// Props: progress: SubtaskProgress
// Color: indigo normally, green at 100%
interface SubtaskProgressBarProps {
  progress: SubtaskProgress;
}
```

### SubtaskAddInput
```tsx
// Inline input for adding a new subtask
// Submits on Enter key or Add button click
// Clears and focuses after submission
interface SubtaskAddInputProps {
  onAdd: (title: string) => void;
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Todo has no subtasks | Progress bar is hidden; no "0/0 subtasks" shown |
| All subtasks completed | Progress bar shows 100%, colored green |
| Subtask title is whitespace only | Validation error: "Subtask title is required" |
| Deleting last subtask | Progress bar disappears; parent todo unchanged |
| Reorder request with missing IDs | 400 Bad Request: "orderedIds must contain all subtask IDs for this todo" |
| Reorder request with foreign subtask IDs | 400 Bad Request: "Subtask does not belong to this todo" |
| Parent todo deleted | All subtasks cascade deleted (FK constraint) |
| 100+ subtasks on one todo | List is scrollable; no pagination needed at this scale |
| Recurring todo completion copies subtasks | All subtasks copied to new instance with `completed = false` (see PRP 03) |

---

## Acceptance Criteria

- [ ] Subtasks section is visible in the todo form (create and edit)
- [ ] User can add multiple subtasks before saving
- [ ] Subtasks are listed ordered by `position`
- [ ] User can toggle subtask completion via checkbox
- [ ] Optimistic UI updates checkbox without waiting for API
- [ ] Progress bar shows correct percentage (e.g., "2 / 4 subtasks", 50%)
- [ ] Progress bar is hidden when todo has no subtasks
- [ ] Progress bar turns green at 100%
- [ ] User can delete a subtask (no confirmation required)
- [ ] Deleting parent todo removes all subtasks (cascade)
- [ ] Subtask title max 500 characters enforced
- [ ] Empty subtask title is rejected with validation error
- [ ] Reorder updates positions correctly
- [ ] `ON DELETE CASCADE` verified by DB constraint test

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/subtasks.spec.ts

test('add subtask to existing todo', async ({ page }) => { /* ... */ });
test('multiple subtasks can be added', async ({ page }) => { /* ... */ });
test('toggle subtask completion', async ({ page }) => { /* ... */ });
test('progress bar shows 50% with 1 of 2 complete', async ({ page }) => { /* ... */ });
test('progress bar shows 100% and turns green', async ({ page }) => { /* ... */ });
test('delete subtask', async ({ page }) => { /* ... */ });
test('delete parent todo removes subtasks', async ({ page }) => { /* ... */ });
test('empty subtask title shows validation error', async ({ page }) => { /* ... */ });
```

### Unit Tests

```typescript
// tests/unit/subtasks.test.ts
test('calculateProgress: 0/0 returns 0%');
test('calculateProgress: 1/2 returns 50%');
test('calculateProgress: 4/4 returns 100%');
test('calculateProgress: rounds to nearest integer');
```

---

## Out of Scope

- Nested subtasks (sub-subtasks)
- Subtask due dates or priorities
- Subtask assignments to users
- Bulk toggle (complete all subtasks at once)

---

## Success Metrics

- Progress bar updates within one render cycle of subtask toggle
- Cascade delete verified via DB constraint (not application code)
- All subtask operations covered by E2E tests
- Subtask list renders within 200 ms for up to 50 subtasks
