'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  PRIORITY_CONFIG,
  sortByPriority,
  filterByPriority,
} from '@/lib/priority';
import type { Priority, Todo } from '@/lib/db';

// ─── Types ──────────────────────────────────────────────────────────────────
// (Todo and Priority imported from lib/db via import type — no runtime cost)

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDueDateColor(due_date: string | null, completed: boolean): string {
  if (!due_date || completed) return 'text-gray-400 dark:text-gray-500';
  const now = Date.now();
  const due = new Date(due_date).getTime();
  const diff = due - now;
  if (diff < 0) return 'text-red-600 dark:text-red-400 font-semibold';
  if (diff < 60 * 60 * 1000) return 'text-red-500 dark:text-red-400';
  if (diff < 24 * 60 * 60 * 1000) return 'text-orange-500 dark:text-orange-400';
  if (diff < 7 * 24 * 60 * 60 * 1000) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-blue-600 dark:text-blue-400';
}

function formatDueDate(due_date: string): string {
  return new Date(due_date).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function isOverdue(todo: Todo): boolean {
  if (todo.completed || !todo.due_date) return false;
  return new Date(todo.due_date).getTime() < Date.now();
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${cfg.bgColor} ${cfg.color} ${cfg.borderColor}`}
    >
      {cfg.label}
    </span>
  );
}

interface EditModalProps {
  todo: Todo;
  onClose: () => void;
  onSave: (updated: Partial<Todo>) => void;
}

function EditModal({ todo, onClose, onSave }: EditModalProps) {
  const [title, setTitle] = useState(todo.title);
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [dueDate, setDueDate] = useState(
    todo.due_date
      ? new Date(todo.due_date).toISOString().slice(0, 16)
      : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    await onSave({
      title: trimmed,
      priority,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Edit Todo
        </h2>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Priority
        </label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Due Date (optional)
        </label>
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="mb-5 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Update'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface TodoCardProps {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

function TodoCard({ todo, onToggle, onEdit, onDelete }: TodoCardProps) {
  const overdue = isOverdue(todo);
  const dueDateColor = getDueDateColor(todo.due_date, todo.completed);

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
        overdue
          ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
          : todo.completed
          ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-70'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
      }`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo)}
        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <span
          className={`block text-sm font-medium ${
            todo.completed
              ? 'line-through text-gray-400 dark:text-gray-500'
              : 'text-gray-900 dark:text-white'
          }`}
        >
          {todo.title}
        </span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <PriorityBadge priority={todo.priority} />
          {todo.due_date && (
            <span className={`text-xs ${dueDateColor}`}>
              {overdue ? '⚠️ ' : ''}
              {formatDueDate(todo.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onEdit(todo)}
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(todo)}
          className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
        >
          Del
        </button>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  todos: Todo[];
  color: string;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

function Section({ title, todos, color, onToggle, onEdit, onDelete }: SectionProps) {
  if (todos.length === 0) return null;
  return (
    <div className="mb-4">
      <h2 className={`mb-2 text-sm font-semibold ${color}`}>
        {title} ({todos.length})
      </h2>
      <div className="flex flex-col gap-2">
        {todos.map((todo) => (
          <TodoCard
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  // Filter state
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Edit modal
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);

  // ── Fetch session & todos ────────────────────────────────────────────────

  const fetchTodos = useCallback(async () => {
    const res = await fetch('/api/todos');
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const data = await res.json();
    setTodos(data.todos ?? []);
  }, [router]);

  useEffect(() => {
    (async () => {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        router.push('/login');
        return;
      }
      const me = await meRes.json();
      setUsername(me.username);
      await fetchTodos();
      setLoading(false);
    })();
  }, [fetchTodos, router]);

  // ── Actions ─────────────────────────────────────────────────────────────

  async function handleAdd() {
    const title = newTitle.trim();
    setAddError('');
    if (!title) {
      setAddError('Title is required');
      return;
    }

    // Optimistic insert
    const optimistic: Todo = {
      id: -Date.now(),
      user_id: 0,
      title,
      completed: false,
      due_date: newDueDate ? new Date(newDueDate).toISOString() : null,
      priority: newPriority,
      is_recurring: false,
      recurrence_pattern: null,
      reminder_minutes: null,
      last_notification_sent: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };
    setTodos((prev) => [optimistic, ...prev]);
    setNewTitle('');
    setNewDueDate('');

    setAdding(true);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          priority: newPriority,
          due_date: newDueDate ? new Date(newDueDate).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setAddError(err.error ?? 'Failed to add todo');
        // Roll back optimistic
        setTodos((prev) => prev.filter((t) => t.id !== optimistic.id));
        setNewTitle(title);
        return;
      }
      const created: Todo = await res.json();
      setTodos((prev) =>
        prev.map((t) => (t.id === optimistic.id ? created : t))
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(todo: Todo) {
    const updated = { ...todo, completed: !todo.completed };
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));

    const res = await fetch(`/api/todos/${todo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !todo.completed }),
    });
    if (!res.ok) {
      // Roll back
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? todo : t)));
    } else {
      const serverTodo: Todo = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === serverTodo.id ? serverTodo : t)));
    }
  }

  async function handleDelete(todo: Todo) {
    // Immediate delete (no confirmation per PRP spec)
    setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    const res = await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' });
    if (!res.ok) {
      // Restore on failure
      setTodos((prev) => [...prev, todo]);
    }
  }

  async function handleSaveEdit(updated: Partial<Todo>) {
    if (!editingTodo) return;
    const original = editingTodo;

    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === original.id ? { ...t, ...updated } : t))
    );

    const res = await fetch(`/api/todos/${original.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (!res.ok) {
      // Roll back
      setTodos((prev) => prev.map((t) => (t.id === original.id ? original : t)));
    } else {
      const serverTodo: Todo = await res.json();
      setTodos((prev) =>
        prev.map((t) => (t.id === serverTodo.id ? serverTodo : t))
      );
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  // ── Derived display data ─────────────────────────────────────────────────

  const filtered = filterByPriority(todos, priorityFilter).filter((t) =>
    searchQuery
      ? t.title.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const overdueTodos = sortByPriority(filtered.filter(isOverdue));
  const pendingTodos = sortByPriority(
    filtered.filter((t) => !t.completed && !isOverdue(t))
  );
  const completedTodos = sortByPriority(filtered.filter((t) => t.completed));

  const overdueCount = todos.filter(isOverdue).length;
  const pendingCount = todos.filter((t) => !t.completed && !isOverdue(t)).length;
  const completedCount = todos.filter((t) => t.completed).length;

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Todo App
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Welcome, {username}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
        >
          Logout
        </button>
      </div>

      {/* Add Todo Form */}
      <div className="mb-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new todo…"
          maxLength={255}
          className="mb-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />

        <div className="flex gap-2">
          {/* Priority dropdown */}
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as Priority)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Due date */}
          <input
            type="datetime-local"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Add button */}
          <button
            onClick={handleAdd}
            disabled={adding || !newTitle.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>

        {addError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{addError}</p>
        )}
      </div>

      {/* Search & Filter */}
      <div className="mb-4 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search todos and subtasks…"
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Priorities</option>
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="low">Low Priority</option>
        </select>
      </div>

      {/* Todo Sections */}
      <div>
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            {todos.length === 0
              ? 'No todos yet. Add your first task!'
              : 'No todos match your filters.'}
          </div>
        ) : (
          <>
            <Section
              title="⚠️ Overdue"
              todos={overdueTodos}
              color="text-red-600 dark:text-red-400"
              onToggle={handleToggle}
              onEdit={setEditingTodo}
              onDelete={handleDelete}
            />
            <Section
              title="Pending"
              todos={pendingTodos}
              color="text-blue-600 dark:text-blue-400"
              onToggle={handleToggle}
              onEdit={setEditingTodo}
              onDelete={handleDelete}
            />
            <Section
              title="Completed"
              todos={completedTodos}
              color="text-green-600 dark:text-green-400"
              onToggle={handleToggle}
              onEdit={setEditingTodo}
              onDelete={handleDelete}
            />
          </>
        )}
      </div>

      {/* Stats bar */}
      {todos.length > 0 && (
        <div className="mt-6 flex justify-around rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {overdueCount}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Overdue</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {pendingCount}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Pending</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {completedCount}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Completed</div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTodo && (
        <EditModal
          todo={editingTodo}
          onClose={() => setEditingTodo(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
