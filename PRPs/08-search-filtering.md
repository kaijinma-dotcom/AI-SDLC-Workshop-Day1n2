# PRP 08 - Search & Filtering

## Feature Overview

Real-time client-side search and multi-criteria filtering for the todo list. Users can search by title and description, perform advanced searches that include tags, and combine multiple filters (priority, completion status, tag, date range). All filtering is performed on the client side for instant responsiveness.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | User | Type in a search box to find todos by title | I can quickly locate a specific task |
| US-02 | User | Search across title, description, and tags | I can find todos regardless of where the keyword appears |
| US-03 | User | Filter todos by completion status | I can see only active or only done tasks |
| US-04 | User | Filter todos by priority | I can focus on urgent tasks |
| US-05 | User | Filter todos by one or more tags | I can see tasks by category |
| US-06 | User | Filter todos by due date range | I can see what's due this week or overdue |
| US-07 | User | Combine multiple filters simultaneously | I can narrow down to exactly the todos I need |
| US-08 | User | Clear all filters with one click | I can quickly return to the full view |

---

## User Flow

### Basic Search
1. A search input is always visible at the top of the todo list
2. As the user types, the list filters in real time (debounced, 150 ms)
3. Matching text in the title is highlighted (bold or marked)
4. If no results: "No todos match '[query]'"
5. Clearing the search input restores the full list

### Advanced Search
1. User clicks an "Advanced" toggle or expands a filter panel
2. Additional filters appear: Status, Priority, Tags, Due Date range
3. Each filter is independent; all active filters are applied simultaneously (AND logic)
4. A "X filters active" badge shows the number of active filters
5. A "Clear all" button resets every filter

### Filter Combinations (AND Logic)
- Status: All | Active | Completed
- Priority: All | High | Medium | Low
- Tags: multi-select (OR within tags, AND with other filter types)
- Due date: None | Overdue | Today | This Week | Custom range (from/to)

Example: "Active todos tagged 'Work' with High priority due this week"

---

## Technical Requirements

### Client-Side Filtering Pipeline

All filtering happens in the browser. The full dataset is loaded once on page mount and filtered in memory.

```typescript
// lib/search.ts
import { isWithinInterval, isBefore, startOfDay, endOfDay,
         startOfWeek, endOfWeek } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const SGT = 'Asia/Singapore';

export interface FilterCriteria {
  query: string;                          // text search
  status: 'all' | 'active' | 'completed';
  priority: 'all' | 'high' | 'medium' | 'low';
  tagIds: number[];                       // OR within tags
  dueDateFilter: 'all' | 'overdue' | 'today' | 'this_week' | 'custom';
  customDateFrom: string | null;          // ISO date
  customDateTo: string | null;            // ISO date
}

export function applyFilters(todos: Todo[], criteria: FilterCriteria): Todo[] {
  const nowSGT = toZonedTime(new Date(), SGT);
  let result = todos;

  // 1. Text search
  if (criteria.query.trim()) {
    const q = criteria.query.toLowerCase().trim();
    result = result.filter((t) => {
      const inTitle = t.title.toLowerCase().includes(q);
      const inDesc = t.description?.toLowerCase().includes(q) ?? false;
      const inTags = t.tags.some((tag) => tag.name.toLowerCase().includes(q));
      return inTitle || inDesc || inTags;
    });
  }

  // 2. Status filter
  if (criteria.status === 'active') result = result.filter((t) => !t.completed);
  if (criteria.status === 'completed') result = result.filter((t) => t.completed);

  // 3. Priority filter
  if (criteria.priority !== 'all') {
    result = result.filter((t) => t.priority === criteria.priority);
  }

  // 4. Tag filter (OR within selected tags)
  if (criteria.tagIds.length > 0) {
    result = result.filter((t) =>
      t.tags.some((tag) => criteria.tagIds.includes(tag.id))
    );
  }

  // 5. Due date filter
  if (criteria.dueDateFilter !== 'all') {
    result = result.filter((t) => {
      if (!t.dueDate) return false;
      const due = toZonedTime(new Date(t.dueDate), SGT);
      switch (criteria.dueDateFilter) {
        case 'overdue':
          return isBefore(due, startOfDay(nowSGT));
        case 'today':
          return isWithinInterval(due, {
            start: startOfDay(nowSGT),
            end: endOfDay(nowSGT),
          });
        case 'this_week':
          return isWithinInterval(due, {
            start: startOfWeek(nowSGT, { weekStartsOn: 1 }),
            end: endOfWeek(nowSGT, { weekStartsOn: 1 }),
          });
        case 'custom':
          if (!criteria.customDateFrom && !criteria.customDateTo) return true;
          const from = criteria.customDateFrom
            ? startOfDay(toZonedTime(new Date(criteria.customDateFrom), SGT))
            : new Date(0);
          const to = criteria.customDateTo
            ? endOfDay(toZonedTime(new Date(criteria.customDateTo), SGT))
            : new Date(8640000000000000);
          return isWithinInterval(due, { start: from, end: to });
      }
    });
  }

  return result;
}
```

### Search Highlighting

```typescript
// lib/highlight.ts
export function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}
```

> **Note:** Render highlighted HTML safely using `dangerouslySetInnerHTML` only after sanitizing the source text (use `DOMPurify` or similar). Since the text comes from our own database, this is low-risk but should be noted.

### Debounce Hook

```typescript
// hooks/useDebounce.ts
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
```

### URL State Persistence

