# PRP 09 - Export & Import

## Feature Overview

Allows users to export their entire todo dataset as a JSON backup file and restore it by importing the file. The import process performs ID remapping to avoid conflicts with existing data, preserves relationships (tags, subtasks, todo_tags), and validates the incoming data before writing to the database.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Export all my todos to a JSON file | I can back up my data or move it to another instance |
| US-02 | User | Import a previously exported JSON file | I can restore my todos after data loss or migration |
| US-03 | User | Have imported todos avoid ID conflicts | Imported data doesn't overwrite existing todos |
| US-04 | User | Have tag and subtask relationships preserved on import | My structured data is correctly restored |
| US-05 | User | Receive clear feedback if the import file is invalid | I know when my file is corrupted or wrong format |

---

## User Flow

### Export
1. User navigates to Settings or finds an "Export" button in the toolbar
2. User clicks "Export Todos"
3. The browser downloads a file named `todos-backup-YYYY-MM-DD.json`
4. The file contains all todos, tags, subtasks, and tag assignments
5. A success toast: "Exported [N] todos"

### Import
1. User clicks "Import Todos"
2. A file picker opens (accepts `.json` only)
3. User selects the backup file
4. A preview modal shows: "This file contains [N] todos, [M] tags, [K] subtasks"
5. User clicks "Import"
6. The API processes the file:
   a. Validates the JSON structure
   b. Imports tags (creates new tags for names not already in the DB; maps existing by name)
   c. Imports todos with new IDs (ID remapping)
   d. Imports subtasks with remapped `todo_id`
   e. Creates `todo_tags` rows with remapped IDs
7. Success toast: "Imported [N] todos, [M] tags"
8. The todo list refreshes

---

## Technical Requirements

### Export Format (JSON Schema)

```typescript
// types/backup.ts
export interface BackupFile {
  version: string;         // e.g., "1.0"
  exportedAt: string;      // ISO 8601 UTC
  todos: BackupTodo[];
  tags: BackupTag[];
}

export interface BackupTodo {
  id: number;              // original ID (used for relationship mapping in file only)
  title: string;
  description: string | null;
  completed: boolean;
  dueDate: string | null;
  priority: 'high' | 'medium' | 'low';
  recurring: boolean;
  recurrenceType: string | null;
  reminderEnabled: boolean;
  reminderLeadTime: string | null;
  createdAt: string;
  completedAt: string | null;
  tagIds: number[];        // references BackupTag.id
  subtasks: BackupSubtask[];
}

export interface BackupSubtask {
  title: string;
  completed: boolean;
  position: number;
}

export interface BackupTag {
  id: number;              // original ID
  name: string;
  color: string;
}
```

Example file:
```json
{
  "version": "1.0",
  "exportedAt": "2025-11-15T10:00:00Z",
  "todos": [
    {
      "id": 1,
      "title": "Buy groceries",
      "description": null,
      "completed": false,
      "dueDate": "2025-11-16T00:00:00+08:00",
      "priority": "medium",
      "recurring": false,
      "recurrenceType": null,
      "reminderEnabled": false,
      "reminderLeadTime": null,
      "createdAt": "2025-11-11T10:00:00Z",
      "completedAt": null,
      "tagIds": [2],
      "subtasks": [
        { "title": "Milk", "completed": false, "position": 0 },
        { "title": "Bread", "completed": false, "position": 1 }
      ]
    }
  ],
  "tags": [
    { "id": 2, "name": "Errands", "color": "#f59e0b" }
  ]
}
```

### Export API

#### GET /api/export

Generates and returns the backup JSON.

