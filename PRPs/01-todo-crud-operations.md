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
1. User enters title in the main input field at the top of the page
2. Optionally sets due date and priority
3. Clicks **"Add"** button
4. Todo appears immediately in the Pending list (optimistic UI)
5. API confirms creation; UI updates with server data
6. On error: optimistic entry removed, error shown

### Read / List Todos
1. On page load, todos are fetched via `GET /api/todos`
2. Todos display in three sections:
   - **Overdue** — past due date, not completed (red background, ⚠️ icon)
   - **Pending** — future/no due date, not completed
   - **Completed** — marked as done
3. Sort order within each section: Priority (High→Medium→Low) → Due date → Created date

### Update Todo
1. User clicks **"Edit"** button on a todo card
2. Edit modal opens pre-filled with current values
3. User modifies fields and clicks **"Update"**
4. Modal closes; list reflects changes immediately
5. On error: original values restored

### Delete Todo
1. User clicks **"Delete"** button (red) on a todo card
2. Todo immediately deleted — no confirmation dialog
3. Subtasks, tag associations, and reminders cascade-deleted

### Toggle Completion
1. User clicks checkbox on a todo card
2. Checkbox toggles; todo moves between sections (Pending ↔ Completed, or Overdue ↔ Completed)
3. `completed_at` timestamp set/cleared via API

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE todos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  completed             INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
  due_date              TEXT,                         -- ISO 8601 in SGT
  priority              TEXT NOT NULL DEFAULT 'medium', -- 'high' | 'medium' | 'low'
  is_recurring          INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern    TEXT,                         -- 'daily'|'weekly'|'monthly'|'yearly'
  reminder_minutes      INTEGER,                      -- minutes before due date
  last_notification_sent TEXT,                        -- ISO 8601 UTC
  created_at            TEXT NOT NULL,               -- ISO 8601 UTC
  updated_at            TEXT NOT NULL,               -- ISO 8601 UTC
  completed_at          TEXT                         -- ISO 8601 UTC, nullable
);
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/todos` | List all todos for authenticated user |
| POST | `/api/todos` | Create a new todo |
| PUT | `/api/todos/[id]` | Full update of a todo |
| DELETE | `/api/todos/[id]` | Delete a todo |

#### GET /api/todos
- Requires session authentication
- Returns todos owned by `session.userId`
- Response:
```json
{
  "todos": [
    {
      "id": 1,
      "title": "Buy groceries",
      "completed": false,
      "due_date": "2025-11-15T00:00:00+08:00",
      "priority": "medium",
      "created_at": "2025-11-11T10:00:00+08:00",
      "updated_at": "2025-11-11T10:00:00+08:00",
      "completed_at": null
    }
  ]
}
```

#### POST /api/todos
Request body:
```json
{
  "title": "Buy groceries",
  "due_date": "2025-11-15T00:00:00",
  "priority": "medium"
}
```
Response: `201 Created` with created todo object.

#### PUT /api/todos/[id]
Request body: all updatable fields (title, due_date, priority, completed, is_recurring, recurrence_pattern, reminder_minutes).
Response: `200 OK` with updated todo. If `completed: true` and `is_recurring: true`, also creates next instance.

#### DELETE /api/todos/[id]
Response: `204 No Content`

### API Route Pattern (Next.js 16)

```typescript
// app/api/todos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const todos = todoDB.getByUserId(session.userId);
  return NextResponse.json({ todos });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await request.json();
  // validate body...
  const todo = todoDB.create({ ...body, user_id: session.userId });
  return NextResponse.json(todo, { status: 201 });
}
```

### TypeScript Types

```typescript
// Defined in lib/db.ts
export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;        // ISO 8601 with SGT offset
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;             // ISO 8601 UTC
  updated_at: string;             // ISO 8601 UTC
  completed_at: string | null;    // ISO 8601 UTC
}
```

### Timezone Handling

All dates stored as UTC ISO 8601 in the database. Display converted to SGT (UTC+8) using `lib/timezone.ts`:

```typescript
import { getSingaporeNow, formatSingaporeDate } from '@/lib/timezone';

// ALWAYS use getSingaporeNow() instead of new Date()
const now = getSingaporeNow();
```

### Validation Rules

| Field | Rules |
|-------|-------|
| title | Required, 1–255 characters, trimmed, non-empty after trim |
| due_date | Optional, valid ISO date string |
| priority | Optional, one of `'high'`, `'medium'`, `'low'`, defaults to `'medium'` |

---

## UI Components

### Todo Form (top of `app/page.tsx`)
- Text input for title (required)
- Date-time picker (optional)
- Priority dropdown (High/Medium/Low, default Medium)
- "Add" button
- "💾 Save as Template" button (appears when title is non-empty)
- "Use Template" dropdown (if templates exist)

### Todo Card (within each section)
- Checkbox (toggle completion)
- Title text (strikethrough when completed)
- Priority badge (color-coded)
- Due date display (color/urgency-coded)
- Recurrence badge (🔄 if recurring)
- Reminder badge (🔔 if reminder set)
- Tag pills (if any tags)
- Progress bar (if subtasks exist)
- "▶ Subtasks" / "▼ Subtasks" toggle button
- "Edit" button (blue)
- "Delete" button (red)

### Edit Modal
- Pre-filled fields: title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes, tags
- "Update" button
- "Cancel" button

### Due Date Color Coding

| Time Until Due | Color |
|----------------|-------|
| Overdue | Red |
| < 1 hour | Red |
| < 24 hours | Orange |
| < 7 days | Yellow |
| 7+ days | Blue |

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Title is only whitespace | Trimmed to empty, validation rejects with "Title is required" |
| Deleting a todo with subtasks | CASCADE delete all subtasks |
| Empty todo list | Show empty state: "No todos yet — add your first task!" |
| Very long title (> 255 chars) | Frontend caps input at 255; API returns 400 |
| Special characters in title | Stored as-is; escaped when rendered to prevent XSS |
| params in Next.js 16 | Always `const { id } = await params` (params is a Promise) |

---

## Acceptance Criteria

- [ ] User can create a todo with only a title
- [ ] User can create a todo with title, due date, and priority
- [ ] Form validation prevents empty title submission
- [ ] Created todo appears in the list without full page reload
- [ ] User can toggle a todo's completed status via checkbox
- [ ] Completed todos move to the Completed section
- [ ] User can edit any field of an existing todo via edit modal
- [ ] User can delete a todo (immediately, no confirmation)
- [ ] Deleted todo is removed from the list without page reload
- [ ] Todos sorted: High → Medium → Low, then by due date
- [ ] Overdue todos appear in red Overdue section with ⚠️
- [ ] All timestamps display in Singapore time (SGT / UTC+8)
- [ ] API returns proper HTTP status codes (201, 200, 204, 400, 404)
- [ ] All DB operations are synchronous (better-sqlite3, no async/await)

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/02-todo-crud.spec.ts
test('create a todo with title only');
test('create a todo with due date and priority');
test('validation: empty title shows error');
test('toggle todo completion moves to Completed section');
test('edit todo title via edit modal');
test('delete todo removes it from list immediately');
test('overdue todo appears in Overdue section');
test('empty state shown when no todos');
```

### Unit Tests

```typescript
// tests/unit/todo-validation.test.ts
test('rejects empty title');
test('rejects title > 255 chars');
test('trims whitespace from title');
test('accepts valid priority values');
test('rejects invalid priority values');
```

---

## Out of Scope

- Drag-and-drop reordering
- Bulk delete/complete operations
- Undo/redo functionality
- Real-time sync between browser tabs
