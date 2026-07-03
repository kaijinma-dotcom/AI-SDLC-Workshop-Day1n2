// lib/filterPresets.ts
// localStorage CRUD for named filter presets (PRP 08).

import type { FilterState } from './filters';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'todo-filter-presets';

export function getPresets(): FilterPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as FilterPreset[];
  } catch {
    return [];
  }
}

export function savePreset(name: string, filters: FilterState): FilterPreset {
  const preset: FilterPreset = { id: Date.now().toString(), name, filters };
  const existing = getPresets();
  existing.push(preset);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  return preset;
}

export function deletePreset(id: string): void {
  const updated = getPresets().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
