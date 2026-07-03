# PRP 06 - Tag System

## Feature Overview

Custom color-coded labels that users can create and assign to todos for categorization and filtering. Tags use a many-to-many relationship (todos ↔ tags via a junction table). Each user manages their own tag library. Tags can be filtered in the todo list, and deleting a tag removes it from all associated todos via CASCADE.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Create custom tags with names and colors | I can categorize todos by area or project |
| US-02 | User | Assign multiple tags to a todo | I can classify todos under multiple categories |
| US-03 | User | See color-coded tag pills on todo cards | I can instantly recognize categories at a glance |
| US-04 | User | Filter todos by a specific tag | I can focus on one area of work |
| US-05 | User | Edit or delete my tags | I can keep my tag library clean |

---

## User Flow

### Creating Tags
1. Click **"+ Manage Tags"** button near the todo form
2. Tag management modal opens
3. Enter tag name and select a color (color picker or hex input)
4. Click **"Create Tag"**
5. Tag appears in the tag list and is available to assign

### Assigning Tags to Todos (on create)
1. After tags exist, tag pills appear below the todo form
2. Click a tag pill to select it (colored background, checkmark)
3. Click again to deselect (gray border, no checkmark)
4. Multiple tags can be selected
5. Create the todo — selected tags are saved

### Assigning Tags (on edit)
1. Open edit modal for a todo
2. Tag selection pills visible in the modal
3. Toggle tags on/off
4. Click "Update" to save

### Filtering by Tag
1. "All Tags" dropdown appears in the filter section (only if tags exist)
2. Select a tag name to show only todos with that tag
3. Combines with priority, search, date, and completion filters
4. Select "All Tags" to clear

### Managing Tags
- **Edit**: Modify name and/or color; changes reflect on all todos using the tag
- **Delete**: Removes tag from all todos (CASCADE via `todo_tags` junction table)

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#3B82F6', -- hex color code
  created_at TEXT NOT NULL,
  UNIQUE(user_id, name)  -- no duplicate names per user
);

CREATE TABLE todo_tags (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);

CREATE INDEX idx_tags_user_id ON tags(user_id);
CREATE INDEX idx_todo_tags_todo_id ON todo_tags(todo_id);
CREATE INDEX idx_todo_tags_tag_id ON todo_tags(tag_id);
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tags` | List all tags for authenticated user |
| POST | `/api/tags` | Create a new tag |
| PUT | `/api/tags/[id]` | Update tag name and/or color |
| DELETE | `/api/tags/[id]` | Delete tag (and remove from all todos) |
| POST | `/api/todos/[id]/tags` | Add tag(s) to a todo |
| DELETE | `/api/todos/[id]/tags/[tagId]` | Remove a tag from a todo |

#### GET /api/tags

```typescript
// Response
{ "tags": [{ "id": 1, "name": "Work", "color": "#3B82F6" }] }
```

#### POST /api/tags

```typescript
// Request
{ "name": "Work", "color": "#3B82F6" }
// Response: 201 Created with tag object
// Error: 409 Conflict if name already exists for user
```

#### POST /api/todos/[id]/tags

```typescript
// Request body: { "tagIds": [1, 2, 3] }
// Replaces all current tags for the todo with the provided set
// Response: 200 OK
```

### Database Operations (lib/db.ts)

```typescript
export const tagDB = {
  getByUserId: (userId: number): Tag[] =>
    db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name').all(userId) as Tag[],

  getByTodoId: (todoId: number): Tag[] =>
    db.prepare(`
      SELECT t.* FROM tags t
      JOIN todo_tags tt ON tt.tag_id = t.id
      WHERE tt.todo_id = ?
    `).all(todoId) as Tag[],

  create: (data: { user_id: number; name: string; color: string }): Tag => {
    const now = getSingaporeNow().toISOString();
    const result = db.prepare(
      'INSERT INTO tags (user_id, name, color, created_at) VALUES (?, ?, ?, ?)'
    ).run(data.user_id, data.name.trim(), data.color, now);
    return tagDB.getById(result.lastInsertRowid as number);
  },

  update: (id: number, data: { name?: string; color?: string }): Tag => {
    if (data.name) db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(data.name.trim(), id);
    if (data.color) db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(data.color, id);
    return tagDB.getById(id);
  },

  delete: (id: number): void => {
    db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    // todo_tags rows cascade automatically via FK
  },

  setTodoTags: (todoId: number, tagIds: number[]): void => {
    db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(todoId);
    const insert = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
    tagIds.forEach(tagId => insert.run(todoId, tagId));
  },
};
```

### TypeScript Types

```typescript
// lib/db.ts
export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;  // hex e.g. '#3B82F6'
  created_at: string;
}

