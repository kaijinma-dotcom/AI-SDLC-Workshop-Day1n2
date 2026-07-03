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
1. User opens the "Add Todo" form
2. A priority selector (dropdown or segmented control) is visible with options: High, Medium, Low
3. Default selection is **Medium**
4. User selects desired priority and submits the form
5. The new todo appears with the appropriate color badge

### Changing Priority
1. User opens the edit form/modal for an existing todo
2. The current priority is pre-selected in the priority control
3. User changes selection and saves
4. Todo card badge updates immediately (optimistic UI)

### Filtering by Priority
1. Filter bar at the top of the todo list shows: All | High | Medium | Low
2. User clicks a priority filter button
3. List re-renders showing only todos matching the selected priority
4. Active filter button is highlighted
5. User can click the active filter again (or "All") to clear the filter

### Automatic Sorting
- Default sort order: High → Medium → Low, then by `createdAt` descending within each priority level
- Sorting is applied client-side after data is fetched

---

## Technical Requirements

### Database Changes

Priority is stored as a `TEXT` column on the `todos` table (defined in PRP 01):

```sql
priority TEXT NOT NULL DEFAULT 'medium'
-- Valid values: 'high' | 'medium' | 'low'
```

No migration needed if PRP 01 schema is used from the start.

### API Endpoints

No new endpoints are needed. The existing `GET /api/todos` supports `?priority=high|medium|low` query parameter.

Priority is included in `POST /api/todos` and `PUT /api/todos/[id]` request bodies.

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
    // Secondary: newer todos first within same priority
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
```

### Filtering Logic (Client-Side)

```typescript
export function filterByPriority(
  todos: Todo[],
  priority: 'high' | 'medium' | 'low' | 'all'
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
  color: string;       // Tailwind text color class
  bgColor: string;     // Tailwind background color class
  borderColor: string; // Tailwind border color class
}

export const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  high: {
    label: 'High',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-300',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    borderColor: 'border-yellow-300',
  },
  low: {
    label: 'Low',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-300',
  },
};
```

### Validation

Priority must be one of `'high'`, `'medium'`, `'low'`. Any other value → 400 Bad Request with `{ error: "Invalid priority value" }`.

---

## UI Components

### PriorityBadge
```tsx
// Displays a color-coded badge for a given priority level
// Props: priority: Priority
// Renders: <span> with appropriate Tailwind classes from PRIORITY_CONFIG
interface PriorityBadgeProps {
  priority: Priority;
}
```

### PrioritySelect
```tsx
// Dropdown or segmented control for selecting priority
// Props: value: Priority, onChange: (p: Priority) => void
// Used in: TodoForm (create and edit)
interface PrioritySelectProps {
  value: Priority;
  onChange: (priority: Priority) => void;
}
```

### PriorityFilter
```tsx
// Filter bar rendered above the todo list
// Props: activeFilter: Priority | 'all', onFilterChange: (f: Priority | 'all') => void
// Renders: "All | High | Medium | Low" button group
// Active button has distinct visual treatment
interface PriorityFilterProps {
  activeFilter: Priority | 'all';
  onFilterChange: (filter: Priority | 'all') => void;
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Todo created without priority field | Defaults to `'medium'` (DB default + API default) |
| Invalid priority value in API request | 400 Bad Request with descriptive error |
| All todos filtered out by priority | Show empty state: "No [priority] priority todos" |
| Priority changed while filter is active | If new priority doesn't match filter, todo disappears from filtered view |
| Completed todos with priority | Completed todos retain priority but appear visually muted |

---

## Acceptance Criteria

- [ ] Priority select shows three options: High, Medium, Low (default: Medium)
- [ ] Each priority has a unique, accessible color-coded badge
- [ ] High priority badge is red, Medium is yellow/amber, Low is green
- [ ] Todo list defaults to High → Medium → Low sort order
- [ ] Within the same priority, newer todos appear first
- [ ] Filter buttons (All / High / Medium / Low) are visible above the list
- [ ] Selecting a filter shows only matching todos
- [ ] Active filter is visually highlighted
- [ ] Clearing filter restores full list
- [ ] Priority can be changed via the edit form
- [ ] API rejects invalid priority values with 400
- [ ] Priority badge is visible on each todo card

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/priority.spec.ts

test('create todo with high priority shows red badge', async ({ page }) => { /* ... */ });
test('create todo with low priority shows green badge', async ({ page }) => { /* ... */ });
test('default priority is medium', async ({ page }) => { /* ... */ });
test('todos are sorted high before medium before low', async ({ page }) => { /* ... */ });
test('filter by high shows only high priority todos', async ({ page }) => { /* ... */ });
test('filter by all restores full list', async ({ page }) => { /* ... */ });
test('change priority via edit form updates badge', async ({ page }) => { /* ... */ });
test('empty state when no todos match filter', async ({ page }) => { /* ... */ });
```

### Unit Tests

```typescript
// tests/unit/priority.test.ts
test('sortByPriority: high before medium before low');
test('sortByPriority: within same priority, newer first');
test('filterByPriority: returns all when filter is "all"');
test('filterByPriority: returns only matching priority');
test('PRIORITY_CONFIG has entries for high, medium, low');
```

---

## Out of Scope

- Custom priority levels (user-defined)
- Numeric priority values
- Priority-based notifications or escalation
- Server-side sorting (client-side is sufficient)

---

## Success Metrics

- Priority filter renders in < 100 ms (pure client-side)
- Color contrast of badges meets WCAG AA (4.5:1 ratio)
- 100% of priority values validated at API boundary
