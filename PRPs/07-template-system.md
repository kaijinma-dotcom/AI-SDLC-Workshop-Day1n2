# PRP 07 - Template System

## Feature Overview

Allows users to save existing todos as reusable templates and create new todos from those templates. Templates capture the title, description, priority, and subtasks of a todo. When creating a todo from a template, a due date offset can be applied (e.g., "due 3 days from now"). Templates can be organized into categories.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Save a todo as a template | I can reuse recurring task structures |
| US-02 | User | Create a new todo from a template | I don't have to manually re-enter repeated task details |
| US-03 | User | Set a due date offset when using a template | The new todo's due date is automatically calculated |
| US-04 | User | Browse and select templates by category | I can find relevant templates quickly |
| US-05 | User | Edit or delete a template | I can keep my template library up to date |

---

## User Flow

### Saving a Todo as a Template
1. User opens an existing todo's action menu (or a dedicated "Save as Template" button)
2. A "Save as Template" modal appears, pre-populated with:
   - Template name (defaults to the todo's title)
   - Category (optional text field or dropdown)
   - Due date offset (optional, e.g., "+3 days" — stored as integer days)
3. User confirms
4. Template is saved; a success toast is shown

### Creating a Todo from a Template
1. User clicks "+ Add Todo" → "From Template" tab/option
2. A template browser/selector shows available templates, grouped by category
3. User searches or browses templates
4. User selects a template
5. The todo form is pre-filled with the template's: title, description, priority
6. If the template has a `dueDateOffset`, the due date is pre-filled as `TODAY + offset days`
7. User can modify any pre-filled fields before saving
8. Subtasks from the template are pre-populated in the subtasks section

### Managing Templates
1. User navigates to "Templates" management page
2. Templates are listed, grouped by category
3. User can: edit name/category/offset, delete a template
4. Editing a template does not affect todos already created from it

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  description     TEXT,
  priority        TEXT NOT NULL DEFAULT 'medium',
  category        TEXT,                    -- free-text category label
  due_date_offset INTEGER,                 -- days offset from today (nullable)
  subtasks_json   TEXT NOT NULL DEFAULT '[]', -- JSON array of subtask titles
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
```

### Subtasks JSON Serialization

Subtasks are stored as a JSON array of strings (titles only — no completion state in templates):

```json
["Research competitors", "Write outline", "Draft content", "Review and publish"]
```

```typescript
// lib/templates.ts
export function serializeSubtasks(subtaskTitles: string[]): string {
  return JSON.stringify(subtaskTitles);
}

export function deserializeSubtasks(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    return [];
  }
}
```

### Due Date Offset Calculation

```typescript
// lib/templates.ts
import { addDays } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const SGT = 'Asia/Singapore';

