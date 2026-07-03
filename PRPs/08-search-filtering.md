# PRP 08 - Search & Advanced Filtering

## Feature Overview

A powerful real-time search and multi-criteria filtering system. Users can search todo titles and subtask titles, filter by priority, tag, completion status, and date range, combine filters with AND logic, and save commonly used filter combinations as named presets stored in `localStorage`.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Type in a search box to find todos | I can quickly locate a specific task |
| US-02 | User | Search across todo titles AND subtask titles | I find tasks even when the detail is in a subtask |
| US-03 | User | Filter by priority, tag, date range, and completion status | I can view a specific subset of todos |
| US-04 | User | Combine multiple filters simultaneously | I can narrow results precisely |
| US-05 | User | Save a filter combination as a named preset | I can apply my daily workflow filters in one click |
| US-06 | User | Clear all filters with a single button | I can return to the full list instantly |

---

## User Flow

### Basic Search
1. Search bar visible at top of todo list
2. User types — results update in real-time (no submit needed)
3. Matches title AND subtask titles (case-insensitive, partial match)
4. "✕" clear button appears while typing
5. Click ✕ or delete text to clear

### Quick Filters
1. Priority dropdown: All Priorities / High / Medium / Low
2. Tag dropdown: All Tags / [individual tag names] (only if tags exist)
3. Both combine with search (AND logic)
4. "▶ Advanced" button toggles advanced filters panel

### Advanced Filters Panel
1. Click "▶ Advanced" → expands to show additional filters
2. **Completion Status**: All Todos / Incomplete Only / Completed Only
3. **Due Date From**: date input (YYYY-MM-DD)
4. **Due Date To**: date input (YYYY-MM-DD)
5. **Saved Presets**: pills with names; click to apply; ✕ to delete

### Saving a Filter Preset
1. Apply any filters (at least one active)
2. "💾 Save Filter" green button appears
3. Click it → modal opens showing current filter summary
4. Enter a preset name
5. Click "Save" → stored in localStorage

### Applying a Preset
1. Open Advanced panel
2. Click preset name pill
3. All filters applied instantly

### Clearing All Filters
1. Click **"Clear All"** red button (visible when any filter is active)
2. All filters reset to defaults

---

## Technical Requirements

### Search Logic (Client-Side)

```typescript
// lib/search.ts
export function searchTodos(todos: TodoWithSubtasksAndTags[], query: string): TodoWithSubtasksAndTags[] {
  if (!query.trim()) return todos;
  const q = query.toLowerCase().trim();
  return todos.filter(todo => {
    const titleMatch = todo.title.toLowerCase().includes(q);
    const subtaskMatch = todo.subtasks?.some(s => s.title.toLowerCase().includes(q)) ?? false;
    return titleMatch || subtaskMatch;
  });
}
```

### Filter Logic (Client-Side, AND composition)

```typescript
// lib/filters.ts
export interface FilterState {
  search: string;
  priority: Priority | 'all';
  tagId: number | null;
  completion: 'all' | 'incomplete' | 'completed';
  dateFrom: string | null;  // YYYY-MM-DD
  dateTo: string | null;    // YYYY-MM-DD
}

export const DEFAULT_FILTER_STATE: FilterState = {
  search: '',
  priority: 'all',
  tagId: null,
  completion: 'all',
  dateFrom: null,
  dateTo: null,
};

export function applyFilters(
  todos: TodoWithSubtasksAndTags[],
  filters: FilterState
): TodoWithSubtasksAndTags[] {
  let result = todos;

  // 1. Search
  if (filters.search.trim()) {
    result = searchTodos(result, filters.search);
  }

  // 2. Priority
  if (filters.priority !== 'all') {
    result = result.filter(t => t.priority === filters.priority);
  }

  // 3. Tag
  if (filters.tagId !== null) {
    result = result.filter(t => t.tags?.some(tag => tag.id === filters.tagId));
  }

  // 4. Completion
  if (filters.completion === 'incomplete') {
    result = result.filter(t => !t.completed);
  } else if (filters.completion === 'completed') {
    result = result.filter(t => t.completed);
  }

  // 5. Date range (only todos with due_date)
  if (filters.dateFrom) {
    result = result.filter(t => t.due_date && t.due_date >= filters.dateFrom!);
  }
  if (filters.dateTo) {
    result = result.filter(t => t.due_date && t.due_date <= filters.dateTo! + 'T23:59:59');
  }

  return result;
}
```

### Filter Preset Storage (localStorage)