```typescript
// app/api/export/route.ts
export async function GET() {
  const db = getDb();
  const todos = db.prepare('SELECT * FROM todos').all();
  const tags = db.prepare('SELECT * FROM tags').all();
  const todoTags = db.prepare('SELECT * FROM todo_tags').all();
  const subtasks = db.prepare('SELECT * FROM subtasks').all();

  // Build backup structure
  const backup: BackupFile = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    tags: tags.map(/* map to BackupTag */),
    todos: todos.map((todo) => ({
      /* map fields */
      tagIds: todoTags.filter((tt) => tt.todo_id === todo.id).map((tt) => tt.tag_id),
      subtasks: subtasks
        .filter((s) => s.todo_id === todo.id)
        .sort((a, b) => a.position - b.position)
        .map(/* map to BackupSubtask */),
    })),
  };

  const json = JSON.stringify(backup, null, 2);
  return new Response(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-backup-${
        new Date().toISOString().slice(0, 10)
      }.json"`,
    },
  });
}
```

### Import API

#### POST /api/import

Accepts a `multipart/form-data` request with the JSON file, or a `application/json` body with the parsed content.

```typescript
// app/api/import/route.ts
export async function POST(request: Request) {
  const body: BackupFile = await request.json();

  // 1. Validate
  validateBackupFile(body); // throws if invalid

  const db = getDb();

  // 2. Import tags — use DB transaction for atomicity
  const tagIdMap = new Map<number, number>(); // oldId → newId

  const importAll = db.transaction(() => {
    for (const tag of body.tags) {
      const existing = db
        .prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE')
        .get(tag.name);
      if (existing) {
        tagIdMap.set(tag.id, (existing as any).id);
      } else {
        const result = db
          .prepare('INSERT INTO tags (name, color, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run(tag.name, tag.color, new Date().toISOString(), new Date().toISOString());
        tagIdMap.set(tag.id, result.lastInsertRowid as number);
      }
    }

    // 3. Import todos — new IDs (no explicit id)
    const todoIdMap = new Map<number, number>(); // oldId → newId
    const now = new Date().toISOString();

    for (const todo of body.todos) {
      const result = db
        .prepare(
          `INSERT INTO todos (title, description, completed, due_date, priority,
            recurring, recurrence_type, reminder_enabled, reminder_lead_time,
            created_at, updated_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          todo.title, todo.description, todo.completed ? 1 : 0, todo.dueDate,
          todo.priority, todo.recurring ? 1 : 0, todo.recurrenceType,
          todo.reminderEnabled ? 1 : 0, todo.reminderLeadTime,
          todo.createdAt, now, todo.completedAt
        );
      const newTodoId = result.lastInsertRowid as number;
      todoIdMap.set(todo.id, newTodoId);

      // 4. Import subtasks
      for (const subtask of todo.subtasks) {
        db.prepare(
          `INSERT INTO subtasks (todo_id, title, completed, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(newTodoId, subtask.title, subtask.completed ? 1 : 0, subtask.position, now, now);
      }

      // 5. Import tag assignments
      for (const oldTagId of todo.tagIds) {
        const newTagId = tagIdMap.get(oldTagId);
        if (newTagId) {
          db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)')
            .run(newTodoId, newTagId);
        }
      }
    }
  });

  importAll(); // executes atomically

  return Response.json({
    imported: {
      todos: body.todos.length,
      tags: body.tags.length,
      subtasks: body.todos.reduce((sum, t) => sum + t.subtasks.length, 0),
    },
  }, { status: 201 });
}
```

### Validation

```typescript
// lib/import-validation.ts
export function validateBackupFile(data: unknown): void {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid backup file: must be a JSON object');
  }
  const file = data as Record<string, unknown>;

  if (file.version !== '1.0') {
    throw new Error(`Unsupported backup version: ${file.version}`);
  }
  if (!Array.isArray(file.todos)) {
    throw new Error('Invalid backup file: "todos" must be an array');
  }
  if (!Array.isArray(file.tags)) {
    throw new Error('Invalid backup file: "tags" must be an array');
  }

  for (const todo of file.todos as unknown[]) {
    if (typeof (todo as any).title !== 'string' || !(todo as any).title.trim()) {
      throw new Error('Invalid todo: title must be a non-empty string');
    }
    // Additional field validation...
  }
}
```

---

## UI Components

### ExportButton
```tsx
// Button that triggers the export download
// Shows loading state while generating
// On success: toast "Exported N todos"
```

### ImportButton
```tsx
// Button that opens the file picker
// Accepts: .json files only
// On file selected: reads file and calls import API
```

### ImportPreviewModal
```tsx
// Modal shown before confirming import
// Shows: N todos, M tags, K subtasks in the file
// "Import" and "Cancel" buttons
interface ImportPreviewModalProps {
  stats: { todos: number; tags: number; subtasks: number };
  onConfirm: () => void;
  onCancel: () => void;
}
```

### ImportResultToast
```tsx
// Success: "Imported 15 todos, 3 tags"
// Error: "Import failed: [error message]"
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| File is not valid JSON | Parse error caught; user shown "Invalid JSON file" |
| Backup version mismatch | Error: "Unsupported backup version" |
| Tag name already exists in DB | Map to existing tag by name (do not duplicate) |
| `tagIds` references a tag not in the file | Skip the tag assignment; log warning |
| Todo has `recurring = true` but `recurrenceType = null` | Import as non-recurring (normalize the inconsistency) |
| Empty backup file (0 todos) | Valid; import succeeds; toast: "Imported 0 todos" |
| Very large file (10,000 todos) | Processed inside a single DB transaction; may take a few seconds |
| Partial import failure | Transaction rollback; all-or-nothing semantics |
| File exceeds 50 MB | Reject with 413 Payload Too Large before parsing |