Active filters are reflected in the URL query string so users can share or bookmark filtered views:

```
/?q=grocery&status=active&priority=high&tagIds=1,3&due=today
```

Use Next.js `useSearchParams` and `useRouter` to read/write filter state.

### TypeScript Types

```typescript
// types/search.ts
export type StatusFilter = 'all' | 'active' | 'completed';
export type DueDateFilter = 'all' | 'overdue' | 'today' | 'this_week' | 'custom';

export interface FilterCriteria {
  query: string;
  status: StatusFilter;
  priority: 'all' | Priority;
  tagIds: number[];
  dueDateFilter: DueDateFilter;
  customDateFrom: string | null;
  customDateTo: string | null;
}

export const DEFAULT_FILTERS: FilterCriteria = {
  query: '',
  status: 'all',
  priority: 'all',
  tagIds: [],
  dueDateFilter: 'all',
  customDateFrom: null,
  customDateTo: null,
};
```

---

## UI Components

### SearchBar
```tsx
// Full-width text input with search icon and clear button
// Props: value: string, onChange: (v: string) => void
// Placeholder: "Search todos..."
// Clear button (X) appears when value is non-empty
```

### FilterPanel
```tsx
// Collapsible panel containing all advanced filters
// Shows "N filters active" badge when any filter is not default
// Contains: StatusFilter, PriorityFilter, TagFilter, DueDateFilter components
// "Clear all" button at bottom
interface FilterPanelProps {
  criteria: FilterCriteria;
  tags: Tag[];
  onChange: (criteria: FilterCriteria) => void;
  onClear: () => void;
}
```

### FilterBadge
```tsx
// Badge showing "X active filters" count
// Clicking it opens/closes the filter panel
interface FilterBadgeProps {
  count: number;
  onClick: () => void;
}
```

### EmptySearchState
```tsx
// Shown when no todos match the current filters
// Props: query: string, hasFilters: boolean
// Message: "No todos match '[query]'" or "No todos match the current filters"
// Includes a "Clear search" or "Clear all filters" link
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Search query is only whitespace | Treated as empty search; full list shown |
| Search query has special regex characters | Escaped before building regex |
| All todos filtered out | "No todos match..." empty state shown |
| Custom date range: from > to | Swap from/to automatically OR show validation warning |
| Tag filter with deleted tags in URL | Ignored gracefully; no crash |
| Very large todo list (1000+ todos) | Client-side filtering on 1000 todos is < 10 ms; no pagination needed initially |
| Combined filters return 0 results | Show empty state with "Clear all filters" option |
| URL query params with invalid values | Fall back to `DEFAULT_FILTERS`; no crash |

---

## Acceptance Criteria

- [ ] Search input is always visible; filters in real time with 150 ms debounce
- [ ] Search matches title, description, and tag names
- [ ] Matching text is highlighted in search results
- [ ] Status filter: All / Active / Completed works correctly
- [ ] Priority filter works and is independent of search
- [ ] Tag filter supports multi-select with OR logic
- [ ] Due date filter has: All / Overdue / Today / This Week / Custom range
- [ ] All filters can be combined (AND logic across filter types)
- [ ] Active filter count badge shows number of active non-default filters
- [ ] "Clear all" button resets all filters and search
- [ ] Filtered view is reflected in URL query params
- [ ] Refreshing page with URL params restores the same filtered view
- [ ] Empty state shown when no results match
- [ ] All date comparisons use Singapore timezone
- [ ] Filtering 1000 todos takes < 50 ms (client-side performance)

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/search-filtering.spec.ts

test('search by title shows matching todos', async ({ page }) => { /* ... */ });
test('search by description shows matching todos', async ({ page }) => { /* ... */ });
test('search by tag name shows matching todos', async ({ page }) => { /* ... */ });
test('search with no results shows empty state', async ({ page }) => { /* ... */ });
test('status filter: active shows only incomplete todos', async ({ page }) => { /* ... */ });
test('status filter: completed shows only done todos', async ({ page }) => { /* ... */ });
test('priority filter: high shows only high priority', async ({ page }) => { /* ... */ });
test('tag filter: selecting tag filters list', async ({ page }) => { /* ... */ });
test('due date filter: overdue shows only past-due todos', async ({ page }) => { /* ... */ });
test('clear all filters restores full list', async ({ page }) => { /* ... */ });
test('URL params restore filter state on refresh', async ({ page }) => { /* ... */ });
```

### Unit Tests

```typescript
// tests/unit/search.test.ts
test('applyFilters: text search matches title');
test('applyFilters: text search matches description');
test('applyFilters: text search matches tag name');
test('applyFilters: status active filters completed todos');
test('applyFilters: priority filter works correctly');
test('applyFilters: tag filter uses OR logic');
test('applyFilters: overdue filter uses SGT');
test('applyFilters: today filter uses SGT');
test('applyFilters: combined filters use AND logic');
test('highlightMatch: wraps matching text in <mark>');
test('highlightMatch: escapes regex special characters');
test('useDebounce: debounces value changes');
```

---

## Out of Scope

- Server-side full-text search (SQLite FTS5)
- Saved/named search presets
- Natural language search queries
- Fuzzy/approximate matching
- Search history / autocomplete

---

## Success Metrics

- Search renders filtered results within 150 ms of user stopping typing
- Client-side filtering of 1000 todos takes < 50 ms
- All filter combinations tested by E2E suite
- Zero crashes on malformed URL query parameters
