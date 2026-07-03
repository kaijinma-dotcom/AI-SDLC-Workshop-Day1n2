// lib/db.ts
// Single source of truth for all database operations.
// Uses better-sqlite3 (synchronous SQLite — no async/await needed).

import Database from 'better-sqlite3';
import path from 'path';
import { getSingaporeNow } from './timezone';

// ─── Types ─────────────────────────────────────────────────────────────────

export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;         // ISO 8601 with SGT offset (+08:00)
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;              // ISO 8601 UTC
  updated_at: string;              // ISO 8601 UTC
  completed_at: string | null;     // ISO 8601 UTC
}

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: string;
  counter: number;
  transports: string | null;
  created_at: string;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  year: number;
}

export interface CalendarDay {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  todos: Todo[];
  holiday: Holiday | null;
}

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSubtaskInput {
  todo_id: number;
  title: string;
}

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Template {
  id: number;
  user_id: number;
  name: string;
  title_template: string;
  description: string | null;
  category: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  user_id: number;
  name: string;
  title_template: string;
  description?: string | null;
  category?: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}

// ─── Database Initialisation ────────────────────────────────────────────────

const DB_PATH = path.join(process.cwd(), 'todos.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS authenticators (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id        TEXT NOT NULL UNIQUE,
      credential_public_key TEXT NOT NULL,
      counter              INTEGER NOT NULL DEFAULT 0,
      transports           TEXT,
      created_at           TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todos (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title                 TEXT NOT NULL,
      completed             INTEGER NOT NULL DEFAULT 0,
      due_date              TEXT,
      priority              TEXT NOT NULL DEFAULT 'medium',
      is_recurring          INTEGER NOT NULL DEFAULT 0,
      recurrence_pattern    TEXT,
      reminder_minutes      INTEGER,
      last_notification_sent TEXT,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL,
      completed_at          TEXT
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      date  TEXT NOT NULL UNIQUE,
      name  TEXT NOT NULL,
      year  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id    INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      completed  INTEGER NOT NULL DEFAULT 0,
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#3B82F6',
      created_at TEXT NOT NULL,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS todo_tags (
      todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (todo_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
    CREATE INDEX IF NOT EXISTS idx_holidays_year ON holidays(year);
    CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);
    CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
    CREATE INDEX IF NOT EXISTS idx_todo_tags_todo_id ON todo_tags(todo_id);
    CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_id ON todo_tags(tag_id);

    CREATE TABLE IF NOT EXISTS templates (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name               TEXT NOT NULL,
      title_template     TEXT NOT NULL,
      description        TEXT,
      category           TEXT,
      priority           TEXT NOT NULL DEFAULT 'medium',
      is_recurring       INTEGER NOT NULL DEFAULT 0,
      recurrence_pattern TEXT,
      reminder_minutes   INTEGER,
      created_at         TEXT NOT NULL,
      updated_at         TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
  `);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function nowISO(): string {
  return getSingaporeNow().toISOString();
}

function rowToTodo(row: Record<string, unknown>): Todo {
  return {
    id: row.id as number,
    user_id: row.user_id as number,
    title: row.title as string,
    completed: (row.completed as number) === 1,
    due_date: (row.due_date as string | null) ?? null,
    priority: (row.priority as Priority) ?? 'medium',
    is_recurring: (row.is_recurring as number) === 1,
    recurrence_pattern: (row.recurrence_pattern as RecurrencePattern | null) ?? null,
    reminder_minutes: (row.reminder_minutes as number | null) ?? null,
    last_notification_sent: (row.last_notification_sent as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
  };
}

// ─── User DB ────────────────────────────────────────────────────────────────

export const userDB = {
  getByUsername(username: string): User | null {
    const db = getDb();
    return db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as User | null;
  },

  getById(id: number): User | null {
    const db = getDb();
    return db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as User | null;
  },

  create(username: string): User {
    const db = getDb();
    const now = nowISO();
    const result = db
      .prepare('INSERT INTO users (username, created_at) VALUES (?, ?)')
      .run(username, now);
    return { id: result.lastInsertRowid as number, username, created_at: now };
  },
};

// ─── Authenticator DB ────────────────────────────────────────────────────────

export const authenticatorDB = {
  getByCredentialId(credentialId: string): Authenticator | null {
    const db = getDb();
    return db
      .prepare('SELECT * FROM authenticators WHERE credential_id = ?')
      .get(credentialId) as Authenticator | null;
  },

  getByUserId(userId: number): Authenticator[] {
    const db = getDb();
    return db
      .prepare('SELECT * FROM authenticators WHERE user_id = ?')
      .all(userId) as Authenticator[];
  },

  create(data: {
    user_id: number;
    credential_id: string;
    credential_public_key: string;
    counter: number;
    transports: string | null;
  }): Authenticator {
    const db = getDb();
    const now = nowISO();
    const result = db
      .prepare(
        `INSERT INTO authenticators
         (user_id, credential_id, credential_public_key, counter, transports, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.user_id,
        data.credential_id,
        data.credential_public_key,
        data.counter,
        data.transports,
        now
      );
    return { id: result.lastInsertRowid as number, ...data, created_at: now };
  },

  updateCounter(credentialId: string, counter: number): void {
    const db = getDb();
    db.prepare('UPDATE authenticators SET counter = ? WHERE credential_id = ?').run(
      counter,
      credentialId
    );
  },
};

// ─── Todo DB ─────────────────────────────────────────────────────────────────

export interface CreateTodoInput {
  user_id: number;
  title: string;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}

export interface UpdateTodoInput {
  title?: string;
  completed?: boolean;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  last_notification_sent?: string | null;
}

export interface ImportTodoInput extends CreateTodoInput {
  completed?: boolean;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  last_notification_sent?: string | null;
}

export const todoDB = {
  getByUserId(userId: number): Todo[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Record<string, unknown>[];
    return rows.map(rowToTodo);
  },

  getById(id: number): Todo | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM todos WHERE id = ?')
      .get(id) as Record<string, unknown> | null;
    return row ? rowToTodo(row) : null;
  },

  create(input: CreateTodoInput): Todo {
    const db = getDb();
    const now = nowISO();
    const result = db
      .prepare(
        `INSERT INTO todos
         (user_id, title, completed, due_date, priority, is_recurring,
          recurrence_pattern, reminder_minutes, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.user_id,
        input.title.trim(),
        input.due_date ?? null,
        input.priority ?? 'medium',
        input.is_recurring ? 1 : 0,
        input.recurrence_pattern ?? null,
        input.reminder_minutes ?? null,
        now,
        now
      );
    return this.getById(result.lastInsertRowid as number)!;
  },

  createFromImport(input: ImportTodoInput): Todo {
    const db = getDb();
    const createdAt = input.created_at ?? nowISO();
    const updatedAt = input.updated_at ?? createdAt;
    const completed = input.completed === true;
    const completedAt = completed ? input.completed_at ?? updatedAt : null;
    const result = db
      .prepare(
        `INSERT INTO todos
         (user_id, title, completed, due_date, priority, is_recurring,
          recurrence_pattern, reminder_minutes, last_notification_sent,
          created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.user_id,
        input.title.trim(),
        completed ? 1 : 0,
        input.due_date ?? null,
        input.priority ?? 'medium',
        input.is_recurring ? 1 : 0,
        input.recurrence_pattern ?? null,
        input.reminder_minutes ?? null,
        input.last_notification_sent ?? null,
        createdAt,
        updatedAt,
        completedAt
      );

    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, input: UpdateTodoInput): Todo | null {
    const db = getDb();
    const current = this.getById(id);
    if (!current) return null;

    const now = nowISO();
    const completedAt =
      input.completed === true && !current.completed
        ? now
        : input.completed === false
        ? null
        : current.completed_at;

    db.prepare(
      `UPDATE todos SET
        title                  = ?,
        completed              = ?,
        due_date               = ?,
        priority               = ?,
        is_recurring           = ?,
        recurrence_pattern     = ?,
        reminder_minutes       = ?,
        last_notification_sent = ?,
        completed_at           = ?,
        updated_at             = ?
       WHERE id = ?`
    ).run(
      input.title !== undefined ? input.title.trim() : current.title,
      input.completed !== undefined ? (input.completed ? 1 : 0) : current.completed ? 1 : 0,
      input.due_date !== undefined ? input.due_date : current.due_date,
      input.priority !== undefined ? input.priority : current.priority,
      input.is_recurring !== undefined ? (input.is_recurring ? 1 : 0) : current.is_recurring ? 1 : 0,
      input.recurrence_pattern !== undefined ? input.recurrence_pattern : current.recurrence_pattern,
      input.reminder_minutes !== undefined ? input.reminder_minutes : current.reminder_minutes,
      input.last_notification_sent !== undefined ? input.last_notification_sent : current.last_notification_sent,
      completedAt,
      now,
      id
    );
    return this.getById(id);
  },

  delete(id: number): void {
    const db = getDb();
    db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  },

  getOverdue(userId: number): Todo[] {
    const db = getDb();
    const now = nowISO();
    const rows = db
      .prepare(
        `SELECT * FROM todos
         WHERE user_id = ? AND completed = 0
           AND due_date IS NOT NULL AND due_date < ?
         ORDER BY due_date ASC`
      )
      .all(userId, now) as Record<string, unknown>[];
    return rows.map(rowToTodo);
  },

  updateLastNotificationSent(id: number, sentAt: string): void {
    const db = getDb();
    db.prepare(
      'UPDATE todos SET last_notification_sent = ? WHERE id = ?'
    ).run(sentAt, id);
  },

  /**
   * Returns all incomplete todos for a user whose reminder time has passed
   * and hasn't been notified yet (or was notified before the current reminder window).
   */
  getDueReminders(userId: number, nowISO: string): Todo[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM todos
         WHERE user_id = ?
           AND completed = 0
           AND reminder_minutes IS NOT NULL
           AND due_date IS NOT NULL
           AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= datetime(?)
           AND (
             last_notification_sent IS NULL
             OR last_notification_sent < datetime(due_date, '-' || reminder_minutes || ' minutes')
           )`
      )
      .all(userId, nowISO) as Record<string, unknown>[];
    return rows.map(rowToTodo);
  },
};

export const holidayDB = {
  getByYear(year: number): Holiday[] {
    const db = getDb();
    return db
      .prepare('SELECT * FROM holidays WHERE year = ? ORDER BY date')
      .all(year) as Holiday[];
  },

  getByDateRange(from: string, to: string): Holiday[] {
    const db = getDb();
    return db
      .prepare('SELECT * FROM holidays WHERE date >= ? AND date <= ? ORDER BY date')
      .all(from, to) as Holiday[];
  },

  upsert(data: { date: string; name: string; year: number }): void {
    const db = getDb();
    db.prepare(
      'INSERT OR REPLACE INTO holidays (date, name, year) VALUES (?, ?, ?)'
    ).run(data.date, data.name, data.year);
};

function rowToSubtask(row: Record<string, unknown>): Subtask {
  return {
    id: row.id as number,
    todo_id: row.todo_id as number,
    title: row.title as string,
    completed: (row.completed as number) === 1,
    position: row.position as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export const subtaskDB = {
  getByTodoId(todoId: number): Subtask[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position, created_at')
      .all(todoId) as Record<string, unknown>[];
    return rows.map(rowToSubtask);
  },

  getByTodoIds(todoIds: number[]): Subtask[] {
    if (todoIds.length === 0) return [];
    const db = getDb();
    const placeholders = todoIds.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT * FROM subtasks WHERE todo_id IN (${placeholders}) ORDER BY todo_id, position, created_at`)
      .all(...todoIds) as Record<string, unknown>[];
    return rows.map(rowToSubtask);
  },

  getById(id: number): Subtask | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM subtasks WHERE id = ?')
      .get(id) as Record<string, unknown> | null;
    return row ? rowToSubtask(row) : null;
  },

  create(data: CreateSubtaskInput): Subtask {
    const db = getDb();
    const maxPos = db
      .prepare('SELECT MAX(position) as m FROM subtasks WHERE todo_id = ?')
      .get(data.todo_id) as { m: number | null };
    const position = (maxPos.m ?? -1) + 1;
    const now = nowISO();
    const result = db
      .prepare(
        'INSERT INTO subtasks (todo_id, title, completed, position, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)'
      )
      .run(data.todo_id, data.title.trim(), position, now, now);
    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, data: { completed?: boolean }): Subtask | null {
    const db = getDb();
    const now = nowISO();
    db.prepare('UPDATE subtasks SET completed = ?, updated_at = ? WHERE id = ?')
      .run(data.completed ? 1 : 0, now, id);
    return this.getById(id);
  },

  delete(id: number): void {
    const db = getDb();
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);
  },
};