---

## Acceptance Criteria

- [ ] "Export Todos" button downloads a `.json` file named `todos-backup-YYYY-MM-DD.json`
- [ ] Exported file contains all todos, tags, subtasks, and tag assignments
- [ ] `version: "1.0"` is present in the exported file
- [ ] "Import Todos" button opens a file picker accepting `.json` only
- [ ] Import preview modal shows count of todos, tags, subtasks
- [ ] Import creates new todos with new IDs (no overwrite of existing)
- [ ] Existing tags matched by name (case-insensitive); not duplicated
- [ ] Subtasks imported and linked to correct new todo IDs
- [ ] Tag assignments imported with remapped IDs
- [ ] Import is atomic — partial failure rolls back entirely
- [ ] Invalid JSON shows error: "Invalid JSON file"
- [ ] Unsupported version shows error: "Unsupported backup version"
- [ ] Success toast shows count of imported todos and tags
- [ ] Todo list refreshes after successful import

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/export-import.spec.ts

test('export creates downloadable JSON file', async ({ page }) => { /* ... */ });
test('exported file contains all todos and tags', async ({ page }) => { /* ... */ });
test('import restores todos from backup', async ({ page }) => { /* ... */ });
test('import avoids duplicate tags by name', async ({ page }) => { /* ... */ });
test('import assigns new IDs to todos', async ({ page }) => { /* ... */ });
test('import preserves subtasks', async ({ page }) => { /* ... */ });
test('import preserves tag assignments', async ({ page }) => { /* ... */ });
test('invalid JSON shows error message', async ({ page }) => { /* ... */ });
test('round-trip: export then import restores all data', async ({ page }) => { /* ... */ });
```

### Unit Tests

```typescript
// tests/unit/import-validation.test.ts
test('validateBackupFile: passes valid backup');
test('validateBackupFile: throws on non-object input');
test('validateBackupFile: throws on unsupported version');
test('validateBackupFile: throws on missing todos array');
test('validateBackupFile: throws on todo with empty title');
```

---

## Out of Scope

- CSV export/import
- Selective export (export only completed or specific tags)
- Cloud backup / sync (e.g., Google Drive)
- Incremental / differential backups
- Merging strategies (e.g., "overwrite on conflict")

---

## Success Metrics

- Export of 1000 todos completes in < 2 seconds
- Import of 1000 todos completes in < 5 seconds
- Round-trip (export → import) preserves 100% of data
- Atomic import: zero partial states in DB after failure
