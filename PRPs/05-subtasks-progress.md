# PRP 05 - Subtasks & Progress Tracking

## Feature Overview

Break down complex todos into smaller, manageable subtasks with real-time progress tracking. Each todo can have unlimited subtasks; completing subtasks updates a visual progress bar and text counter. Subtasks cascade-delete when the parent todo is deleted.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Add subtasks to a todo | I can break complex tasks into smaller steps |
| US-02 | User | See a progress bar for a todo with subtasks | I can visually track how much work remains |
| US-03 | User | Mark individual subtasks as complete | I can track incremental progress |
| US-04 | User | Delete individual subtasks | I can remove steps that are no longer needed |
| US-05 | User | Collapse and expand the subtask list | I can keep the view clean |
| US-06 | User | See "X/Y subtasks" text counter | I know exactly how many steps are done |

---

## User Flow

### Creating Subtasks
1. Locate a todo card in any section
2. Click **"▶ Subtasks"** button to expand
3. Enter subtask title in the input field
4. Press **Enter** or click **"Add"** button
5. Subtask appears immediately in the list
6. Repeat for additional subtasks

### Managing Subtasks
- **Complete**: Click the checkbox next to a subtask → moves to completed state
- **Uncomplete**: Click the checked checkbox → returns to incomplete
- **Delete**: Click the **✕** button on the right side of a subtask
- **Collapse**: Click **"▼ Subtasks"** to hide the subtask list (progress bar remains visible)

### Progress Tracking
- Progress bar and "X/Y subtasks" text always visible below the todo title (when subtasks exist), even when list is collapsed
- Bar fills proportionally to completed/total subtasks
- Updates in real-time after each subtask toggle

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE subtasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id    INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  completed  INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
  position   INTEGER NOT NULL DEFAULT 0,  -- ordering index
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_subtasks_todo_id ON subtasks(todo_id);
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/todos/[id]/subtasks` | List all subtasks for a todo |
| POST | `/api/todos/[id]/subtasks` | Create a new subtask |
| PUT | `/api/todos/[id]/subtasks/[subtaskId]` | Update subtask (toggle complete, rename) |
| DELETE | `/api/todos/[id]/subtasks/[subtaskId]` | Delete a subtask |

#### POST /api/todos/[id]/subtasks

```typescript
// Request body
{ "title": "Write unit tests" }

// Response: 201 Created
{
  "id": 42,
  "todo_id": 7,
  "title": "Write unit tests",
  "completed": false,
  "position": 3,
  "created_at": "2025-11-11T10:00:00Z",
  "updated_at": "2025-11-11T10:00:00Z"
}
```

#### PUT /api/todos/[id]/subtasks/[subtaskId]

```typescript
// Toggle completion
{ "completed": true }

// Response: 200 OK with updated subtask
```

#### DELETE /api/todos/[id]/subtasks/[subtaskId]

Response: `204 No Content`

### Database Operations (lib/db.ts)

```typescript
export const subtaskDB = {
  getByTodoId: (todoId: number): Subtask[] =>
    db.prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position, created_at').all(todoId) as Subtask[],

  create: (data: CreateSubtaskInput): Subtask => {
    const maxPos = db.prepare('SELECT MAX(position) as m FROM subtasks WHERE todo_id = ?').get(data.todo_id) as { m: number | null };
    const position = (maxPos.m ?? -1) + 1;
    const now = getSingaporeNow().toISOString();
    const result = db.prepare(
      'INSERT INTO subtasks (todo_id, title, completed, position, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)'
    ).run(data.todo_id, data.title, position, now, now);
    return subtaskDB.getById(result.lastInsertRowid as number);
  },

  update: (id: number, data: Partial<Subtask>): Subtask => {
    const now = getSingaporeNow().toISOString();
    db.prepare('UPDATE subtasks SET completed = ?, updated_at = ? WHERE id = ?')
      .run(data.completed ? 1 : 0, now, id);
    return subtaskDB.getById(id);
  },

  delete: (id: number): void => {
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);
  },
};
```

### TypeScript Types

```typescript
// lib/db.ts
export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSubtaskInput {
  todo_id: number;
  title: string;
}