// ─── Tag DB ───────────────────────────────────────────────────────────────────

function rowToTag(row: Record<string, unknown>): Tag {
  return {
    id: row.id as number,
    user_id: row.user_id as number,
    name: row.name as string,
    color: row.color as string,
    created_at: row.created_at as string,
  };
}

export const tagDB = {
  getByUserId(userId: number): Tag[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name')
      .all(userId) as Record<string, unknown>[];
    return rows.map(rowToTag);
  },

  getByTodoId(todoId: number): Tag[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT t.* FROM tags t
         JOIN todo_tags tt ON tt.tag_id = t.id
         WHERE tt.todo_id = ?
         ORDER BY t.name`
      )
      .all(todoId) as Record<string, unknown>[];
    return rows.map(rowToTag);
  },

  getByTodoIds(todoIds: number[]): Array<{ todo_id: number } & Tag> {
    if (todoIds.length === 0) return [];
    const db = getDb();
    const placeholders = todoIds.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT t.*, tt.todo_id FROM tags t
         JOIN todo_tags tt ON tt.tag_id = t.id
         WHERE tt.todo_id IN (${placeholders})
         ORDER BY t.name`
      )
      .all(...todoIds) as Record<string, unknown>[];
    return rows.map((row) => ({ ...rowToTag(row), todo_id: row.todo_id as number }));
  },

  getById(id: number): Tag | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM tags WHERE id = ?')
      .get(id) as Record<string, unknown> | null;
    return row ? rowToTag(row) : null;
  },

  create(data: { user_id: number; name: string; color: string }): Tag {
    const db = getDb();
    const now = nowISO();
    const result = db
      .prepare('INSERT INTO tags (user_id, name, color, created_at) VALUES (?, ?, ?, ?)')
      .run(data.user_id, data.name.trim(), data.color, now);
    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, data: { name?: string; color?: string }): Tag | null {
    const db = getDb();
    if (data.name !== undefined) {
      db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(data.name.trim(), id);
    }
    if (data.color !== undefined) {
      db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(data.color, id);
    }
    return this.getById(id);
  },

  delete(id: number): void {
    const db = getDb();
    db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    // todo_tags rows cascade automatically via FK
  },

  setTodoTags(todoId: number, tagIds: number[]): void {
    const db = getDb();
    db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(todoId);
    if (tagIds.length > 0) {
      const insert = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
      tagIds.forEach((tagId) => insert.run(todoId, tagId));
    }
  },
};

