// Date/time helpers. Calendar dates are ISO strings ("2026-10-13"); instants are Date.
// Shift times are minutes from local midnight in the location's timezone.

export const MIN = 60_000;
export const DAY_MIN = 1440;

export function toDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDays(iso: string, n: number): string {
  const d = parseDateISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateISO(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDateISO(b).getTime() - parseDateISO(a).getTime()) / (DAY_MIN * MIN));
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(iso: string): number {
  return parseDateISO(iso).getUTCDay();
}

/** Week starts on Sunday (Saudi working week). */
export function weekStartOf(iso: string, weekStartsOn = 0): string {
  const dow = dayOfWeek(iso);
  return addDays(iso, -((dow - weekStartsOn + 7) % 7));
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthRange(iso: string): { from: string; to: string } {
  const from = `${iso.slice(0, 7)}-01`;
  const d = parseDateISO(from);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { from, to: toDateISO(d) };
}

/** Offset in minutes of `tz` from UTC at the given instant (Riyadh → +180). */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / MIN);
}

/** Local wall-clock (date + minutes after midnight) in `tz` → UTC instant. */
export function zonedToUtc(dateISO: string, minutes: number, tz: string): Date {
  const naive = parseDateISO(dateISO).getTime() + minutes * MIN;
  const offset = tzOffsetMinutes(tz, new Date(naive));
  const guess = new Date(naive - offset * MIN);
  const offset2 = tzOffsetMinutes(tz, guess);
  return offset2 === offset ? guess : new Date(naive - offset2 * MIN);
}

/** UTC instant → local calendar date in `tz`. */
export function localDateISO(at: Date, tz: string): string {
  return toDateISO(new Date(at.getTime() + tzOffsetMinutes(tz, at) * MIN));
}

/** UTC instant → minutes after local midnight in `tz`. */
export function localMinutes(at: Date, tz: string): number {
  const local = new Date(at.getTime() + tzOffsetMinutes(tz, at) * MIN);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

export function minutesToHHMM(m: number): string {
  const n = ((m % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

export function hhmmToMinutes(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Invalid time "${s}"`);
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59 || (h === 24 && mm > 0)) throw new Error(`Invalid time "${s}"`);
  return h * 60 + mm;
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MIN);
}

export function formatTime(at: Date, tz: string): string {
  return minutesToHHMM(localMinutes(at, tz));
}

export function isWithin(iso: string, from?: string | null, to?: string | null): boolean {
  if (!from || !to) return false;
  return iso >= from && iso <= to;
}

/** Umm al-Qura Hijri rendering of a calendar date, for optional display next to Gregorian. */
export function hijri(iso: string, locale: "en" | "ar" | "ur" = "en"): string {
  const tag = locale === "ar" ? "ar-SA" : locale === "ur" ? "ur-PK" : "en";
  try {
    return new Intl.DateTimeFormat(`${tag}-u-ca-islamic-umalqura`, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(parseDateISO(iso));
  } catch {
    return "";
  }
}
