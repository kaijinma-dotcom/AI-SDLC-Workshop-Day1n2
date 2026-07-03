# PRP 07 - Template System

## Feature Overview

Save frequently used todo patterns as reusable templates for instant task creation. Templates store a todo's title, priority, recurrence settings, reminder timing, category, and description. When used, a new todo is created immediately — the user only needs to set the due date.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Save a todo configuration as a template | I can quickly recreate common tasks |
| US-02 | User | Browse and use templates from a modal | I don't have to re-enter repeated settings |
| US-03 | User | Use a template from a quick dropdown | I can create a templated todo in one click |
| US-04 | User | Organize templates by category | I can find the right template quickly |
| US-05 | User | Delete templates no longer needed | I can keep my library clean |

---

## User Flow

### Saving a Template
1. Fill out todo form (title required, set priority, recurrence, reminder)
2. When title is non-empty, **"💾 Save as Template"** button appears
3. User clicks it; a "Save Template" modal opens
4. User fills in:
   - **Name**: Template identifier (required)
   - **Description**: Optional purpose/details
   - **Category**: Optional grouping (Work, Personal, Finance, Health, Education, or custom)
5. Clicks **"Save Template"**
6. Template saved; modal closes

### Using a Template (Quick Dropdown)
1. In todo form, find **"Use Template"** dropdown
2. Select a template from the list (shows `"Name (Category)"` format if category set)
3. Todo created **instantly** with template settings
4. User may edit the new todo to add a due date

### Using a Template (Template Manager)
1. Click **"📋 Templates"** button in top navigation
2. Template Manager modal opens with full list
3. Browse templates; each card shows: name, description, category badge, priority badge, recurrence badge, reminder badge
4. Click **"Use"** to create a todo from that template
5. Modal closes; new todo appears