export function calculateDueDate(offsetDays: number | null): string | null {
  if (offsetDays === null || offsetDays === undefined) return null;
  // Start of today in SGT
  const todaySGT = toZonedTime(new Date(), SGT);
  todaySGT.setHours(0, 0, 0, 0);
  const dueInSGT = addDays(todaySGT, offsetDays);
  return fromZonedTime(dueInSGT, SGT).toISOString();
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/templates` | List all templates (with optional `?category=` filter) |
| POST | `/api/templates` | Create a new template |
| GET | `/api/templates/[id]` | Get a single template |
| PUT | `/api/templates/[id]` | Update a template |
| DELETE | `/api/templates/[id]` | Delete a template |
| POST | `/api/todos/from-template/[templateId]` | Create a todo from a template |

#### GET /api/templates

Response:
```json
{
  "templates": [
    {
      "id": 1,
      "name": "Weekly Review",
      "description": "Review goals and plan next week",
      "priority": "high",
      "category": "Productivity",
      "dueDateOffset": 0,
      "subtasks": ["Review last week", "Set goals", "Schedule tasks"],
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

Note: `subtasks` is deserialized from `subtasks_json` before returning.

#### POST /api/templates

Request body:
```json
{
  "name": "Weekly Review",
  "description": "...",
  "priority": "high",
  "category": "Productivity",
  "dueDateOffset": 0,
  "subtasks": ["Review last week", "Set goals"]
}
```

#### POST /api/todos/from-template/[templateId]

Optional request body to override template defaults:
```json
{
  "dueDateOffset": 7,
  "title": "Custom title"
}
```

Server logic:
1. Fetch template by ID
2. Calculate due date: `calculateDueDate(body.dueDateOffset ?? template.dueDateOffset)`
3. Create todo with template's title, description, priority
4. Create subtasks from `deserializeSubtasks(template.subtasks_json)`
5. Return created todo with subtasks

Response: `201 Created` with full todo object including subtasks.

### TypeScript Types

```typescript
// types/template.ts
export interface Template {
  id: number;
  name: string;
  description: string | null;
  priority: 'high' | 'medium' | 'low';
  category: string | null;
  dueDateOffset: number | null;  // days from today
  subtasks: string[];            // deserialized array of subtask titles
  createdAt: string;
  updatedAt: string;
}

export type CreateTemplateInput = {
  name: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  category?: string;
  dueDateOffset?: number;
  subtasks?: string[];
};
```

### Validation Rules

| Field | Rules |
|-------|-------|
| name | Required, 1–255 characters, trimmed |
| description | Optional, max 2000 characters |
| priority | Optional, must be `high`, `medium`, or `low` |
| category | Optional, max 100 characters |
| dueDateOffset | Optional, integer ≥ 0, max 3650 (10 years) |
| subtasks | Optional, array of strings, each 1–500 chars, max 50 subtasks |

---

## UI Components

### TemplateManager
```tsx
// Template management page
// Groups templates by category
// Supports search by name
// Edit and delete actions
```

### TemplateBrowser
```tsx
// Modal or panel for selecting a template when creating a todo
// Shows template name, category, priority badge, subtask count, due date offset
// Search input to filter templates
interface TemplateBrowserProps {
  onSelect: (template: Template) => void;
  onClose: () => void;
}
```

### TemplateCard
```tsx
// Summary card for a template in the browser
// Shows: name, category badge, priority badge, "X subtasks", "Due in N days" or "No due date"
interface TemplateCardProps {
  template: Template;
  onSelect: () => void;
}
```

### SaveAsTemplateModal
```tsx
// Modal that captures template metadata when saving a todo as template
// Pre-fills name from todo.title
// Fields: name, category, dueDateOffset
interface SaveAsTemplateModalProps {
  todo: Todo;
  subtasks: Subtask[];
  onSave: (input: CreateTemplateInput) => void;
  onClose: () => void;
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Template with `dueDateOffset = 0` | Due date = today (start of day in SGT) |
| Template with `dueDateOffset = null` | No due date pre-filled; user can set manually |
| Template subtasks_json is malformed | `deserializeSubtasks` returns `[]`; no crash |
| Template deleted | Todos created from it are unaffected (no FK to template) |
| Todo with no subtasks saved as template | `subtasks_json = '[]'` |
| Very large subtasks array | Capped at 50 subtasks (validation rule) |
| Template category is empty string | Stored as `null` (treated as "Uncategorized") |

---

## Acceptance Criteria

- [ ] User can save any todo as a template via a "Save as Template" action
- [ ] Template captures: name, description, priority, category, due date offset, subtasks
- [ ] Templates management page lists all templates grouped by category
- [ ] User can create a new todo from a template
- [ ] Pre-filled todo form shows template's title, description, priority
- [ ] If template has `dueDateOffset`, due date is pre-filled as `TODAY + offset`
- [ ] If template has subtasks, they are pre-populated in the subtask section (all unchecked)
- [ ] User can edit any pre-filled field before saving the todo
- [ ] Template can be edited (name, category, offset, subtasks)
- [ ] Template can be deleted; no effect on existing todos
- [ ] `subtasks_json` is valid JSON array at all times
- [ ] API returns 404 for unknown template ID
- [ ] Due date calculation uses Singapore timezone (midnight SGT as day start)

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/templates.spec.ts

test('save todo as template', async ({ page }) => { /* ... */ });
test('template appears in template browser', async ({ page }) => { /* ... */ });
test('create todo from template pre-fills fields', async ({ page }) => { /* ... */ });
test('due date offset applied correctly', async ({ page }) => { /* ... */ });
test('subtasks pre-populated from template', async ({ page }) => { /* ... */ });
test('edit template name', async ({ page }) => { /* ... */ });
test('delete template', async ({ page }) => { /* ... */ });
test('templates grouped by category', async ({ page }) => { /* ... */ });
```

### Unit Tests

```typescript
// tests/unit/templates.test.ts
test('serializeSubtasks: returns valid JSON array string');
test('deserializeSubtasks: parses valid JSON array');
test('deserializeSubtasks: returns [] for invalid JSON');
test('deserializeSubtasks: filters non-string elements');
test('calculateDueDate: offset 0 returns today midnight SGT');
test('calculateDueDate: offset 3 returns 3 days from today');
test('calculateDueDate: null offset returns null');
```

---

## Out of Scope

- Template sharing between users
- Template versioning (history of edits)
- Importing templates from external sources
- Tags being stored in templates

---

## Success Metrics

- Todo creation from template completes in < 500 ms
- `subtasks_json` is always valid JSON (never `undefined` or malformed)
- Due date calculation is accurate to the day in SGT
- All template CRUD + todo-from-template covered by E2E tests
