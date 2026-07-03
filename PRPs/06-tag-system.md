# PRP 06 - Tag System

## Feature Overview

A color-coded label system that allows users to organize todos by topic or category. Tags have a name and a color, and a todo can have multiple tags (many-to-many relationship). Users can create, edit, and delete tags via a dedicated tag management interface, and filter the todo list by one or more tags.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Create tags with a name and color | I can categorize my todos by topic |
| US-02 | User | Assign multiple tags to a todo | I can describe a todo with multiple categories |
| US-03 | User | See color-coded tag chips on each todo card | I can visually identify categories at a glance |
| US-04 | User | Filter the todo list by tag | I can focus on a specific category of work |
| US-05 | User | Edit a tag's name or color | I can update labels as my workflow evolves |
| US-06 | User | Delete a tag | I can remove categories I no longer use |

---

## User Flow

### Creating a Tag
1. User navigates to the "Tags" management section (accessible from settings or a sidebar link)
2. User clicks "+ New Tag"
3. A form appears: tag name (text input), color (color picker or preset swatches)
4. User fills in name and picks a color
5. Clicks "Create Tag"
6. New tag appears in the tags list

### Assigning Tags to a Todo
1. In the create/edit todo form, a "Tags" multi-select section is visible
2. User clicks the field to open a dropdown of available tags (shown with color swatches)
3. User clicks one or more tags to select them
4. Selected tags appear as chips inside the field
5. User can click an X on a chip to remove a tag selection
6. On form save, the tag assignments are persisted

### Filtering by Tag
1. A tags filter area is shown above or in the sidebar of the todo list
2. All existing tags are shown as clickable chips
3. User clicks a tag to activate the filter
4. The todo list shows only todos that have that tag
5. Multiple tags can be selected (OR logic: todos with any of the selected tags are shown)
6. User clicks an active tag chip to deselect it

### Editing a Tag
1. User goes to tag management, clicks the edit icon on a tag
2. An inline form or modal shows the current name and color
3. User updates and saves
4. All todo cards using this tag reflect the updated name/color immediately

### Deleting a Tag
1. User clicks the delete icon on a tag in management
2. A confirmation dialog: "Delete tag '[name]'? It will be removed from all todos."
3. User confirms
4. Tag is removed from the database; junction rows are cascade-deleted
5. Tag chips disappear from all affected todo cards

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT '#6366f1', -- hex color string
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE todo_tags (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);

CREATE INDEX idx_todo_tags_todo_id ON todo_tags(todo_id);
CREATE INDEX idx_todo_tags_tag_id  ON todo_tags(tag_id);
```

### API Endpoints

#### Tag Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create a new tag |
| PUT | `/api/tags/[id]` | Update a tag |
| DELETE | `/api/tags/[id]` | Delete a tag |

#### Todo Tags

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/todos/[todoId]/tags` | Get tags for a todo |
| POST | `/api/todos/[todoId]/tags` | Add a tag to a todo |
| DELETE | `/api/todos/[todoId]/tags/[tagId]` | Remove a tag from a todo |

Or, tags are managed as part of the todo create/update:

```json
// POST /api/todos or PUT /api/todos/[id]
{
  "title": "...",
  "tagIds": [1, 3, 5]
}
```

On create/update, the API:
1. Deletes existing `todo_tags` rows for the todo
2. Inserts new rows for the provided `tagIds`

#### GET /api/todos with tag filtering

Query parameter: `?tagIds=1,3` — returns todos that have any of the specified tag IDs.

```sql
SELECT DISTINCT t.*
FROM todos t
JOIN todo_tags tt ON t.id = tt.todo_id
WHERE tt.tag_id IN (1, 3)
```

### Response Format

#### GET /api/tags
```json
{
  "tags": [
    { "id": 1, "name": "Work", "color": "#3b82f6", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

#### GET /api/todos (with tags included)
```json
{
  "todos": [
    {
      "id": 1,
      "title": "...",
      "tags": [
        { "id": 1, "name": "Work", "color": "#3b82f6" }
      ]
    }
  ]
}
```

Tags are joined in the todos query:
```sql
SELECT t.*, GROUP_CONCAT(tg.id || ':' || tg.name || ':' || tg.color) AS tags_raw
FROM todos t
LEFT JOIN todo_tags tt ON t.id = tt.todo_id
LEFT JOIN tags tg ON tt.tag_id = tg.id
GROUP BY t.id
```

Then parse `tags_raw` in application code.

### TypeScript Types

```typescript
// types/tag.ts
export interface Tag {
  id: number;
  name: string;
  color: string;      // hex color string, e.g. '#3b82f6'
  createdAt: string;
  updatedAt: string;
}

export type CreateTagInput = { name: string; color: string };
export type UpdateTagInput = Partial<{ name: string; color: string }>;