// ─── Template DB ──────────────────────────────────────────────────────────────

function rowToTemplate(row: Record<string, unknown>): Template {
  return {
    id: row.id as number,
    user_id: row.user_id as number,
    name: row.name as string,
    title_template: row.title_template as string,
    description: (row.description as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    priority: (row.priority as Priority) ?? 'medium',
    is_recurring: (row.is_recurring as number) === 1,
    recurrence_pattern: (row.recurrence_pattern as RecurrencePattern | null) ?? null,
    reminder_minutes: (row.reminder_minutes as number | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export const templateDB = {
  getByUserId(userId: number): Template[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY name')
      .all(userId) as Record<string, unknown>[];
    return rows.map(rowToTemplate);
  },

  getById(id: number, userId: number): Template | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?')
      .get(id, userId) as Record<string, unknown> | null;
    return row ? rowToTemplate(row) : null;
  },

  create(data: CreateTemplateInput): Template {
    const db = getDb();
    const now = nowISO();
    const result = db
      .prepare(
        `INSERT INTO templates
         (user_id, name, title_template, description, category, priority,
          is_recurring, recurrence_pattern, reminder_minutes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.user_id,
        data.name.trim(),
        data.title_template.trim(),
        data.description?.trim() ?? null,
        data.category?.trim() ?? null,
        data.priority,
        data.is_recurring ? 1 : 0,
        data.recurrence_pattern ?? null,
        data.reminder_minutes ?? null,
        now,
        now
      );
    return this.getById(result.lastInsertRowid as number, data.user_id)!;
  },

  delete(id: number, userId: number): void {
    const db = getDb();
    db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId);
  },
};
