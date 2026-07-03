# PRP 01 - Todo CRUD Operations

## Feature Overview

Core create, read, update, and delete functionality for todos. This is the foundational feature upon which all other features are built. Todos are stored in SQLite via `better-sqlite3` and all timestamps are handled in Singapore timezone (Asia/Singapore).

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Create a new todo with a title | I can track tasks I need to complete |
| US-02 | User | View all my todos in a list | I have a clear overview of my work |
| US-03 | User | Edit the title and description of a todo | I can update task details as requirements change |
| US-04 | User | Mark a todo as complete or incomplete | I can track progress |
| US-05 | User | Delete a todo | I can remove tasks no longer needed |
| US-06 | User | See when a todo was created and updated | I can understand the timeline of my tasks |
| US-07 | User | Add a due date to a todo | I can track deadlines |

---

## User Flow

### Create Todo
1. User clicks "Add Todo" / "+" button
2. A form/modal appears with fields: title (required), description (optional), due date (optional)
3. User fills in the title and optionally other fields
4. User submits the form
5. Optimistic UI: todo appears immediately in the list with a pending state
6. API confirms creation; UI updates with actual server data
7. On error: optimistic entry is removed, error toast is shown

### Read / List Todos
1. On page load, todos are fetched via `GET /api/todos`
2. Todos are displayed in a list, sorted by creation date descending
3. Each todo card shows: title, description (truncated), due date, completion status, priority badge

### Update Todo
1. User clicks on a todo card or an edit icon
2. An edit form/modal pre-populated with current values is shown
3. User modifies fields and submits
4. Optimistic UI: list updates immediately
5. API confirms update; UI syncs with server response
6. On error: original values are restored, error toast is shown

### Delete Todo
1. User clicks delete icon on a todo card
2. A confirmation dialog appears: "Are you sure you want to delete this todo?"
3. User confirms
4. Optimistic UI: todo is removed from list immediately
5. API confirms deletion
6. On error: todo is restored, error toast is shown

### Toggle Completion
1. User clicks the checkbox on a todo card
2. Optimistic UI: checkbox toggles and visual style updates (strikethrough text)
3. API call `PATCH /api/todos/[id]` with `{ completed: true/false }`
4. Timestamp `completedAt` is set/cleared accordingly

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  completed   INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
  due_date    TEXT,                         -- ISO 8601 in SGT
  priority    TEXT NOT NULL DEFAULT 'medium', -- 'high' | 'medium' | 'low'
  created_at  TEXT NOT NULL,               -- ISO 8601 UTC
  updated_at  TEXT NOT NULL,               -- ISO 8601 UTC
  completed_at TEXT                        -- ISO 8601 UTC, nullable
);
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/todos` | List all todos (with optional filters) |
| POST | `/api/todos` | Create a new todo |
| GET | `/api/todos/[id]` | Get a single todo |
| PUT | `/api/todos/[id]` | Full update of a todo |
| PATCH | `/api/todos/[id]` | Partial update (e.g., toggle complete) |
| DELETE | `/api/todos/[id]` | Delete a todo |

#### GET /api/todos
Query parameters:
- `completed` — `true` | `false` (filter by completion)
- `priority` — `high` | `medium` | `low`
- `search` — text search on title and description

Response:
```json
{
  "todos": [
    {
      "id": 1,
      "title": "Buy groceries",
      "description": "Milk, bread, eggs",
      "completed": false,
      "dueDate": "2025-11-15T00:00:00+08:00",
      "priority": "medium",
      "createdAt": "2025-11-11T10:00:00+08:00",
      "updatedAt": "2025-11-11T10:00:00+08:00",
      "completedAt": null
    }
  ]
}
```

#### POST /api/todos
Request body:
```json
{
  "title": "Buy groceries",
  "description": "Milk, bread, eggs",
  "dueDate": "2025-11-15",
  "priority": "medium"
}
```

Response: `201 Created` with created todo object.

#### PUT /api/todos/[id]
Request body: same as POST (all fields required).
Response: `200 OK` with updated todo object.

#### PATCH /api/todos/[id]
Request body: partial fields (e.g., `{ "completed": true }`).
Response: `200 OK` with updated todo object.

#### DELETE /api/todos/[id]
Response: `204 No Content`

### TypeScript Types

```typescript
// types/todo.ts
export interface Todo {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  dueDate: string | null;       // ISO 8601 with SGT offset
  priority: 'high' | 'medium' | 'low';
  createdAt: string;            // ISO 8601 UTC
  updatedAt: string;            // ISO 8601 UTC
  completedAt: string | null;   // ISO 8601 UTC
}

export type CreateTodoInput = Pick<Todo, 'title'> &
  Partial<Pick<Todo, 'description' | 'dueDate' | 'priority'>>;

