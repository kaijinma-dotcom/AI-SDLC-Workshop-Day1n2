# PRP 02 - Priority System

## Feature Overview

A three-level priority system (High / Medium / Low) that allows users to categorize todos by urgency. Priorities are represented by color-coded badges, and the todo list automatically sorts by priority. Users can filter the list to show only todos of a specific priority level.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Assign a priority level to a todo | I can distinguish urgent tasks from routine ones |
| US-02 | User | See color-coded priority badges on each todo card | I can instantly identify urgency at a glance |
| US-03 | User | Have todos automatically sorted by priority | The most urgent tasks appear at the top |
| US-04 | User | Filter the todo list to show only a specific priority | I can focus on high-priority work |
| US-05 | User | Change the priority of an existing todo | I can adjust urgency as circumstances change |

---

## User Flow

### Assigning Priority on Create
1. User opens the todo form at the top of the page
2. Priority dropdown visible with options: High / Medium / Low
3. Default selection is **Medium**
4. User selects desired priority and clicks "Add"
5. New todo appears with appropriate color badge

### Changing Priority
1. User clicks "Edit" on an existing todo
2. Current priority is pre-selected in the edit modal dropdown
3. User changes selection and clicks "Update"
4. Todo card badge updates immediately

### Filtering by Priority
1. Priority filter dropdown shows "All Priorities" by default
2. User selects a priority (High / Medium / Low)
3. List re-renders showing only matching todos
4. User selects "All Priorities" to clear filter

### Automatic Sorting
- Sort order: High → Medium → Low
- Within same priority: earlier due date first → newest created first

---

## Technical Requirements

### Database Schema

Priority stored as a `TEXT` column on the `todos` table (see PRP 01):

```sql
priority TEXT NOT NULL DEFAULT 'medium'
-- Valid values: 'high' | 'medium' | 'low'
```

No additional migration needed if PRP 01 schema is used.

### API Endpoints

No new endpoints. Priority is included in:
- `POST /api/todos` request body
- `PUT /api/todos/[id]` request body
- `GET /api/todos` response

### Sorting Logic (Client-Side)

```typescript
// lib/priority.ts
export const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function sortByPriority(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    // Secondary: earlier due date first
    if (a.due_date && b.due_date) {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    // Tertiary: newer created first
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
```

### Filtering Logic (Client-Side)

```typescript
export function filterByPriority(
  todos: Todo[],
  priority: Priority | 'all'
): Todo[] {
  if (priority === 'all') return todos;
  return todos.filter((t) => t.priority === priority);
}
```

### TypeScript Types

```typescript
export type Priority = 'high' | 'medium' | 'low';

export interface PriorityConfig {
  label: string;
  color: string;        // Tailwind text color class
  bgColor: string;      // Tailwind background color class
  borderColor: string;  // Tailwind border color class
}

export const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  high: {
    label: 'High',
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    borderColor: 'border-red-300 dark:border-red-700',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    borderColor: 'border-yellow-300 dark:border-yellow-700',
  },
  low: {
    label: 'Low',
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300 dark:border-blue-700',
  },
};
```

### Validation

Priority must be one of `'high'`, `'medium'`, `'low'`. Any other value → `400 Bad Request` with `{ error: "Invalid priority value" }`.

---

## UI Components

### PriorityBadge (inline on todo card)
```tsx
// Displays a colored badge for a given priority level
// Props: priority: Priority
// Renders: <span> with Tailwind classes from PRIORITY_CONFIG
// Example: <span className="bg-red-100 text-red-700 ...">High</span>
```

### Priority Dropdown (in todo form and edit modal)
```tsx
// <select> with options: High | Medium | Low
// Default value: 'medium'
// Used in create form and edit modal
```

### Priority Filter Dropdown (above todo list)
```tsx
// Dropdown: "All Priorities" | "High Priority" | "Medium Priority" | "Low Priority"
// Active selection highlighted
// Combines with search, tag, date, and completion filters
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Todo created without priority field | Defaults to `'medium'` (DB default + API default) |
| Invalid priority value in API request | 400 Bad Request with descriptive error |
| All todos filtered out by priority | Show empty state per section |
| Priority changed while filter is active | Todo disappears from filtered view if new priority doesn't match |
| Completed todos with priority | Retain priority badge but appear visually muted in Completed section |

---

## Acceptance Criteria

- [ ] Priority dropdown shows three options: High, Medium, Low (default: Medium)
- [ ] High priority badge is red, Medium is yellow/amber, Low is blue
- [ ] Badges visible on every todo card in all sections (Overdue, Pending, Completed)
- [ ] Todo list sorted High → Medium → Low within each section
- [ ] Within same priority, earlier due dates appear first
- [ ] Priority filter dropdown visible above todo list
- [ ] Selecting a priority shows only matching todos
- [ ] "All Priorities" restores full list
- [ ] Priority can be changed via edit modal
- [ ] Dark mode: badge colors adapt correctly

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/02-todo-crud.spec.ts (priority section)
test('create todo with High priority shows red badge');
test('create todo with Low priority shows blue badge');
test('default priority is Medium');
test('priority filter: selecting High shows only high-priority todos');
test('priority filter: selecting All Priorities restores full list');
test('todo list sorted high before medium before low');
test('edit todo changes priority badge');
```

### Unit Tests

```typescript
// tests/unit/priority.test.ts
test('sortByPriority: high before medium before low');
test('sortByPriority: same priority sorted by due date');
test('filterByPriority: "all" returns all todos');
test('filterByPriority: "high" returns only high todos');
test('PRIORITY_CONFIG has correct label for each level');
```

---

## Out of Scope

- Custom priority levels beyond High/Medium/Low
- Priority-based color themes for the entire card background
- Automatic priority suggestions based on due date
- Priority bulk change
