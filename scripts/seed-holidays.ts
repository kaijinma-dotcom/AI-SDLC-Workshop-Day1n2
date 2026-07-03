import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'todos.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS holidays (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    date  TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL,
    year  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
  CREATE INDEX IF NOT EXISTS idx_holidays_year ON holidays(year);
`);

const upsert = db.prepare(
  'INSERT OR REPLACE INTO holidays (date, name, year) VALUES (?, ?, ?)'
);

const SG_HOLIDAYS_2025 = [
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-29', name: 'Chinese New Year' },
  { date: '2025-01-30', name: 'Chinese New Year (Day 2)' },
  { date: '2025-03-31', name: 'Hari Raya Puasa' },
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-05-01', name: 'Labour Day' },
  { date: '2025-05-12', name: 'Vesak Day' },
  { date: '2025-06-07', name: 'Hari Raya Haji' },
  { date: '2025-08-09', name: 'National Day' },
  { date: '2025-10-20', name: 'Deepavali' },
  { date: '2025-12-25', name: 'Christmas Day' },
];

const SG_HOLIDAYS_2026 = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-01-28', name: 'Chinese New Year' },
  { date: '2026-01-29', name: 'Chinese New Year (Day 2)' },
  { date: '2026-03-20', name: 'Hari Raya Puasa' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-05-31', name: 'Vesak Day' },
  { date: '2026-05-27', name: 'Hari Raya Haji' },
  { date: '2026-08-09', name: 'National Day' },
  { date: '2026-11-08', name: 'Deepavali' },
  { date: '2026-12-25', name: 'Christmas Day' },
];

const insertMany = db.transaction(
  (holidays: { date: string; name: string }[], year: number) => {
    for (const holiday of holidays) {
      upsert.run(holiday.date, holiday.name, year);
    }
  }
);

insertMany(SG_HOLIDAYS_2025, 2025);
insertMany(SG_HOLIDAYS_2026, 2026);

console.log(
  `✅ Seeded ${SG_HOLIDAYS_2025.length + SG_HOLIDAYS_2026.length} Singapore holidays (2025–2026)`
);

db.close();