export type UpdateTodoInput = Partial<
  Pick<Todo, 'title' | 'description' | 'dueDate' | 'priority' | 'completed'>
>;
```

### Timezone Handling

All dates are stored as UTC ISO 8601 strings in the database. Display is converted to Singapore time (UTC+8).

```typescript
// lib/timezone.ts
import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';

const SGT = 'Asia/Singapore';

export function toSGT(date: Date | string): Date {
  return toZonedTime(new Date(date), SGT);
}

export function fromSGT(date: Date | string): Date {
  return fromZonedTime(new Date(date), SGT);
}

export function formatSGT(date: Date | string, fmt: string): string {
  return format(toZonedTime(new Date(date), SGT), fmt, { timeZone: SGT });
}

export function nowSGT(): string {
  return new Date().toISOString();
}
```

### Validation Rules

| Field | Rules |
|-------|-------|
| title | Required, 1–255 characters, trimmed, non-empty after trim |
| description | Optional, max 2000 characters |
| dueDate | Optional, valid ISO date string, must not be in the past (on create) |
| priority | Optional, must be one of `'high'`, `'medium'`, `'low'`, defaults to `'medium'` |

---

## UI Components

### TodoList (Client Component — `app/page.tsx`)
```tsx
// Renders the full list of todos
// Props: todos: Todo[], onToggle, onDelete, onEdit
```

### TodoCard
```tsx
// Individual todo card
// Shows: checkbox, title (strikethrough if completed), due date badge, priority badge, action buttons
```

### TodoForm (Create/Edit Modal)
```tsx
// Controlled form with: title input, description textarea, date picker, priority select
// Validation on submit; disables submit button while loading
```

### DeleteConfirmDialog
```tsx
// Confirmation modal before deletion
// Shows todo title so user knows what they are deleting
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Title is only whitespace | Trimmed to empty, validation rejects with "Title is required" |
| Due date in the past (on create) | Show warning but allow — user may be backfilling historical tasks |
| Deleting a todo with subtasks | Cascade delete all subtasks (see PRP 05) |
| Concurrent edits from two browser tabs | Last write wins; `updatedAt` timestamp helps detect staleness |
| Network failure during create | Optimistic entry is rolled back; toast: "Failed to create todo, please retry" |
| Empty todo list | Show empty state: "No todos yet — add your first task!" |
| Very long title (> 255 chars) | Frontend caps input at 255; API returns 400 if exceeded |
| Special characters in title | Stored as-is; escaped when rendered to prevent XSS |

---

## Acceptance Criteria

- [ ] User can create a todo with only a title
- [ ] User can create a todo with title, description, due date, and priority
- [ ] Form validation prevents empty title submission
- [ ] Created todo appears in the list without full page reload
- [ ] User can toggle a todo's completed status via checkbox
- [ ] Completed todos are visually distinguished (e.g., strikethrough, muted color)
- [ ] User can edit any field of an existing todo
- [ ] User can delete a todo via confirmation dialog
- [ ] Deleted todo is removed from the list without page reload
- [ ] All timestamps display in Singapore time (SGT / UTC+8)
- [ ] API returns proper HTTP status codes (201, 200, 204, 400, 404)
- [ ] API returns JSON error messages on 400/404 with `{ error: string }`
- [ ] Database operations are synchronous (no async/await with better-sqlite3)

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/todo-crud.spec.ts

test('create a todo with title only', async ({ page }) => { /* ... */ });
test('create a todo with all fields', async ({ page }) => { /* ... */ });
test('validation: empty title shows error', async ({ page }) => { /* ... */ });
test('toggle todo completion', async ({ page }) => { /* ... */ });
test('edit todo title', async ({ page }) => { /* ... */ });
test('delete todo with confirmation', async ({ page }) => { /* ... */ });
test('cancel delete does not remove todo', async ({ page }) => { /* ... */ });
test('empty state shown when no todos', async ({ page }) => { /* ... */ });
```

### Unit Tests

```typescript
// tests/unit/todo-validation.test.ts
test('rejects empty title');
test('rejects title > 255 chars');
test('accepts valid priority values');
test('rejects invalid priority values');
test('trims whitespace from title');
```

---

## Out of Scope

- Drag-and-drop reordering (not in this PRP)
- Bulk delete/complete operations
- Undo/redo functionality
- Real-time sync between browser tabs (WebSockets)

---

## Success Metrics

- Todo creation completes in < 300 ms (API round trip)
- Zero XSS vulnerabilities in title/description rendering
- 100% of CRUD operations covered by E2E tests
- Optimistic UI updates feel instantaneous (< 16 ms visual response)