// Extend Todo type
export interface Todo {
  // ...existing fields...
  tags: Pick<Tag, 'id' | 'name' | 'color'>[];
}
```

### Validation Rules

| Field | Rules |
|-------|-------|
| Tag name | Required, 1–50 characters, trimmed, unique (case-insensitive) |
| Tag color | Required, valid hex color `#rrggbb` or `#rgb` format |
| tagIds (on todo) | Array of integers; all IDs must exist in the `tags` table |

---

## UI Components

### TagManager
```tsx
// Full tag management page/section
// Lists all tags with edit and delete actions
// Contains the "New Tag" form inline or in a modal
```

### TagChip
```tsx
// Small pill-shaped chip showing tag name with the tag's background color
// Props: tag: Pick<Tag, 'name' | 'color'>, onRemove?: () => void
// When onRemove is provided, shows an X button
interface TagChipProps {
  tag: Pick<Tag, 'name' | 'color'>;
  onRemove?: () => void;
}
```

### TagMultiSelect
```tsx
// Multi-select dropdown for assigning tags to a todo
// Props: availableTags: Tag[], selectedTagIds: number[]
//        onChange: (tagIds: number[]) => void
// Shows selected tags as chips; dropdown lists remaining tags
interface TagMultiSelectProps {
  availableTags: Tag[];
  selectedTagIds: number[];
  onChange: (tagIds: number[]) => void;
}
```

### TagFilter
```tsx
// Tag chips above the todo list for filtering
// Props: tags: Tag[], activeTagIds: number[]
//        onToggle: (tagId: number) => void
// Active tags have a highlighted/selected style
interface TagFilterProps {
  tags: Tag[];
  activeTagIds: number[];
  onToggle: (tagId: number) => void;
}
```

### ColorPicker
```tsx
// A set of preset color swatches + optional hex input
// Props: value: string, onChange: (color: string) => void
// Preset colors: 10–15 accessible swatches covering major hues
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Tag name already exists (case-insensitive) | 409 Conflict: "Tag '[name]' already exists" |
| Invalid hex color | 400 Bad Request: "Invalid color format. Use #rrggbb" |
| Assigning non-existent tagId to todo | 400 Bad Request: "Tag [id] not found" |
| Deleting a tag used by todos | Cascade via `ON DELETE CASCADE` on `todo_tags`; todo remains, tag chip disappears |
| Filtering with multiple tags (OR) | `DISTINCT` query with `IN (...)` clause |
| Todo with 0 tags | Tags array is empty `[]`; no chips rendered |
| Long tag name (> 50 chars) | Frontend caps input; API returns 400 |
| Tag color is not accessible | Application provides preset accessible swatches; custom hex input is user's responsibility |

---

## Acceptance Criteria

- [ ] Tags management section allows creating, editing, and deleting tags
- [ ] Tag name is unique (case-insensitive); duplicate name returns 409
- [ ] Tag color is stored and displayed as a hex color
- [ ] Tags can be assigned to a todo via multi-select in the form
- [ ] A todo can have zero, one, or multiple tags
- [ ] Tag chips are visible on each todo card
- [ ] Chips show the tag name on the tag's background color
- [ ] Todo list can be filtered by one or more tags (OR logic)
- [ ] Active tag filters are visually highlighted
- [ ] Editing a tag updates the name/color across all todo cards
- [ ] Deleting a tag removes it from all todo cards (cascade)
- [ ] `ON DELETE CASCADE` on `todo_tags` verified by test
- [ ] API returns 400 for invalid tag color format
- [ ] API returns 409 for duplicate tag name

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/tags.spec.ts

test('create a new tag with name and color', async ({ page }) => { /* ... */ });
test('duplicate tag name shows error', async ({ page }) => { /* ... */ });
test('assign tags to a todo', async ({ page }) => { /* ... */ });
test('tag chips appear on todo card', async ({ page }) => { /* ... */ });
test('filter todos by tag shows only matching todos', async ({ page }) => { /* ... */ });
test('filter by multiple tags returns union (OR)', async ({ page }) => { /* ... */ });
test('delete tag removes chips from todos', async ({ page }) => { /* ... */ });
test('edit tag name updates chips everywhere', async ({ page }) => { /* ... */ });
```

### Unit Tests

```typescript
// tests/unit/tags.test.ts
test('parseTagsRaw: parses GROUP_CONCAT string to Tag array');
test('parseTagsRaw: returns [] for null/empty input');
test('validateHexColor: accepts #rrggbb');
test('validateHexColor: accepts #rgb');
test('validateHexColor: rejects invalid formats');
```

---

## Out of Scope

- Hierarchical / nested tags (parent-child)
- Tag usage statistics (how many todos use a tag)
- Tag auto-suggest based on todo title
- Per-user tag sets (all tags are global)

---

## Success Metrics

- Tag filter renders in < 100 ms (client-side)
- Cascade delete verified at DB level
- Tag chips color contrast meets WCAG AA
- All tag CRUD operations covered by E2E tests