```typescript
// lib/filterPresets.ts
export interface FilterPreset {
  id: string;           // uuid or timestamp-based
  name: string;
  filters: FilterState;
}

const STORAGE_KEY = 'todo-filter-presets';

export function getPresets(): FilterPreset[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function savePreset(name: string, filters: FilterState): void {
  const presets = getPresets();
  presets.push({ id: Date.now().toString(), name, filters });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function deletePreset(id: string): void {
  const presets = getPresets().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
```

### TypeScript Types

```typescript
export type CompletionFilter = 'all' | 'incomplete' | 'completed';

export interface FilterState {
  search: string;
  priority: Priority | 'all';
  tagId: number | null;
  completion: CompletionFilter;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
}
```

### No New API Endpoints Needed

All filtering and search logic runs client-side using the already-fetched todos list. No server-side query parameters needed (though `GET /api/todos?search=&priority=` can optionally be added for performance at scale).

---

## UI Components

### Search Bar
```tsx
// Full-width input
// Icon: 🔍 on left
// Placeholder: "Search todos and subtasks..."
// Clear button (✕) appears when text is entered
// Real-time filtering (no debounce needed for small lists; optional 150ms debounce)
```

### Quick Filter Row (below search bar)
```tsx
// Horizontal row with:
//   Priority dropdown: "All Priorities" | "High Priority" | "Medium Priority" | "Low Priority"
//   Tag dropdown: "All Tags" | [tag names] (only visible if tags exist)
//   "▶ Advanced" toggle button (blue when advanced panel has active filters)
```

### Advanced Filters Panel (collapsible)
```tsx
// Completion status: <select> All Todos | Incomplete Only | Completed Only
// Date range: two <input type="date"> side by side (From / To)
// Saved presets section: pill for each preset + ✕ delete
```

### Active Filter Actions Row
```tsx
// Appears when ANY filter is active:
//   "Clear All" red button — resets all filters
//   "💾 Save Filter" green button — opens save preset modal
```

### Save Filter Modal
```tsx
// Name input (required)
// Preview of current filters:
//   • Search: "query" (if set)
//   • Priority: High (if set)
//   • Tag: Work (if set)
//   • Completion: Incomplete (if not 'all')
//   • Date Range: 2025-11-01 to 2025-11-07 (if set)
// "Save" + "Cancel" buttons
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| All todos filtered out | Show "No results found" empty state per section |
| Search matches only a subtask | Parent todo shown (subtask title not shown in card, but match highlighted) |
| Preset applied with tag that no longer exists | Tag filter set to tagId; if tag not found, effectively no tag filter |
| DateFrom > DateTo | Show validation warning; allow save but results may be empty |
| localStorage unavailable | Presets silently not saved; no crash |
| Very large todo list (>500) | Add 150ms debounce to search input for performance |

---

## Acceptance Criteria

- [ ] Search bar visible above todo list
- [ ] Typing filters todos in real-time (title and subtask title match)
- [ ] Search is case-insensitive and partial-match
- [ ] Clear button (✕) clears search and restores full list
- [ ] Priority dropdown filters by selected priority
- [ ] Tag dropdown filters by selected tag (only visible if tags exist)
- [ ] "▶ Advanced" toggles the advanced filter panel
- [ ] Completion status filter works (All / Incomplete / Completed)
- [ ] Date range filter works independently (From only, To only, both)
- [ ] All active filters use AND logic
- [ ] "Clear All" button resets every filter
- [ ] "💾 Save Filter" saves current filter state to localStorage
- [ ] Saved presets shown as clickable pills in advanced panel
- [ ] Clicking a preset applies all its filters
- [ ] Deleting a preset removes it from localStorage and the panel
- [ ] Section counters (Overdue X, Pending X, Completed X) update with filter results

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/08-search-filter.spec.ts
test('search by todo title shows matching todos');
test('search by subtask title shows parent todo');
test('clear button resets search');
test('priority filter shows correct todos');
test('tag filter shows correct todos');
test('advanced: completion filter incomplete shows only pending/overdue');
test('advanced: date range filter works');
test('multiple filters combine with AND logic');
test('Clear All resets everything');
test('save filter preset and apply it');
test('delete saved preset removes it');
```

### Unit Tests

```typescript
// tests/unit/filters.test.ts
test('searchTodos: matches title');
test('searchTodos: matches subtask title');
test('searchTodos: case-insensitive');
test('searchTodos: empty query returns all');
test('applyFilters: priority filter');
test('applyFilters: completion filter incomplete');
test('applyFilters: date range both bounds');
test('applyFilters: combined filters AND logic');
test('savePreset / getPresets / deletePreset roundtrip');
```

---

## Out of Scope

- Server-side search/filtering (all client-side)
- Full-text search with ranking/relevance
- Fuzzy matching
- Search highlighting within text
- Preset sharing between users/devices
