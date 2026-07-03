'use client';

import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  PRIORITY_CONFIG,
  sortByPriority,
  filterByPriority,
} from '@/lib/priority';
import { LEAD_TIME_OPTIONS, getReminderBadge } from '@/lib/reminders';
import { useNotifications, requestNotificationPermission } from '@/lib/hooks/useNotifications';
import type { Priority, RecurrencePattern, Subtask, Tag, Todo } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TodoWithExtras extends Todo {
  subtasks: Subtask[];
  tags: Tag[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── PriorityBadge ───────────────────────────────────────────────────────────

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

// ─── TagPill ─────────────────────────────────────────────────────────────────

interface TagPillProps {
  tag: Tag;
  selected?: boolean;
  onClick?: () => void;
}

function TagPill({ tag, selected, onClick }: TagPillProps) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border transition-colors"
        style={
          selected
            ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' }
            : { backgroundColor: 'transparent', borderColor: '#d1d5db', color: '#6b7280' }
        }
      >
        {selected && <span>&#10003;</span>}
        {tag.name}
      </button>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.name}
    </span>
  );
}

// ─── TagManagementModal ───────────────────────────────────────────────────────

interface TagManagementModalProps {
  tags: Tag[];
  onClose: () => void;
  onTagCreated: (tag: Tag) => void;
  onTagUpdated: (tag: Tag) => void;
  onTagDeleted: (tagId: number) => void;
}

