# PRP 09 - Export & Import

## Feature Overview

Backup and restore todos using JSON export/import. An additional CSV export provides spreadsheet-friendly output for analysis. On import, new IDs are assigned so data links to the importing user without conflicts. The export is a full snapshot; import creates new todos alongside existing ones (no merge/upsert).

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Export my todos as a JSON file | I have a complete backup |
| US-02 | User | Import todos from a JSON file | I can restore data or transfer to another device |
| US-03 | User | Export my todos as a CSV file | I can analyze data in a spreadsheet |
| US-04 | User | See a success count after import | I know how many todos were imported |
| US-05 | User | Be warned if the file is invalid | I don't get silent failures |

---

## User Flow

### JSON Export
1. Click **"Export JSON"** button (green, top-right of page)
2. File downloads automatically
3. Filename format: `todos-YYYY-MM-DD.json`

### CSV Export
1. Click **"Export CSV"** button (dark green, top-right)
2. File downloads automatically
3. Filename format: `todos-YYYY-MM-DD.csv`

### Import
1. Click **"Import"** button (blue, top-right)
2. File picker opens (accepts `.json` files)
3. User selects a previously exported JSON file
4. App validates and processes the file
5. Success: toast "Successfully imported X todos"; list refreshes
6. Error: toast "Failed to import todos. Please check the file format."

---

## Technical Requirements

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/todos/export` | Download todos as JSON or CSV |
| POST | `/api/todos/import` | Import todos from JSON body |

#### GET /api/todos/export

Query parameter: `?format=json` (default) or `?format=csv`

```typescript
// app/api/todos/export/route.ts
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const format = request.nextUrl.searchParams.get('format') ?? 'json';
  const todos = todoDB.getByUserId(session.userId);
  const date = formatSingaporeDate(getSingaporeNow(), 'yyyy-MM-dd');

  if (format === 'csv') {
    const csv = convertTodosToCSV(todos);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="todos-${date}.csv"`,
      },
    });
  }

  // JSON format
  const json = JSON.stringify(todos, null, 2);
  return new Response(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-${date}.json"`,
    },
  });
}
```

#### POST /api/todos/import

```typescript
// app/api/todos/import/route.ts
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected an array of todos' }, { status: 400 });
  }

  const now = getSingaporeNow().toISOString();
  let count = 0;

  for (const item of body) {
    if (!item.title || typeof item.title !== 'string') continue; // skip invalid
    todoDB.create({
      user_id: session.userId,
      title: item.title,
      completed: item.completed ? 1 : 0,
      due_date: item.due_date ?? null,
      priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
      is_recurring: item.is_recurring ? 1 : 0,
      recurrence_pattern: item.recurrence_pattern ?? null,
      reminder_minutes: item.reminder_minutes ?? null,
      created_at: item.created_at ?? now,
      updated_at: now,
      completed_at: item.completed_at ?? null,
    });
    count++;
  }

  return NextResponse.json({ message: `Successfully imported ${count} todos`, count });
}
```

### JSON Export Format

```json
[
  {
    "id": 1,
    "title": "Sample Todo",
    "completed": false,
    "due_date": "2025-11-10T14:00:00+08:00",
    "priority": "high",
    "is_recurring": true,
    "recurrence_pattern": "weekly",
    "reminder_minutes": 60,
    "created_at": "2025-11-02T10:30:00Z",
    "updated_at": "2025-11-02T10:30:00Z",
    "completed_at": null
  }
]
```

### CSV Export Format

```
ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder (min),Created At
1,"Sample Todo",false,"2025-11-10T14:00:00+08:00","high",true,"weekly",60,"2025-11-02T10:30:00Z"
```

```typescript
// lib/export.ts
export function convertTodosToCSV(todos: Todo[]): string {
  const headers = ['ID', 'Title', 'Completed', 'Due Date', 'Priority', 'Recurring', 'Pattern', 'Reminder (min)', 'Created At'];
  const rows = todos.map(t => [
    t.id,
    `"${t.title.replace(/"/g, '""')}"`,  // escape quotes
    t.completed,
    t.due_date ?? '',
    t.priority,
    t.is_recurring,
    t.recurrence_pattern ?? '',
    t.reminder_minutes ?? '',
    t.created_at,
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
```

### Client-Side Import Handler

```typescript
// In app/page.tsx
async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const res = await fetch('/api/todos/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Import failed');
    const { count } = await res.json();
    setSuccessMessage(`Successfully imported ${count} todos`);
    await fetchTodos(); // refresh list
  } catch {
    setErrorMessage('Failed to import todos. Please check the file format.');
  }
  // Reset file input so same file can be re-selected
  event.target.value = '';
}
```

### TypeScript Types

No new types needed beyond existing `Todo` interface. Import accepts a partial todo shape and fills defaults.

---

## UI Components

### Export Buttons (top-right of page)
```tsx
// "Export JSON" — green button
// "Export CSV"  — dark green button
// Both trigger file download via API link: href="/api/todos/export?format=json"
// Or via fetch + Blob URL for more control
```

### Import Button (top-right of page)
```tsx
// "Import" — blue button
// Hidden <input type="file" accept=".json"> triggered on click
// onChange → handleImport()
```

### Success / Error Toast Messages
```tsx
// Green toast: "Successfully imported X todos"
// Red toast: "Failed to import todos. Please check the file format."
// Auto-dismiss after 3 seconds
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Invalid JSON in import file | Return 400 "Invalid JSON format"; show error toast |
| Import file not an array | Return 400 "Expected an array of todos" |
| Todo in import missing title | Skip that item (counted as skipped, not error) |
| Import todo with invalid priority | Default to 'medium' |
| Import todo with invalid recurrence_pattern | Set to null |
| Importing the same file twice | Creates duplicates (import creates new, never deduplicates) |
| Very large export file (>500 todos) | Stream JSON response; no file size limit enforced |
| CSV import not supported | Only JSON can be imported; CSV is export-only |

---

## Acceptance Criteria

- [ ] "Export JSON" button downloads a `.json` file with correct filename
- [ ] "Export CSV" button downloads a `.csv` file with correct filename
- [ ] Exported JSON can be re-imported successfully
- [ ] "Import" button opens file picker (`.json` only)
- [ ] After import, todo list refreshes and new todos appear
- [ ] Success toast shows count of imported todos
- [ ] Error toast shown for invalid file format
- [ ] Import creates NEW todos (does not update existing ones)
- [ ] Imported todos linked to importing user's account
- [ ] Tags and subtasks NOT included in basic import/export (documented limitation)

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/09-export-import.spec.ts
test('export JSON downloads file with correct name');
test('export CSV downloads file with correct name');
test('import valid JSON creates todos in list');
test('import shows success message with count');
test('import invalid JSON shows error message');
test('import missing title field skips that item');
```

### Unit Tests

```typescript
// tests/unit/export.test.ts
test('convertTodosToCSV: correct headers');
test('convertTodosToCSV: escapes quotes in titles');
test('convertTodosToCSV: empty todos returns headers only');
```

---

## Out of Scope

- CSV import
- Tags in export/import
- Subtasks in export/import
- Merge/upsert (import always creates new)
- Conflict detection on import
- Import progress indicator for large files