// Extended Todo type used on client
export interface TodoWithSubtasks extends Todo {
  subtasks: Subtask[];
}
```

### Progress Calculation

```typescript
// lib/progress.ts
export function calculateProgress(subtasks: Subtask[]): { completed: number; total: number; percent: number } {
  const total = subtasks.length;
  const completed = subtasks.filter(s => s.completed).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}
```

### Fetching Subtasks

Subtasks are fetched alongside todos. The `GET /api/todos` response includes `subtasks` array for each todo, or subtasks are fetched lazily on expand. Recommended: eager load via JOIN for performance.

```sql
SELECT s.* FROM subtasks s WHERE s.todo_id IN (SELECT id FROM todos WHERE user_id = ?)
ORDER BY s.todo_id, s.position, s.created_at
```

### Cascade Delete

Defined via `ON DELETE CASCADE` on `subtasks.todo_id` FK. When a todo is deleted, all its subtasks are automatically removed — no application-level handling needed.

---

## UI Components

### Subtask Toggle Button (on todo card)
```tsx
// "▶ Subtasks" (collapsed) / "▼ Subtasks" (expanded)
// Shows (X) count when collapsed: "▶ Subtasks (3)"
// Located on right side of todo card
```

### Progress Bar + Counter (always visible when subtasks exist)
```tsx
// Below todo title, above the expand/collapse area
// Blue progress bar: width = `${percent}%`
// Text: "3/7 subtasks" — updates in real-time
// Visible even when subtask list is collapsed
```

### Subtask List (shown when expanded)
```tsx
// Each subtask row:
//   [ checkbox ] [ title ] [ ✕ delete button ]
// Completed subtasks: strikethrough text, muted color
// Add subtask form at the bottom:
//   [ text input ] [ Add button ]
//   Pressing Enter also adds
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Subtask title is empty | Validation rejects; show inline error |
| Parent todo deleted | All subtasks CASCADE deleted automatically |
| 0 subtasks | Progress bar and counter not shown at all |
| All subtasks completed | Progress bar shows 100% (full blue) |
| Completing subtask doesn't auto-complete parent | Parent completion is independent |
| Recurring todo completion | Subtasks are NOT copied to next instance (start fresh) |
| Subtask on a completed todo | Still manageable (user can uncomplete parent to re-work) |

---

## Acceptance Criteria

- [ ] "▶ Subtasks" button visible on every todo card
- [ ] Clicking expands/collapses subtask list
- [ ] Can add a subtask by pressing Enter or clicking "Add"
- [ ] Empty subtask title is rejected
- [ ] Subtask checkbox toggles completion (strikethrough when done)
- [ ] "✕" button deletes a subtask immediately
- [ ] Progress bar visible below todo title (when subtasks exist)
- [ ] Progress bar % updates in real-time after toggle
- [ ] "X/Y subtasks" text shows correct counts
- [ ] Progress bar and counter remain visible when list is collapsed
- [ ] Deleting parent todo removes all its subtasks (CASCADE)
- [ ] Subtasks included in search (feature 08)

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/05-subtasks.spec.ts
test('add subtask to a todo');
test('subtask appears in expanded list');
test('toggle subtask complete shows strikethrough');
test('progress bar updates after toggle');
test('X/Y subtasks text updates correctly');
test('delete subtask removes it from list');
test('collapse hides subtask list but shows progress');
test('empty subtask title is rejected');
```

### Unit Tests

```typescript
// tests/unit/progress.test.ts
test('calculateProgress: 0 subtasks returns 0%');
test('calculateProgress: all completed returns 100%');
test('calculateProgress: partial returns correct percent');
test('calculateProgress: rounds to nearest integer');
```

---

## Out of Scope

- Drag-and-drop reorder of subtasks
- Nested subtasks (subtasks of subtasks)
- Subtask due dates or priorities
- Copying subtasks to next recurring instance
