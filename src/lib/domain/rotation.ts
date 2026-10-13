// Roster generation helpers: rotation patterns, copy last week, bulk assign.

import { addDays, dateRange, diffDays } from "./time";

export interface GeneratedAssignment {
  employeeId: string;
  date: string;
  templateId: string;
}

/**
 * Applies a repeating pattern (template ids, null = no shift) to employees from `start` for `weeks`.
 * `staggerDays` offsets each successive employee so a 4-on/4-off team covers every day.
 */
export function applyRotation(opts: {
  employeeIds: string[];
  start: string;
  weeks: number;
  pattern: Array<string | null>;
  staggerDays?: number;
}): GeneratedAssignment[] {
  const { employeeIds, start, weeks, pattern, staggerDays = 0 } = opts;
  if (!pattern.length) return [];
  const days = dateRange(start, addDays(start, weeks * 7 - 1));
  const out: GeneratedAssignment[] = [];
  employeeIds.forEach((employeeId, idx) => {
    days.forEach((date, d) => {
      const slot = pattern[(((d + idx * staggerDays) % pattern.length) + pattern.length) % pattern.length];
      if (slot) out.push({ employeeId, date, templateId: slot });
    });
  });
  return out;
}

export function copyWeek<T extends { date: string }>(items: T[], fromWeekStart: string, toWeekStart: string): T[] {
  const shift = diffDays(fromWeekStart, toWeekStart);
  return items.map((i) => ({ ...i, date: addDays(i.date, shift) }));
}

export function bulkAssign(employeeIds: string[], dates: string[], templateId: string): GeneratedAssignment[] {
  return employeeIds.flatMap((employeeId) => dates.map((date) => ({ employeeId, date, templateId })));
}

/** Parses "D12,D12,D12,D12,OFF,OFF,OFF,OFF" into template ids via code lookup. */
export function parsePattern(text: string, codeToId: Map<string, string>): { pattern: Array<string | null>; errors: string[] } {
  const errors: string[] = [];
  const pattern = text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((c) => {
      const code = c.toUpperCase();
      if (code === "OFF" || code === "-") return null;
      const id = codeToId.get(code);
      if (!id) errors.push(`Unknown shift code "${c}".`);
      return id ?? null;
    });
  return { pattern, errors };
}
