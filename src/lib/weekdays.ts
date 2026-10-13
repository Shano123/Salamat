const DAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function parseWeekend(s: string): number[] {
  if (!s.trim()) return [5, 6];
  return s
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map((x) => {
      const k = x.slice(0, 3).toLowerCase();
      if (k in DAYS) return DAYS[k];
      const n = Number(x);
      if (Number.isInteger(n) && n >= 0 && n <= 6) return n;
      throw new Error(`Unknown weekday "${x}".`);
    });
}

