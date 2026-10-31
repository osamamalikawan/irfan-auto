// When is a route visited?  Three route types:
//   weekly       every week on its visit days
//   fortnightly  every second week, counted from the week of cycle_start
//   monthly      once a month: the 1st-4th (or last) occurrence of each visit day in the month
// Dates are YYYY-MM-DD strings; all arithmetic is done at noon UTC so time zones never shift a day.

export type Freq = "weekly" | "fortnightly" | "monthly";
export type Sched = { frequency: Freq; visit_days: string[]; cycle_start: string | null; month_week: number | null };

export const FREQ_LABEL: Record<Freq, string> = { weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly" };
export const MONTH_WEEKS: [number, string][] = [[1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [5, "Last"]];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86400000;

export const utc = (iso: string) => new Date(iso + "T12:00:00Z");
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const weekdayName = (s: string) => WD[utc(s).getUTCDay()];
export const addDays = (s: string, n: number) => iso(new Date(utc(s).getTime() + n * DAY_MS));
export const mondayOf = (s: string) => addDays(s, -((utc(s).getUTCDay() + 6) % 7));
export const daysInMonth = (ym: string) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
export const monthLabel = (ym: string) => utc(ym + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const shiftMonth = (ym: string, n: number) => { const d = utc(ym + "-01"); d.setUTCMonth(d.getUTCMonth() + n); return iso(d).slice(0, 7); };

export function isVisitDate(s: Sched, date: string): boolean {
  if (!s.visit_days.includes(weekdayName(date))) return false;
  if (s.frequency === "weekly") return true;
  if (s.frequency === "fortnightly") {
    const anchor = mondayOf(s.cycle_start ?? "2000-01-03");   // 2000-01-03 was a Monday
    const weeks = Math.round((utc(mondayOf(date)).getTime() - utc(anchor).getTime()) / (7 * DAY_MS));
    return ((weeks % 2) + 2) % 2 === 0;
  }
  const day = +date.slice(8, 10), ym = date.slice(0, 7);
  const nth = Math.floor((day - 1) / 7) + 1, isLast = day + 7 > daysInMonth(ym);
  const w = s.month_week ?? 1;
  return w === 5 ? isLast : nth === w;
}

export function monthDates(s: Sched, ym: string): string[] {
  const out: string[] = [];
  for (let d = 1; d <= daysInMonth(ym); d++) {
    const date = ym + "-" + String(d).padStart(2, "0");
    if (isVisitDate(s, date)) out.push(date);
  }
  return out;
}

/** Weeks of the month as rows of 7 dates (Mon..Sun), padded with days of the neighbouring months. */
export function monthGrid(ym: string): { date: string; inMonth: boolean }[][] {
  const first = ym + "-01", last = ym + "-" + String(daysInMonth(ym)).padStart(2, "0");
  const rows: { date: string; inMonth: boolean }[][] = [];
  for (let start = mondayOf(first); start <= last; start = addDays(start, 7)) {
    rows.push(Array.from({ length: 7 }, (_, i) => { const date = addDays(start, i); return { date, inMonth: date.slice(0, 7) === ym }; }));
  }
  return rows;
}

export function describeSchedule(s: Sched): string {
  if (!s.visit_days.length) return "No visit day";
  const days = s.visit_days.join(", ");
  if (s.frequency === "weekly") return "Every week · " + days;
  if (s.frequency === "fortnightly") return "Every 2nd week · " + days;
  const w = MONTH_WEEKS.find(([n]) => n === (s.month_week ?? 1))?.[1] ?? "1st";
  return "Monthly · " + w + " " + s.visit_days.join(" and ");
}

export const cleanFreq = (v: unknown): Freq => (v === "fortnightly" || v === "monthly" ? v : "weekly");

export const cleanDate = (v: unknown): string | null => (/^\d{4}-\d\d-\d\d$/.test(String(v ?? "")) ? String(v) : null);
export const cleanMonthWeek = (v: unknown): number | null => { const n = Math.round(Number(v)); return n >= 1 && n <= 5 ? n : null; };
export const VISIT_OUTCOMES = ["Visited", "Order placed", "Payment collected", "No order", "Customer closed", "Customer unavailable", "Rescheduled", "Cancelled"] as const;