function TagManagementModal({
  tags,
  onClose,
  onTagCreated,
  onTagUpdated,
  onTagDeleted,
}: TagManagementModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required'); return; }
    if (trimmed.length > 50) { setError('Name must be 50 characters or fewer'); return; }
    setCreating(true);
    setError('');
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, color }),
    });
    setCreating(false);
    if (!res.ok) {
      const err = await res.json();
      setError(err.error ?? 'Failed to create tag');
      return;
    }
    const created: Tag = await res.json();
    onTagCreated(created);
    setName('');
    setColor('#3B82F6');
  }

  async function handleSaveEdit() {
    if (!editingTag) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/tags/${editingTag.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, color: editColor }),
    });
    if (!res.ok) return;
    const updated: Tag = await res.json();
    onTagUpdated(updated);
    setEditingTag(null);
  }

  async function handleDelete(tagId: number) {
    const res = await fetch(`/api/tags/${tagId}`, { method: 'DELETE' });
    if (res.ok) onTagDeleted(tagId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Manage Tags</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">&#10005;</button>
        </div>

        <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
          <div className="mb-2 flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tag name"
              maxLength={50}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-gray-300 dark:border-gray-600 p-1"
            />
          </div>
          {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating...' : '+ Create Tag'}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {tags.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">No tags yet</p>
          )}
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2">
              {editingTag?.id === tag.id ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={50}
                    className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                  />
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-gray-300 dark:border-gray-600 p-0.5"
                  />
                  <button onClick={handleSaveEdit} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">Save</button>
                  <button onClick={() => setEditingTag(null)} className="text-xs text-gray-500 hover:underline">Cancel</button>
                </>
              ) : (
                <>
                  <span className="h-4 w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="flex-1 text-sm text-gray-900 dark:text-white">{tag.name}</span>
                  <button
                    onClick={() => { setEditingTag(tag); setEditName(tag.name); setEditColor(tag.color); }}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >Edit</button>
                  <button onClick={() => handleDelete(tag.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Del</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SubtaskSection ───────────────────────────────────────────────────────────

interface SubtaskSectionProps {
  todo: TodoWithExtras;
  onSubtasksChange: (todoId: number, subtasks: Subtask[]) => void;
}

function SubtaskSection({ todo, onSubtasksChange }: SubtaskSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [inputError, setInputError] = useState('');

  const { subtasks } = todo;
  const total = subtasks.length;
  const doneCount = subtasks.filter((s) => s.completed).length;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  async function handleAddSubtask() {
    const title = newTitle.trim();
    if (!title) { setInputError('Title is required'); return; }
    setAdding(true);
    setInputError('');
    const res = await fetch(`/api/todos/${todo.id}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    setAdding(false);
    if (!res.ok) return;
    const created: Subtask = await res.json();
    onSubtasksChange(todo.id, [...subtasks, created]);
    setNewTitle('');
  }

  async function handleToggleSubtask(subtask: Subtask) {
    onSubtasksChange(todo.id, subtasks.map((s) => (s.id === subtask.id ? { ...s, completed: !s.completed } : s)));
    const res = await fetch(`/api/todos/${todo.id}/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !subtask.completed }),
    });
    if (!res.ok) {
      onSubtasksChange(todo.id, subtasks);
    } else {
      const updated: Subtask = await res.json();
      onSubtasksChange(todo.id, subtasks.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleDeleteSubtask(subtaskId: number) {
    onSubtasksChange(todo.id, subtasks.filter((s) => s.id !== subtaskId));
    await fetch(`/api/todos/${todo.id}/subtasks/${subtaskId}`, { method: 'DELETE' });
  }

  return (
    <div className="mt-2">
      {total > 0 && (
        <div className="mb-1">
          <div className="mb-0.5 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">{doneCount}/{total} subtasks</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{percent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
            <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        {expanded ? '▼' : '▶'} Subtasks{total > 0 ? ` (${total})` : ''}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1">
          {subtasks.map((subtask) => (
            <div key={subtask.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={subtask.completed}
                onChange={() => handleToggleSubtask(subtask)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className={`flex-1 text-xs ${subtask.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                {subtask.title}
              </span>
              <button
                type="button"
                onClick={() => handleDeleteSubtask(subtask.id)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >&#10005;</button>
            </div>
          ))}
          <div className="flex gap-1 pt-1">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add subtask..."
              maxLength={255}
              className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
            />
            <button
              type="button"
              onClick={handleAddSubtask}
              disabled={adding || !newTitle.trim()}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >Add</button>
          </div>
          {inputError && <p className="text-xs text-red-600 dark:text-red-400">{inputError}</p>}
        </div>
      )}
    </div>
  );
}

// ─── EditModal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  todo: TodoWithExtras;
  allTags: Tag[];
  onClose: () => void;
  onSave: (updated: Partial<Todo> & { tagIds: number[] }) => void;
}

function EditModal({ todo, allTags, onClose, onSave }: EditModalProps) {
  const [title, setTitle] = useState(todo.title);
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [dueDate, setDueDate] = useState(
    todo.due_date ? new Date(todo.due_date).toISOString().slice(0, 16) : ''
  );
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(todo.reminder_minutes ?? null);
  const [isRecurring, setIsRecurring] = useState(todo.is_recurring);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>(
    todo.recurrence_pattern ?? 'weekly'
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(todo.tags.map((t) => t.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) { setError('Title is required'); return; }
    if (isRecurring && !dueDate) { setError('Recurring todos require a due date'); return; }
    setSaving(true);
    setError('');
    await onSave({
      title: trimmed,
      priority,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      reminder_minutes: dueDate ? reminderMinutes : null,
      is_recurring: isRecurring,
      recurrence_pattern: isRecurring ? recurrencePattern : null,
      tagIds: selectedTagIds,
    });
    setSaving(false);
    onClose();
  }

  function toggleTag(tagId: number) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Edit Todo</h2>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
        )}

        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Due Date (optional)</label>
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => {
            setDueDate(e.target.value);
            if (!e.target.value) { setReminderMinutes(null); setIsRecurring(false); }
          }}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Reminder</label>
        <select
          value={reminderMinutes ?? ''}
          onChange={(e) => setReminderMinutes(e.target.value === '' ? null : Number(e.target.value))}
          disabled={!dueDate}
          title={!dueDate ? 'Set a due date first' : undefined}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {LEAD_TIME_OPTIONS.map((opt) => (
            <option key={opt.value ?? 'none'} value={opt.value ?? ''}>{opt.label}</option>
          ))}
        </select>

        <div className="mb-3 flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              disabled={!dueDate}
              className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
            />
            <span className={`text-sm font-medium ${!dueDate ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
              Repeat
            </span>
          </label>
          {isRecurring && (
            <select
              value={recurrencePattern}
              onChange={(e) => setRecurrencePattern(e.target.value as RecurrencePattern)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          )}
        </div>

        {allTags.length > 0 && (
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <TagPill key={tag.id} tag={tag} selected={selectedTagIds.includes(tag.id)} onClick={() => toggleTag(tag.id)} />
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{saving ? 'Saving...' : 'Update'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── TodoCard ─────────────────────────────────────────────────────────────────

interface TodoCardProps {
  todo: TodoWithExtras;
  onToggle: (todo: TodoWithExtras) => void;
  onEdit: (todo: TodoWithExtras) => void;
  onDelete: (todo: TodoWithExtras) => void;
  onSubtasksChange: (todoId: number, subtasks: Subtask[]) => void;
}

function TodoCard({ todo, onToggle, onEdit, onDelete, onSubtasksChange }: TodoCardProps) {
  const overdue = isOverdue(todo);
  const dueDateColor = getDueDateColor(todo.due_date, todo.completed);

  return (
    <div
      className={`rounded-xl border px-4 py-3 transition-colors ${
        overdue
          ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
          : todo.completed
          ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-70'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo)}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div className="min-w-0 flex-1">
          <span
            className={`block text-sm font-medium ${
              todo.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'
            }`}
          >
            {todo.title}
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <PriorityBadge priority={todo.priority} />
            {todo.is_recurring && todo.recurrence_pattern && (
              <span
                className="inline-flex items-center rounded-full border border-purple-300 bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                title={`Repeats ${todo.recurrence_pattern}`}
              >
                &#128260; {todo.recurrence_pattern}
              </span>
            )}
            {todo.due_date && (
              <span className={`text-xs ${dueDateColor}`}>
                {overdue ? '⚠️ ' : ''}{formatDueDate(todo.due_date)}
              </span>
            )}
            {todo.reminder_minutes !== null && todo.reminder_minutes !== undefined && (
              <span className="inline-flex items-center rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                &#128276; {getReminderBadge(todo.reminder_minutes)}
              </span>
            )}
            {todo.tags.map((tag) => (
              <TagPill key={tag.id} tag={tag} />
            ))}
          </div>
          <SubtaskSection todo={todo} onSubtasksChange={onSubtasksChange} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => onEdit(todo)}
            className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >Edit</button>
          <button
            onClick={() => onDelete(todo)}
            className="text-xs font-medium text-red-600 transition-colors hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
          >Del</button>
        </div>
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  todos: TodoWithExtras[];
  color: string;
  onToggle: (todo: TodoWithExtras) => void;
  onEdit: (todo: TodoWithExtras) => void;
  onDelete: (todo: TodoWithExtras) => void;
  onSubtasksChange: (todoId: number, subtasks: Subtask[]) => void;
}

function Section({ title, todos, color, onToggle, onEdit, onDelete, onSubtasksChange }: SectionProps) {
  if (todos.length === 0) return null;
  return (
    <div className="mb-4">
      <h2 className={`mb-2 text-sm font-semibold ${color}`}>{title} ({todos.length})</h2>
      <div className="flex flex-col gap-2">
        {todos.map((todo) => (
          <TodoCard
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onSubtasksChange={onSubtasksChange}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [todos, setTodos] = useState<TodoWithExtras[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newReminderMinutes, setNewReminderMinutes] = useState<number | null>(null);
  const [newIsRecurring, setNewIsRecurring] = useState(false);
  const [newRecurrencePattern, setNewRecurrencePattern] = useState<RecurrencePattern>('weekly');
  const [newSelectedTagIds, setNewSelectedTagIds] = useState<number[]>([]);

  // Notification permission state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);

  // Filter state
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [editingTodo, setEditingTodo] = useState<TodoWithExtras | null>(null);
  const [showTagModal, setShowTagModal] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchTodos = useCallback(async () => {
    const res = await fetch('/api/todos');
    if (res.status === 401) { router.push('/login'); return; }
    const data = await res.json();
    setTodos(data.todos ?? []);
  }, [router]);

  const fetchTags = useCallback(async () => {
    const res = await fetch('/api/tags');
    if (res.ok) {
      const data = await res.json();
      setTags(data.tags ?? []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) { router.push('/login'); return; }
      const me = await meRes.json();
      setUsername(me.username);
      await Promise.all([fetchTodos(), fetchTags()]);
      setLoading(false);
    })();
  }, [fetchTodos, fetchTags, router]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
      const dismissed = localStorage.getItem('notif-banner-dismissed') === '1';
      setNotifBannerDismissed(dismissed);
    }
  }, []);

  useNotifications(notifPermission === 'granted');

  async function handleEnableNotifications() {
    const result = await requestNotificationPermission();
    setNotifPermission(result);
  }

  function handleDismissBanner() {
    setNotifBannerDismissed(true);
    localStorage.setItem('notif-banner-dismissed', '1');
  }

  // ── Tag management ────────────────────────────────────────────────────────

  function handleTagCreated(tag: Tag) {
    setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function handleTagUpdated(updated: Tag) {
    setTags((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setTodos((prev) =>
      prev.map((todo) => ({ ...todo, tags: todo.tags.map((t) => (t.id === updated.id ? updated : t)) }))
    );
  }

  function handleTagDeleted(tagId: number) {
    setTags((prev) => prev.filter((t) => t.id !== tagId));
    setTodos((prev) =>
      prev.map((todo) => ({ ...todo, tags: todo.tags.filter((t) => t.id !== tagId) }))
    );
    if (tagFilter === tagId) setTagFilter(null);
    setNewSelectedTagIds((prev) => prev.filter((id) => id !== tagId));
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleAdd() {
    const title = newTitle.trim();
    setAddError('');
    if (!title) { setAddError('Title is required'); return; }
    if (newIsRecurring && !newDueDate) { setAddError('Recurring todos require a due date'); return; }

    const capturedTagIds = newSelectedTagIds;

    const optimistic: TodoWithExtras = {
      id: -Date.now(),
      user_id: 0,
      title,
      completed: false,
      due_date: newDueDate ? new Date(newDueDate).toISOString() : null,
      priority: newPriority,
      is_recurring: newIsRecurring,
      recurrence_pattern: newIsRecurring ? newRecurrencePattern : null,
      reminder_minutes: newDueDate ? newReminderMinutes : null,
      last_notification_sent: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      subtasks: [],
      tags: tags.filter((t) => capturedTagIds.includes(t.id)),
    };
    setTodos((prev) => [optimistic, ...prev]);
    setNewTitle('');
    setNewDueDate('');
    setNewIsRecurring(false);
    setNewSelectedTagIds([]);

    setAdding(true);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          priority: newPriority,
          due_date: newDueDate ? new Date(newDueDate).toISOString() : null,
          reminder_minutes: newDueDate ? newReminderMinutes : null,
          is_recurring: newIsRecurring,
          recurrence_pattern: newIsRecurring ? newRecurrencePattern : null,
          tagIds: capturedTagIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setAddError(err.error ?? 'Failed to add todo');
        setTodos((prev) => prev.filter((t) => t.id !== optimistic.id));
        setNewTitle(title);
        return;
      }
      const created: TodoWithExtras = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === optimistic.id ? created : t)));
      setNewReminderMinutes(null);
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(todo: TodoWithExtras) {
    const updated = { ...todo, completed: !todo.completed };
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));

    const res = await fetch(`/api/todos/${todo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !todo.completed }),
    });
    if (!res.ok) {
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? todo : t)));
    } else {
      const data = await res.json();
      const serverTodo: Todo = data.todo ?? data;
      const nextTodo: (Todo & { subtasks: Subtask[]; tags: Tag[] }) | null = data.nextTodo ?? null;
      setTodos((prev) => {
        const mapped = prev.map((t) =>
          t.id === serverTodo.id ? { ...serverTodo, subtasks: t.subtasks, tags: t.tags } : t
        );
        if (nextTodo) {
          return [
            { ...nextTodo, subtasks: nextTodo.subtasks ?? [], tags: nextTodo.tags ?? todo.tags },
            ...mapped,
          ];
        }
        return mapped;
      });
    }
  }

  async function handleDelete(todo: TodoWithExtras) {
    setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    const res = await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' });
    if (!res.ok) { setTodos((prev) => [...prev, todo]); }
  }

  async function handleSaveEdit(updated: Partial<Todo> & { tagIds: number[] }) {
    if (!editingTodo) return;
    const original = editingTodo;
    const { tagIds, ...todoFields } = updated;

    setTodos((prev) =>
      prev.map((t) =>
        t.id === original.id
          ? { ...t, ...todoFields, tags: tags.filter((tag) => tagIds.includes(tag.id)) }
          : t
      )
    );

    const res = await fetch(`/api/todos/${original.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...todoFields, tagIds }),
    });
    if (!res.ok) {
      setTodos((prev) => prev.map((t) => (t.id === original.id ? original : t)));
    } else {
      const data = await res.json();
      const serverTodo: Todo = data.todo ?? data;
      setTodos((prev) =>
        prev.map((t) =>
          t.id === serverTodo.id
            ? { ...serverTodo, subtasks: t.subtasks, tags: tags.filter((tag) => tagIds.includes(tag.id)) }
            : t
        )
      );
    }
  }

  function handleSubtasksChange(todoId: number, subtasks: Subtask[]) {
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, subtasks } : t)));
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
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

      if (!res.ok) {
        throw new Error('Import failed');
      }

      const { count } = (await res.json()) as { count: number };
      setSuccessMessage(`Successfully imported ${count} todos`);
      setErrorMessage('');
      setTimeout(() => setSuccessMessage(''), 3000);
      await fetchTodos();
    } catch {
      setErrorMessage('Failed to import todos. Please check the file format.');
      setSuccessMessage('');
      setTimeout(() => setErrorMessage(''), 3000);
    }

    event.target.value = '';
  }

  // ── Derived display data ─────────────────────────────────────────────────

  // ── Derived display data ──────────────────────────────────────────────────

  const filtered = filterByPriority(todos, priorityFilter)
    .filter((t) => (tagFilter !== null ? t.tags.some((tag) => tag.id === tagFilter) : true))
    .filter((t) =>
      searchQuery
        ? t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.subtasks.some((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
        : true
    );

  const overdueTodos = sortByPriority(filtered.filter(isOverdue));
  const pendingTodos = sortByPriority(filtered.filter((t) => !t.completed && !isOverdue(t)));
  const completedTodos = sortByPriority(filtered.filter((t) => t.completed));

  const overdueCount = todos.filter(isOverdue).length;
  const pendingCount = todos.filter((t) => !t.completed && !isOverdue(t)).length;
  const completedCount = todos.filter((t) => t.completed).length;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {successMessage && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-100 px-4 py-3 text-sm text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-100 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Todo App
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Welcome, {username}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleEnableNotifications}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                notifPermission === 'granted'
                  ? 'bg-green-600 text-white cursor-default'
                  : 'bg-orange-500 hover:bg-orange-600 text-white'
              }`}
            >
              {notifPermission === 'granted' ? '🔔 Notifications On' : '🔔 Enable Notifications'}
            </button>
            <button
              onClick={handleLogout}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href="/api/todos/export?format=json"
            download
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            Export JSON
          </a>
          <a
            href="/api/todos/export?format=csv"
            download
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800"          >
            Export CSV
          </a>
          <button
            onClick={() => importInputRef.current?.click()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Import
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <a
            href="/calendar"
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
          >
            Calendar
          </a>
        </div>
      </div>

      {/* Notification denied banner */}
      {notifPermission === 'denied' && !notifBannerDismissed && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 dark:border-yellow-700 dark:bg-yellow-900/20">
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            Reminders are blocked. Enable notifications in your browser settings.
          </p>
          <button
            onClick={handleDismissBanner}
            className="ml-4 shrink-0 text-xs text-yellow-600 hover:underline dark:text-yellow-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Add Todo Form */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new todo..."
          maxLength={255}
          className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />

        <div className="mb-2 flex gap-2">
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as Priority)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <input
            type="datetime-local"
            value={newDueDate}
            onChange={(e) => {
              setNewDueDate(e.target.value);
              if (!e.target.value) { setNewReminderMinutes(null); setNewIsRecurring(false); }
            }}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />

          <select
            value={newReminderMinutes ?? ''}
            onChange={(e) => setNewReminderMinutes(e.target.value === '' ? null : Number(e.target.value))}
            disabled={!newDueDate}
            title={!newDueDate ? 'Set a due date first' : 'Reminder'}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            {LEAD_TIME_OPTIONS.map((opt) => (
              <option key={opt.value ?? 'none'} value={opt.value ?? ''}>
                {opt.value === null ? '&#128276; Reminder' : `&#128276; ${opt.badge}`}
              </option>
            ))}
          </select>

          <button
            onClick={handleAdd}
            disabled={adding || !newTitle.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {/* Recurrence */}
        <div className="mb-2 flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={newIsRecurring}
              onChange={(e) => setNewIsRecurring(e.target.checked)}
              disabled={!newDueDate}
              className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
            />
            <span className={`text-sm ${!newDueDate ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
              Repeat
            </span>
          </label>
          {newIsRecurring && (
            <select
              value={newRecurrencePattern}
              onChange={(e) => setNewRecurrencePattern(e.target.value as RecurrencePattern)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          )}
        </div>

        {/* Tag pills */}
        {tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <TagPill
                key={tag.id}
                tag={tag}
                selected={newSelectedTagIds.includes(tag.id)}
                onClick={() =>
                  setNewSelectedTagIds((prev) =>
                    prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                  )
                }
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowTagModal(true)}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            + Manage Tags
          </button>
        </div>

        {addError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{addError}</p>}
      </div>

      {/* Search & Filter */}
      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search todos and subtasks..."
          className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
        <div className="flex gap-2">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          {tags.length > 0 && (
            <select
              value={tagFilter ?? ''}
              onChange={(e) => setTagFilter(e.target.value === '' ? null : Number(e.target.value))}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">All Tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Todo Sections */}
      <div>
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            {todos.length === 0 ? 'No todos yet. Add your first task!' : 'No todos match your filters.'}
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
              onSubtasksChange={handleSubtasksChange}
            />
            <Section
              title="Pending"
              todos={pendingTodos}
              color="text-blue-600 dark:text-blue-400"
              onToggle={handleToggle}
              onEdit={setEditingTodo}
              onDelete={handleDelete}
              onSubtasksChange={handleSubtasksChange}
            />
            <Section
              title="Completed"
              todos={completedTodos}
              color="text-green-600 dark:text-green-400"
              onToggle={handleToggle}
              onEdit={setEditingTodo}
              onDelete={handleDelete}
              onSubtasksChange={handleSubtasksChange}
            />
          </>
        )}
      </div>

      {/* Stats */}
      {todos.length > 0 && (
        <div className="mt-6 flex justify-around rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 text-center">
          <div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{overdueCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Overdue</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{pendingCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Pending</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{completedCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Completed</div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTodo && (
        <EditModal
          todo={editingTodo}
          allTags={tags}
          onClose={() => setEditingTodo(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Tag Management Modal */}
      {showTagModal && (
        <TagManagementModal
          tags={tags}
          onClose={() => setShowTagModal(false)}
          onTagCreated={handleTagCreated}
          onTagUpdated={handleTagUpdated}
          onTagDeleted={handleTagDeleted}
        />
      )}
    </div>
  );
}