// Extended type used on client
export interface TodoWithTags extends Todo {
  tags: Tag[];
}
```

### Validation

| Field | Rules |
|-------|-------|
| name | Required, 1–50 characters, trimmed, unique per user |
| color | Required, valid hex color (`#RRGGBB`), default `#3B82F6` |

---

## UI Components

### Tag Management Modal (accessed via "+ Manage Tags")
```tsx
// Modal sections:
// 1. Create tag: name input + color picker + hex input + "Create Tag" button
// 2. Tag list: each row shows [ colored dot ] [ name ] [ Edit ] [ Delete ]
// Default color: #3B82F6 (blue)
// Dark mode fully supported
```

### Tag Pills (below todo form and in edit modal)
```tsx
// One pill per available tag
// Unselected: white/gray background, gray border, gray text
// Selected: tag's color background, white text, checkmark icon
// Click to toggle selection
// Multiple tags can be selected simultaneously
```

### Tag Pills on Todo Cards
```tsx
// Read-only colored pills on each todo card
// White text on tag's color background
// Rounded full shape
// Positioned after priority/recurrence/reminder badges
// Visible in all sections (Overdue, Pending, Completed)
```

### Tag Filter Dropdown (above todo list)
```tsx
// Dropdown: "All Tags" + individual tag names
// Only visible if at least one tag exists
// Combines with all other filters (AND logic)
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Duplicate tag name for same user | 409 Conflict: "Tag name already exists" |
| Invalid hex color | Default to `#3B82F6`; or validate and return 400 |
| Deleting a tag | CASCADE removes from `todo_tags`; tag pills update across all affected todos |
| Editing a tag color | Update `tags.color`; color reflects on all todo cards with that tag |
| No tags exist | Tag pills not shown below form; "All Tags" dropdown not shown in filters |
| Tag filter active while tag deleted | Clear tag filter; restore "All Tags" |
| Assigning >10 tags to a todo | Allowed; pills wrap to next line on card |

---

## Acceptance Criteria

- [ ] "+ Manage Tags" button opens tag management modal
- [ ] User can create a tag with a name and color
- [ ] Duplicate tag names per user are rejected
- [ ] Tag appears as selectable pill below todo form after creation
- [ ] Multiple tags can be selected when creating/editing a todo
- [ ] Tag pills visible on todo cards with correct colors and white text
- [ ] "All Tags" filter dropdown visible when tags exist
- [ ] Selecting a tag filter shows only todos with that tag
- [ ] Editing a tag color updates it on all associated todo cards
- [ ] Deleting a tag removes it from all todos (no dangling references)
- [ ] Tags are user-specific (users cannot see each other's tags)
- [ ] Dark mode supported in modal and on pills

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/06-tags.spec.ts
test('create a tag with name and color');
test('tag appears as selectable pill below form');
test('assign tag to todo shows pill on card');
test('tag filter shows only tagged todos');
test('edit tag color updates on all todo cards');
test('delete tag removes it from todo cards');
test('duplicate tag name shows error');
```

### Unit Tests

```typescript
// tests/unit/tags.test.ts
test('tagDB.getByTodoId returns correct tags');
test('tagDB.setTodoTags replaces existing tags');
test('invalid hex color rejected');
test('tag name trimmed on create');
```

---

## Out of Scope

- Tag hierarchies (parent/child tags)
- Shared tags across users
- Tag-based sorting (beyond filtering)
- Tag usage analytics
- Predefined system tags