### Deleting a Template
1. In Template Manager modal, click **"Delete"** on a template
2. Confirm deletion
3. Template removed; existing todos created from it are unaffected

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE templates (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  title_template     TEXT NOT NULL,   -- todo title to use on creation
  description        TEXT,
  category           TEXT,            -- 'Work'|'Personal'|'Finance'|'Health'|'Education'|custom
  priority           TEXT NOT NULL DEFAULT 'medium',
  is_recurring       INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,            -- 'daily'|'weekly'|'monthly'|'yearly'
  reminder_minutes   INTEGER,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX idx_templates_user_id ON templates(user_id);
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/templates` | List all templates for authenticated user |
| POST | `/api/templates` | Create a new template |
| DELETE | `/api/templates/[id]` | Delete a template |
| POST | `/api/templates/[id]/use` | Create a todo from a template |

#### GET /api/templates

```typescript
// Response
{
  "templates": [{
    "id": 1,
    "name": "Weekly Review",
    "title_template": "Weekly Review",
    "description": "Review last week's todos and plan ahead",
    "category": "Work",
    "priority": "medium",
    "is_recurring": true,
    "recurrence_pattern": "weekly",
    "reminder_minutes": 1440,
    "created_at": "2025-11-01T09:00:00Z"
  }]
}
```

#### POST /api/templates

```typescript
// Request body
{
  "name": "Weekly Review",
  "title_template": "Weekly Review",
  "description": "...",
  "category": "Work",
  "priority": "medium",
  "is_recurring": true,
  "recurrence_pattern": "weekly",
  "reminder_minutes": 1440
}
// Response: 201 Created with template object
```

#### POST /api/templates/[id]/use

```typescript
// Creates a new todo from the template settings
// Request body: { "due_date": "2025-11-15T09:00:00" }  (optional)
// Response: 201 Created with new todo object
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const template = templateDB.getById(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = getSingaporeNow().toISOString();
  const todo = todoDB.create({
    user_id: session.userId,
    title: template.title_template,
    priority: template.priority,
    is_recurring: template.is_recurring ? 1 : 0,
    recurrence_pattern: template.recurrence_pattern ?? null,
    reminder_minutes: template.reminder_minutes ?? null,
    due_date: body.due_date ?? null,
    completed: 0,
    created_at: now,
    updated_at: now,
  });

  return NextResponse.json(todo, { status: 201 });
}
```

### Database Operations (lib/db.ts)

```typescript
export const templateDB = {
  getByUserId: (userId: number): Template[] =>
    db.prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY name').all(userId) as Template[],

  getById: (id: number, userId: number): Template | null =>
    db.prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?').get(id, userId) as Template | null,

  create: (data: CreateTemplateInput): Template => {
    const now = getSingaporeNow().toISOString();
    const result = db.prepare(`
      INSERT INTO templates (user_id, name, title_template, description, category, priority,
        is_recurring, recurrence_pattern, reminder_minutes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.user_id, data.name, data.title_template, data.description ?? null,
      data.category ?? null, data.priority, data.is_recurring ? 1 : 0,
      data.recurrence_pattern ?? null, data.reminder_minutes ?? null, now, now
    );
    return templateDB.getById(result.lastInsertRowid as number, data.user_id)!;
  },

  delete: (id: number, userId: number): void => {
    db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId);
  },
};
```

### TypeScript Types

```typescript
// lib/db.ts
export interface Template {
  id: number;
  user_id: number;
  name: string;
  title_template: string;
  description: string | null;
  category: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  user_id: number;
  name: string;
  title_template: string;
  description?: string;
  category?: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern?: RecurrencePattern;
  reminder_minutes?: number;
}
```

### What Templates Store vs. Do NOT Store

**Stored:**
- Todo title (as `title_template`)
- Priority level
- Recurrence enabled/pattern
- Reminder timing (minutes)
- Category, description, name

**NOT stored:**
- Specific due dates
- Tags (user selects on creation)
- Subtasks (added after creation)
- Original todo IDs

---

## UI Components

### "💾 Save as Template" Button (in todo form)
```tsx
// Appears when title input is non-empty
// Opens "Save Template" modal on click
// Should not interfere with normal "Add" flow
```

### Save Template Modal
```tsx
// Fields: Name (required), Description (optional), Category (optional dropdown)
// Shows current settings being saved as preview
// "Save Template" + "Cancel" buttons
```

### "Use Template" Dropdown (in todo form)
```tsx
// Dropdown: "Use Template..." placeholder
// Lists templates as: "Name (Category)" or just "Name"
// Selecting a template instantly creates a todo
// Only visible if user has at least one template
```

### Template Manager Modal (accessed via "📋 Templates" button)
```tsx
// Header: "📋 Templates" + close button
// Empty state: "No templates yet. Save a todo as a template to get started."
// Each template card:
//   - Name (bold)
//   - Description (muted, if set)
//   - Category badge (colored, if set)
//   - Priority badge
//   - Recurrence badge (🔄 + pattern, if set)
//   - Reminder badge (🔔 + abbreviated time, if set)
//   - [ Use ] [ Delete ] buttons
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Template name already exists | Allowed (no uniqueness constraint on name per user) |
| Using template without due date | Todo created with `due_date = null`; user edits to add date |
| Template with recurrence used without due date | Todo created; recurrence badge shows, but can't complete without due date |
| Deleting a template | Does NOT affect existing todos created from it |
| No templates exist | Dropdown not shown; template manager shows empty state |
| Category field empty | Stored as `null`; template displayed without category badge |

---

## Acceptance Criteria

- [ ] "💾 Save as Template" button appears when title is non-empty in todo form
- [ ] Saving template opens modal with Name, Description, Category fields
- [ ] Template appears in "Use Template" dropdown after saving
- [ ] Using template from dropdown creates todo immediately
- [ ] "📋 Templates" button opens Template Manager modal
- [ ] Template cards show name, description, category, priority, recurrence, reminder info
- [ ] "Use" button creates a todo from the template
- [ ] "Delete" button removes template from list
- [ ] Deleting template does NOT affect existing todos
- [ ] Empty state shown when no templates exist
- [ ] Templates are user-specific

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/07-templates.spec.ts
test('save todo form as template');
test('template appears in Use Template dropdown');
test('use template creates todo with correct settings');
test('template manager modal shows all templates');
test('delete template removes it from list');
test('deleting template does not affect existing todos');
test('empty state shown when no templates');
```

---

## Out of Scope

- Editing/updating templates (delete and re-create workflow)
- Importing/exporting templates separately
- Shared templates between users
- Template versioning
- Subtasks in templates
